#!/usr/bin/env python3
"""Reproducible, sample-free instrumental bed for AI Mini Office promo edits.

Requires Python 3 + NumPy. Uses no sample packs, recordings, downloads or APIs.
Default: 70 seconds, 90 BPM, 48 kHz, stereo, 24-bit PCM WAV. The authored score
has a small introduction, two answering phrases and a resolving, six-second
tail. Editors can trim the WAV and apply their own final fade to shorter cuts.

Run from any directory:
    python3 office/scripts/promo/synthesize-workshop-music.py
    python3 office/scripts/promo/synthesize-workshop-music.py --duration 45

The musical score and synthesis are project-authored; this provenance statement
is not a guarantee about copyright or rights in every jurisdiction.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import wave

try:
    import numpy as np
except ImportError as error:
    raise SystemExit("This generator requires NumPy; no audio samples are needed.") from error


ROOT = Path(__file__).resolve().parents[3]
SEED = 20261029

# Deliberately voiced with common tones and modest register changes. Bass MIDI
# notes are kept separate from the midrange pad so the picture stays unhurried.
CHORDS = {
    "Cmaj9": (36, (48, 55, 59, 62, 64)),
    "Am7": (33, (48, 55, 57, 60, 64)),
    "Fmaj9": (29, (48, 53, 57, 60, 64)),
    "Gsus6": (31, (50, 55, 57, 60, 64)),
    "C6/E": (40, (48, 55, 57, 60, 64)),
    "Dm9": (38, (50, 53, 57, 60, 64)),
    "G13": (31, (50, 53, 55, 59, 64)),
    "C6": (36, (48, 55, 57, 60, 64)),
}
PROGRESSION = ("Cmaj9", "Am7", "Fmaj9", "Gsus6", "C6/E", "Dm9", "G13", "Cmaj9")

# Each event is (beat, MIDI note, held beats). These are authored phrases, not a
# random walk over a scale. Space between notes is part of the arrangement.
MELODY_A = (
    ((0.0, 76, 1.25), (1.5, 74, .5), (2.5, 67, 1), (3.5, 71, .45)),
    ((.25, 72, 1), (1.5, 76, 1.5), (3.25, 74, .5)),
    ((0.0, 69, 1.5), (2.0, 67, .75), (3.0, 64, .9)),
    ((.5, 74, 1.25), (2.0, 71, .5), (3.0, 69, .75)),
    ((0.0, 67, .75), (1.0, 76, 1.5), (3.0, 74, .75)),
    ((.5, 65, 1), (2.0, 69, .75), (3.0, 72, .75)),
    ((0.0, 71, 1.5), (2.0, 69, .75), (3.0, 67, .9)),
    ((0.0, 76, 1.75), (2.5, 74, .5), (3.25, 72, .65)),
)
MELODY_B = (
    ((.25, 67, .75), (1.25, 72, .75), (2.5, 76, 1.2)),
    ((0.0, 76, .75), (1.0, 79, 1.25), (2.75, 76, .9)),
    ((.5, 77, 1), (2.0, 76, .75), (3.0, 72, .9)),
    ((0.0, 74, 1.5), (2.0, 72, .75), (3.0, 69, .75)),
    ((.5, 76, 1.25), (2.25, 74, .5), (3.0, 72, .75)),
    ((0.0, 69, .75), (1.25, 72, 1), (2.75, 76, .8)),
    ((.25, 74, 1), (1.75, 71, .75), (3.0, 67, .9)),
    ((0.0, 72, 2.5),),
)
OUTRO = (
    ((.5, 69, 1.5), (2.75, 67, .75)),
    ((.25, 65, 1.25), (2.5, 64, 1)),
    ((.5, 71, 1), (2.0, 74, .75)),
    ((0.0, 72, 3.5),),
)


def frequency(note: float) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def db(value: float) -> float:
    return round(20 * math.log10(max(value, 1e-12)), 3)


class WorkshopSynth:
    def __init__(self, duration: float, bpm: float, rate: int, seed: int):
        self.duration, self.bpm, self.rate = duration, bpm, rate
        self.beat = 60 / bpm
        self.bar = self.beat * 4
        self.rng = np.random.default_rng(seed)
        self.audio = np.zeros((round(duration * rate), 2), dtype=np.float64)
        self.events = {"pad": 0, "keys": 0, "pluck": 0, "bass": 0, "kick": 0, "brush": 0, "shaker": 0}

    def time(self, duration: float):
        return np.arange(max(1, round(duration * self.rate)), dtype=np.float64) / self.rate

    def add(self, signal, at: float, gain: float, pan: float = 0):
        start = round(at * self.rate)
        if start >= len(self.audio):
            return
        if start < 0:
            signal, start = signal[-start:], 0
        length = min(len(signal), len(self.audio) - start)
        angle = (max(-1, min(1, pan)) + 1) * math.pi / 4
        self.audio[start:start + length, 0] += signal[:length] * gain * math.cos(angle)
        self.audio[start:start + length, 1] += signal[:length] * gain * math.sin(angle)

    def pad(self, note, at, duration, gain, pan):
        t = self.time(duration)
        f = frequency(note)
        phase = self.rng.uniform(0, math.tau)
        # A very small, fixed detuning supplies width without a chorus plug-in.
        tone = (.55 * np.sin(math.tau * f * t + phase)
                + .30 * np.sin(math.tau * f * 1.0011 * t + phase + .2)
                + .15 * np.sin(math.tau * f * .9989 * t + phase - .2)
                + .075 * np.sin(math.tau * f * 2 * t + phase))
        attack = np.sin(np.minimum(t / .72, 1) * math.pi / 2) ** 2
        release = np.sin(np.minimum((duration - t) / 1.6, 1) * math.pi / 2) ** 2
        movement = .98 + .02 * np.sin(math.tau * .13 * t + phase)
        self.add(tone * attack * release * movement, at, gain, pan)
        self.events["pad"] += 1

    def key(self, note, at, held, gain, pan):
        duration = held + 1.25
        t = self.time(duration)
        f = frequency(note)
        # Soft, tine-like keys: weak, rapidly decaying upper partials and an
        # 18ms rounded attack. No narrow high-frequency bell transient.
        tone = (np.sin(math.tau * f * t + .10 * np.sin(math.tau * 2 * f * t) * np.exp(-t * 6))
                + .16 * np.sin(math.tau * 2 * f * t + .1) * np.exp(-t * 2.2)
                + .025 * np.sin(math.tau * 3.002 * f * t) * np.exp(-t * 4.5))
        attack = 1 - np.exp(-t / .018)
        decay = np.exp(-t / max(.72, held + .12))
        release = np.minimum((duration - t) / .28, 1) ** 2
        self.add(tone * attack * decay * release, at, gain, pan)
        self.events["keys"] += 1

    def pluck(self, note, at, gain, pan):
        t = self.time(1.8)
        f, tone = frequency(note), np.zeros_like(t)
        for harmonic in range(1, 10):
            if harmonic * f > 5200:
                break
            # Nylon-like partials decay faster as frequency rises. The varying
            # pluck position makes fixed authored notes feel gently played.
            position = .20 + self.rng.uniform(-.025, .025)
            strength = math.sin(math.pi * harmonic * position) / harmonic ** 1.65
            tone += strength * np.sin(math.tau * f * harmonic * t) * np.exp(-t * (1.65 + harmonic * .39))
        envelope = (1 - np.exp(-t / .006)) * np.minimum((1.8 - t) / .2, 1) ** 2
        self.add(tone * envelope, at, gain, pan)
        self.events["pluck"] += 1

    def bass(self, note, at, duration, gain):
        t, f = self.time(duration), frequency(note)
        tone = np.sin(math.tau * f * t) + .22 * np.sin(math.tau * 2 * f * t)
        envelope = (1 - np.exp(-t / .04)) * np.exp(-t / 1.25) * np.minimum((duration - t) / .25, 1) ** 2
        self.add(tone * envelope, at, gain)
        self.events["bass"] += 1

    def percussion(self, kind, at, gain, pan=0):
        duration = {"kick": .3, "brush": .18, "shaker": .09}[kind]
        t = self.time(duration)
        if kind == "kick":
            # Integrated 42Hz base + a quickly decaying pitch lift.
            phase = math.tau * (42 * t + 24 * .025 * (1 - np.exp(-t / .025)))
            signal = np.sin(phase) * np.exp(-t * 19) * (1 - np.exp(-t / .004))
        else:
            noise = self.rng.normal(0, 1, len(t))
            width = 8 if kind == "shaker" else 13
            smooth = np.convolve(noise, np.ones(width) / width, mode="same")
            low = np.convolve(noise, np.ones(width * 5) / (width * 5), mode="same")
            signal = (smooth - low) * np.exp(-t * (49 if kind == "shaker" else 27)) * (1 - np.exp(-t / .003))
        signal *= np.minimum((duration - t) / .025, 1) ** 2
        self.add(signal, at, gain, pan)
        self.events[kind] += 1

    def compose(self):
        # At the default length this is exactly 24 four-beat bars plus 6s of
        # resolving tail. Shorter CLI renders get their own four-bar coda.
        bars = max(4, math.floor((self.duration - 6) / self.bar + 1e-8))
        intro = min(4, max(1, bars // 6))
        ending = bars - 4
        for index in range(bars):
            at = index * self.bar
            if index >= ending:
                chord_name = ("Fmaj9", "Dm9", "G13", "C6")[index - ending]
            else:
                chord_name = PROGRESSION[(index - intro) % len(PROGRESSION)] if index >= intro else ("Cmaj9", "Am7", "Fmaj9", "Gsus6")[index % 4]
            bass, voices = CHORDS[chord_name]
            is_final = index == bars - 1
            # Arrangement energy rises smoothly, then sheds percussion before
            # the final tonic rather than using a sudden stop or a hard loop.
            energy = .60 + .40 * min(index / max(intro, 1), 1)
            if index >= ending:
                energy *= 1 - .13 * (index - ending)
            pad_duration = self.duration - at - .2 if is_final else self.bar + 1.2
            for voice, note in enumerate(voices):
                self.pad(note, at, pad_duration, .023 * energy, (voice - 2) * .22)
            self.bass(bass, at + .01, 3 if is_final else 1.8, .070 * energy)
            if intro <= index < ending:
                self.bass(bass + 7, at + 2.5 * self.beat, 1.25, .034 * energy)

            # Low arpeggio keeps a recognisable little workshop pulse. The
            # final bar lands once and leaves its room tail to settle.
            pattern = ((0, 0), (.75, 2), (1.5, 3), (2.5, 1), (3.25, 4))
            if is_final:
                pattern = ((0, 0), (.08, 2), (.16, 3))
            elif index < intro:
                pattern = pattern[::2]
            for beat, voice in pattern:
                jitter = self.rng.uniform(-.009, .009)
                self.key(voices[voice], at + beat * self.beat + jitter, .85, .039 * energy * self.rng.uniform(.92, 1.05), -.24)
            if index < bars - 2:
                for n, beat in enumerate((.5, 1.5, 2.5, 3.5)):
                    if index < intro and n % 2:
                        continue
                    note = voices[(n * 2 + index) % 5] + (12 if n == 2 else 0)
                    self.pluck(note, at + beat * self.beat + self.rng.uniform(-.012, .012), .058 * energy * (.8 if index < intro else 1), .30)

            if index >= ending:
                melody = OUTRO[index - ending]
            elif index >= intro:
                phrase = index - intro
                melody = (MELODY_A if phrase < 8 else MELODY_B)[phrase % 8]
            else:
                melody = ()
            for beat, note, hold in melody:
                self.key(note, at + beat * self.beat + self.rng.uniform(-.012, .012), hold * self.beat, .041 * energy, .08)

            if intro <= index < ending:
                for beat in (0, 2):
                    self.percussion("kick", at + beat * self.beat, .042 * energy)
                for beat in (1, 3):
                    self.percussion("brush", at + beat * self.beat + .012, .027 * energy, -.10)
                for step in range(8):
                    # A tiny 53% swing and alternating touch avoid a rigid,
                    # metronomic hi-hat under the screen recording.
                    beat = step / 2 + (.03 if step % 2 else 0)
                    self.percussion("shaker", at + beat * self.beat, (.018 if step % 2 else .012) * energy, .22)

        dry = self.audio.copy()
        for seconds, amount in ((.061, .055), (.097, .045), (.163, .035), (.251, .025), (.389, .018)):
            delay = round(seconds * self.rate)
            self.audio[delay:] += dry[:-delay, ::-1] * amount
        self.audio -= np.mean(self.audio, axis=0)
        fade_in, fade_out = round(1.7 * self.rate), round(5.2 * self.rate)
        self.audio[:fade_in] *= np.sin(np.linspace(0, math.pi / 2, fade_in))[:, None] ** 2
        self.audio[-fade_out:] *= np.sin(np.linspace(math.pi / 2, 0, fade_out))[:, None] ** 2
        # A low-level bed with generous mixing headroom; no hard clip/limiter.
        rms = float(np.sqrt(np.mean(self.audio ** 2)))
        peak = float(np.max(np.abs(self.audio)))
        gain = min(10 ** (-22 / 20) / rms, 10 ** (-3 / 20) / peak)
        self.audio *= gain
        return {"bars": bars, "bodySeconds": round(bars * self.bar, 6), "tailSeconds": round(self.duration - bars * self.bar, 6), "events": self.events}


def write_wave(file: Path, audio, rate: int):
    # Deterministic 24-bit PCM. No stochastic dither at this already very low
    # quantisation floor, so equal arguments reproduce identical file bytes.
    integer = np.rint(np.clip(audio, -1, 1) * (2 ** 23 - 1)).astype(np.int32).reshape(-1)
    packed = np.empty((len(integer), 3), dtype=np.uint8)
    for byte in range(3):
        packed[:, byte] = (integer >> (8 * byte)) & 255
    file.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(file), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(3)
        output.setframerate(rate)
        output.writeframes(packed.tobytes())


def loudness(file: Path):
    if not shutil.which("ffmpeg"):
        return {"method": "sample peak/RMS only; ffmpeg is unavailable"}
    run = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(file), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, check=True)
    summary = run.stderr.rsplit("Summary:", 1)[-1]
    def number(pattern):
        match = re.search(pattern, summary)
        return float(match.group(1)) if match else None
    return {"method": "ffmpeg ebur128 (ITU-R BS.1770)", "integratedLUFS": number(r"\bI:\s+(-?[\d.]+) LUFS"), "loudnessRangeLU": number(r"\bLRA:\s+([\d.]+) LU"), "truePeakDBFS": number(r"Peak:\s+(-?[\d.]+) dBFS")}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--duration", type=float, default=70, help="Seconds, 20–180; default 70")
    parser.add_argument("--bpm", type=float, default=90, help="Tempo, 75–105; default 90")
    parser.add_argument("--sample-rate", type=int, choices=(44100, 48000), default=48000)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 20 <= args.duration <= 180 or not 75 <= args.bpm <= 105:
        parser.error("Choose duration 20–180 seconds and tempo 75–105 BPM.")
    output = args.output or ROOT / "dist-mini-office/promo/audio" / f"workshop-warm-{args.bpm:g}bpm-{args.duration:g}s.wav"
    synth = WorkshopSynth(args.duration, args.bpm, args.sample_rate, args.seed)
    arrangement = synth.compose()
    write_wave(output, synth.audio, args.sample_rate)
    peak = float(np.max(np.abs(synth.audio)))
    metrics = {"durationSeconds": len(synth.audio) / args.sample_rate, "sampleRate": args.sample_rate, "channels": 2, "pcmBits": 24, "samplePeakDBFS": db(peak), "rmsDBFS": db(float(np.sqrt(np.mean(synth.audio ** 2)))), "clippedSamples": int(np.count_nonzero(np.abs(synth.audio) >= 1)), "channelCorrelation": round(float(np.corrcoef(synth.audio.T)[0, 1]), 6), "firstSample": synth.audio[0].tolist(), "lastSample": synth.audio[-1].tolist(), **loudness(output)}
    report = {"title": "A Little Room, Quietly Working", "provenance": "Program-synthesized for AI Mini Office from a project-authored score; no external samples, recordings or downloaded music.", "copyrightNote": "Provenance describes the process, not an absolute copyright guarantee.", "generator": str(Path(__file__).relative_to(ROOT)), "seed": args.seed, "bpm": args.bpm, "arrangement": arrangement, "metrics": metrics, "output": str(output.resolve()), "bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "editorNotes": "48 kHz stereo PCM with headroom. For shorter edits, trim the desired section and apply a 2–4 second audio fade; the full arrangement already has a resolving final chord and natural tail."}
    output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
