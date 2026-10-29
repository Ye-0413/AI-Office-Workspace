#!/usr/bin/env python3
"""Render real App capture films from an explicit, reproducible shot manifest.

Python 3 + Pillow, ffmpeg/libx264 and ffprobe are required. No UI automation.
Input paths are relative to the manifest unless absolute. The main schema is:
  {"music":"bed.wav", "versions":[{"id":"landscape", "width":1920,
    "height":1080, "output":"film.mp4", "title":{"zh":"...","en":"..."},
    "shots":[{"source":"capture.mov", "start":0, "duration":4,
      "layout":"room", "crop":[0,.25,1,.75], "zh":"...", "en":"...",
      "eyebrow":"A QUIET WORKSHOP"}]}]}
Each version may set silent:true. A single top-level version is also accepted.
crop is [x,y,width,height], normalised against the ORIGINAL capture, never the
composited canvas. Only the specified usage-number rectangle is pixelated.
No interface pixels, pointer actions, or invented App interactions are drawn.

Outputs beside each MP4: bilingual/separate SRTs, a poster JPEG, raw ffprobe
JSON, and a render provenance report. Test footage must set testOnly:true so
its canvas/report cannot be mistaken for an actual-App promotional capture.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FPS, FADE, LOOP_FADE = 30, .35, .5
USAGE_RECT = (.28, .08, .19, .15)
DEFAULT_MUSIC = ROOT / "dist-mini-office/promo/audio/workshop-warm-90bpm-70s.wav"
FONT_ZH = Path("/System/Library/Fonts/Hiragino Sans GB.ttc")
FONT_EN = Path("/System/Library/Fonts/Avenir Next.ttc")
LAYOUTS = {"room", "full", "panel", "close", "end"}


def run(command, *, label="ffmpeg"):
    result = subprocess.run([str(value) for value in command], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(label + " failed:\n" + result.stderr[-6500:])
    return result


def probe(file):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", file], label="ffprobe").stdout)


def sha(file):
    file = Path(file).resolve()
    stat = file.stat()
    return cached_sha(str(file), stat.st_size, stat.st_mtime_ns)


@lru_cache(maxsize=128)
def cached_sha(file, size, modified):
    digest = hashlib.sha256()
    with Path(file).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    stat = Path(file).stat()
    if (stat.st_size, stat.st_mtime_ns) != (size, modified):
        raise RuntimeError("Source changed while it was being hashed: " + Path(file).name)
    return digest.hexdigest()


def resolve(value, base):
    file = Path(value).expanduser()
    return file.resolve() if file.is_absolute() else (base / file).resolve()


def even(value):
    return max(2, int(round(value / 2)) * 2)


def clock(seconds):
    milliseconds = max(0, round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def rectangle(value):
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError("crop must be a normalised [x,y,width,height] rectangle")
    x, y, w, h = (float(v) for v in value)
    if not all(math.isfinite(v) for v in (x, y, w, h)) or min(x, y) < 0 or min(w, h) <= 0 or x + w > 1.000001 or y + h > 1.000001:
        raise ValueError("crop lies outside the original capture")
    return x, y, w, h


def intersects(a, b):
    return a[0] < b[0] + b[2] and a[0] + a[2] > b[0] and a[1] < b[1] + b[3] and a[1] + a[3] > b[1]


def pixels(rect, width, height):
    x, y, w, h = rect
    left, top = math.floor(x * width), math.floor(y * height)
    right, bottom = min(width, math.ceil((x + w) * width)), min(height, math.ceil((y + h) * height))
    return left, top, right - left, bottom - top


@lru_cache(maxsize=128)
def font(size, chinese=False, bold=False):
    return ImageFont.truetype(str(FONT_ZH if chinese else FONT_EN), max(1, round(size)), index=(2 if bold else 0) if chinese else (2 if bold else 7))


def wrap(draw, text, face, width):
    lines = []
    for paragraph in str(text).splitlines() or [""]:
        # English stays word-wrapped; Han text stays naturally character-wrapped.
        tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9’'./:+−-]*\s*|\s+|.", paragraph)
        line = ""
        for token in tokens:
            if draw.textlength(line + token, font=face) > width and line:
                lines.append(line.rstrip()); line = token.lstrip()
            else:
                line += token
        lines.append(line.rstrip())
    return lines


def block(draw, text, x, y, width, size, color, *, chinese=False, bold=False, leading=1.35, max_lines=4, minimum=None):
    minimum = minimum or size * .68
    while True:
        face = font(size, chinese, bold)
        lines = wrap(draw, text, face, width)
        if len(lines) <= max_lines or size <= minimum:
            break
        size -= 2
    if len(lines) > max_lines:
        raise ValueError("Caption is too long for the authored title area: " + str(text))
    for line in lines:
        draw.text((x, y), line, font=face, fill=color, anchor="lt", stroke_width=0)
        y += size * leading
    return y


def title_pair(value):
    if isinstance(value, dict):
        return str(value.get("zh", "")), str(value.get("en", ""))
    return str(value or ""), ""


def canvas(shot, version, file, maskfile, source_size, *, test_only=False):
    width, height = version["width"], version["height"]
    portrait, scale = height > width, width / (1080 if height > width else 1920)
    dark = shot["layout"] == "end" or version.get("theme") == "forest"
    colors = {"bg": "#183D35" if dark else "#F3EFE5", "ink": "#F6F0E2" if dark else "#173F36", "muted": "#C1D0BF" if dark else "#697C70", "line": "#597064" if dark else "#D5D5C4", "accent": "#DCC69A" if dark else "#887550"}
    S = 2
    image = Image.new("RGB", (width * S, height * S), colors["bg"])
    draw = ImageDraw.Draw(image)
    u = scale * S
    tx, ty = 68 * u, 68 * u
    # Outside-the-App editorial frame, never a counterfeit interface element.
    draw.rounded_rectangle((tx, ty + 2*u, tx + 7*u, ty + 31*u), radius=3*u, fill=colors["accent"])
    draw.text((tx + 22*u, ty), "AI WORK SPACE", font=font(23*u, bold=True), fill=colors["ink"], anchor="lt")
    draw.text((tx + 22*u, ty + 33*u), "Observe your agent team collaboration in your spare display", font=font(12*u), fill=colors["muted"], anchor="lt")
    version_zh, version_en = title_pair(version.get("title"))
    zh, en = str(shot.get("zh", version_zh)), str(shot.get("en", version_en))
    eyebrow = str(shot.get("eyebrow", "A SMALL ROOM FOR REAL WORK"))
    if portrait:
        x, y, title_width = 68*u, 198*u, 944*u
        y = block(draw, eyebrow, x, y, title_width, 20*u, colors["accent"], bold=True, max_lines=2) + 31*u
        y = block(draw, zh, x, y, title_width, 79*u, colors["ink"], chinese=True, bold=True, leading=1.28, max_lines=3) + 27*u
        y = block(draw, en, x, y, title_width, 35*u, colors["muted"], leading=1.3, max_lines=3)
        # Wide full-App captures keep their whole genuine frame. A tighter
        # explicit source crop lets room/panel shots occupy the taller space.
        box = (48*scale, max(610*scale, y/S + 72*scale), 984*scale, 1000*scale)
        bottom = 1740*scale
        box = (box[0], box[1], box[2], max(320*scale, bottom-box[1]))
    else:
        if shot["layout"] == "room" and shot["crop"][2] * source_size[0] / (shot["crop"][3] * source_size[1]) > 2.0:
            y = block(draw, eyebrow, 68*u, 148*u, 1700*u, 18*u, colors["accent"], bold=True, max_lines=1) + 22*u
            block(draw, zh, 68*u, y, 1010*u, 56*u, colors["ink"], chinese=True, bold=True, max_lines=1)
            block(draw, en, 1120*u, y + 3*u, 710*u, 27*u, colors["muted"], max_lines=2)
            box = (68*scale, 290*scale, 1784*scale, 660*scale)
        else:
            x, y, title_width = 68*u, 252*u, 385*u
            y = block(draw, eyebrow, x, y, title_width, 17*u, colors["accent"], bold=True, max_lines=3) + 32*u
            y = block(draw, zh, x, y, title_width, 64*u, colors["ink"], chinese=True, bold=True, leading=1.3, max_lines=4) + 28*u
            block(draw, en, x, y, title_width, 29*u, colors["muted"], leading=1.35, max_lines=5)
            box = (510*scale, 162*scale, 1330*scale, 778*scale)

    crop = shot["crop"]
    aspect = source_size[0] * crop[2] / (source_size[1] * crop[3])
    vw = even(min(box[2], box[3] * aspect))
    vh = even(vw / aspect)
    # A centered, contained source: no stretching, unrequested crop or fabricated
    # browser chrome. The thin frame and shadow live entirely outside its pixels.
    vx, vy = round(box[0] + (box[2]-vw)/2), round(box[1] + (box[3]-vh)/2)
    radius, border = 16*scale, 2*scale
    shadow = Image.new("RGBA", image.size)
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(((vx-5*scale)*S, (vy+12*scale)*S, (vx+vw+5*scale)*S, (vy+vh+18*scale)*S), radius=(radius+5*scale)*S, fill=(0, 16, 10, 55 if dark else 37))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24*scale*S))
    image = Image.alpha_composite(image.convert("RGBA"), shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(((vx-border)*S, (vy-border)*S, (vx+vw+border)*S, (vy+vh+border)*S), radius=(radius+border)*S, fill=colors["line"])

    if test_only:
        caption_zh, caption_en = "编码测试 · 临时占位画面", "Encoding test · Placeholder footage, not a final film"
    elif shot["masked"]:
        caption_zh, caption_en = "真实 App 录屏 · 用量数字已遮蔽", "Actual app capture · Usage figures masked"
    else:
        caption_zh, caption_en = "真实 App 录屏", "Actual app capture"
    if not test_only:
        caption_zh = str(shot.get("captionZh", caption_zh))
        caption_en = str(shot.get("captionEn", caption_en))
        if shot["masked"]:
            if "用量数字已遮蔽" not in caption_zh:
                caption_zh += " · 用量数字已遮蔽"
            if "Usage figures masked" not in caption_en:
                caption_en += " · Usage figures masked"
    if portrait:
        draw.line((68*u, 1805*u, 1012*u, 1805*u), fill=colors["line"], width=max(1, round(u)))
        draw.text((68*u, 1833*u), caption_zh, font=font(19*u, True), fill=colors["muted"], anchor="lt")
        draw.text((68*u, 1868*u), caption_en, font=font(17*u), fill=colors["muted"], anchor="lt")
    else:
        draw.line((68*u, 995*u, 1852*u, 995*u), fill=colors["line"], width=max(1, round(u)))
        draw.text((68*u, 1021*u), caption_zh, font=font(17*u, True), fill=colors["muted"], anchor="lt")
        draw.text((970*u, 1020*u), caption_en, font=font(18*u), fill=colors["muted"], anchor="lt")
    image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS).save(file)
    mask = Image.new("L", (vw*S, vh*S)); ImageDraw.Draw(mask).rounded_rectangle((0, 0, vw*S-1, vh*S-1), radius=radius*S, fill=255)
    mask.resize((vw, vh), Image.Resampling.LANCZOS).save(maskfile)
    return {"x": vx, "y": vy, "width": vw, "height": vh, "privacyCaption": caption_en, "captionZh": caption_zh, "captionEn": caption_en}


def render_shot(shot, version, cache, index, *, test_only, force):
    source = shot["source"]
    data = probe(source)
    stream = next((item for item in data["streams"] if item["codec_type"] == "video"), None)
    if not stream:
        raise ValueError("No video stream in " + str(source))
    sw, sh = int(stream["width"]), int(stream["height"])
    available = float(data["format"].get("duration", stream.get("duration", 0)))
    if shot["start"] + shot["duration"] > available + 1/FPS:
        raise ValueError(f"Shot {index+1} exceeds its source ({available:.3f}s): {source.name}")
    payload = {"shot": {**shot, "source": str(source)}, "version": version, "sourceSHA256": sha(source), "generatorSHA256": sha(Path(__file__)), "fonts": [sha(FONT_ZH), sha(FONT_EN)], "testOnly": test_only}
    key = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    stem = cache / f"shot-{index+1:02d}-{key}"
    png, mask, video, geometry_file = (stem.with_suffix(suffix) for suffix in (".png", ".mask.png", ".mp4", ".json"))
    if not force and video.exists() and geometry_file.exists():
        return video, json.loads(geometry_file.read_text())
    frame = canvas(shot, version, png, mask, (sw, sh), test_only=test_only)
    cx, cy, cw, ch = pixels(shot["crop"], sw, sh)
    graph = ["[0:v]setpts=PTS-STARTPTS,fps=30,format=rgba[raw]"]
    if shot["masked"]:
        mx, my, mw, mh = pixels(USAGE_RECT, sw, sh)
        graph += ["[raw]split=2[original][private]",
                  f"[private]crop={mw}:{mh}:{mx}:{my}:exact=1,scale=7:4:flags=area,scale={mw}:{mh}:flags=neighbor[mosaic]",
                  f"[original][mosaic]overlay={mx}:{my}:format=auto[protected]"]
        raw = "protected"
    else:
        raw = "raw"
    graph += [f"[{raw}]crop={cw}:{ch}:{cx}:{cy}:exact=1,scale={frame['width']}:{frame['height']}:flags=lanczos,setsar=1,format=rgba[picture]",
              "[2:v]format=gray[mask]", "[picture][mask]alphamerge[rounded]",
              f"[1:v][rounded]overlay={frame['x']}:{frame['y']}:format=auto:shortest=1,format=yuv420p[out]"]
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1", "-ss", shot["start"], "-i", source,
         "-loop", "1", "-framerate", FPS, "-i", png, "-loop", "1", "-framerate", FPS, "-i", mask,
         "-filter_complex", ";".join(graph), "-map", "[out]", "-an", "-frames:v", shot["frames"], "-r", FPS,
         "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video], label=f"shot {index+1}")
    if sha(source) != payload["sourceSHA256"]:
        raise RuntimeError("Real source changed during rendering: " + source.name)
    if int(next(item for item in probe(video)["streams"] if item["codec_type"] == "video")["nb_frames"]) != shot["frames"]:
        raise RuntimeError("Intermediate shot ended before the requested frame count")
    geometry_file.write_text(json.dumps(frame, ensure_ascii=False, indent=2) + "\n")
    return video, frame


def normalise_music(file, duration):
    base = f"atrim=duration={duration:.9f},asetpts=PTS-STARTPTS,afade=t=out:st={max(0,duration-1.5):.9f}:d={min(duration,1.5):.9f}"
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", file, "-af", base + ",loudnorm=I=-19:TP=-2:LRA=11:print_format=json", "-f", "null", "-"], label="music loudness analysis")
    match = re.search(r'\{\s*"input_i".*?\}', result.stderr, re.S)
    if not match:
        raise RuntimeError("ffmpeg did not return a loudness measurement")
    measured = json.loads(match.group())
    linear = (f",loudnorm=I=-19:TP=-2:LRA=11:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
              f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true")
    return base + linear + ",aresample=48000", measured


def srt_files(output, shots, starts, duration, title):
    destinations = {}
    for language in ("zh", "en", "bilingual"):
        rows = []
        for index, shot in enumerate(shots):
            zh, en = shot.get("zh", title_pair(title)[0]), shot.get("en", title_pair(title)[1])
            text = "\n".join(value for value in (zh, en) if value) if language == "bilingual" else (zh if language == "zh" else en)
            end = starts[index+1] if index+1 < len(starts) else duration
            rows.append(f"{index+1}\n{clock(starts[index])} --> {clock(end)}\n{text}\n")
        file = output.with_suffix("."+language+".srt"); file.write_text("\n".join(rows), encoding="utf-8")
        destinations[language] = str(file)
    return destinations


def render_version(version, document, base, *, force=False):
    width, height = int(version["width"]), int(version["height"])
    if width <= 0 or height <= 0 or width % 2 or height % 2:
        raise ValueError("Output dimensions must be positive even integers")
    version = {**version, "width": width, "height": height}
    output = resolve(version["output"], base)
    output.parent.mkdir(parents=True, exist_ok=True)
    cache = output.parent / ".render-cache" / output.stem; cache.mkdir(parents=True, exist_ok=True)
    test_only = bool(version.get("testOnly", document.get("testOnly", False)))
    shots = []
    for index, raw in enumerate(version.get("shots", document.get("shots", []))):
        layout = raw.get("layout", "room")
        if layout not in LAYOUTS:
            raise ValueError("Unknown shot layout: " + layout)
        duration, start = float(raw["duration"]), float(raw.get("start", 0))
        if not all(math.isfinite(n) for n in (duration, start)) or start < 0 or duration < .8:
            raise ValueError("Shots need nonnegative starts and at least 0.8 seconds")
        crop = rectangle(raw.get("crop", [0, 0, 1, 1]))
        frames = round(duration * FPS)
        # Full originals always receive the required mask. A close crop that
        # happens to intersect those same numbers is protected too; safe room
        # crops do not have any of their visible UI modified.
        shots.append({**raw, "source": resolve(raw["source"], base), "layout": layout, "start": start, "duration": frames/FPS, "frames": frames, "crop": crop, "masked": layout == "full" or intersects(crop, USAGE_RECT)})
    if not shots:
        raise ValueError("A film needs at least one real capture shot")
    starts, cursor = [], 0.0
    for shot in shots:
        starts.append(cursor); cursor += shot["duration"] - FADE
    nominal = cursor + FADE
    silent = bool(version.get("silent", document.get("silent", False)))
    loop = bool(version.get("loop", False))
    if loop:
        if not silent or len(shots) != 1:
            raise ValueError("loop:true requires silent:true and exactly one shot")
        if shots[0]["frames"] <= 2 * round(LOOP_FADE * FPS):
            raise ValueError("A seamless loop needs more than one second of real source frames")
        nominal -= LOOP_FADE
    frames = round(nominal * FPS)
    duration = frames / FPS
    music = resolve(version.get("music", document.get("music", str(DEFAULT_MUSIC))), base)
    if not silent:
        music_duration = float(probe(music)["format"]["duration"])
        if music_duration + .02 < duration:
            raise ValueError(f"Music is {music_duration:.2f}s, film is {duration:.2f}s; generate a longer bed or shorten the edit")
    # Paths inside version are serialised canonically for deterministic caches.
    cache_version = {key: value for key, value in version.items() if key not in ("shots",)}
    print(f"{output.name}: composing {len(shots)} shots → {width}×{height}, {duration:.3f}s", flush=True)
    rendered, geometries = [], []
    for index, shot in enumerate(shots):
        video, geometry = render_shot(shot, cache_version, cache, index, test_only=test_only, force=force)
        rendered.append(video); geometries.append(geometry)

    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1"]
    for video in rendered:
        command += ["-i", video]
    if not silent:
        command += ["-i", music]
    graph = [f"[{index}:v]settb=AVTB,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v{index}]" for index in range(len(shots))]
    previous = "v0"
    if loop:
        overlap = round(LOOP_FADE * FPS)
        source_frames = shots[0]["frames"]
        # Play the real source from +0.5s, then melt its last 0.5s into its
        # original first 0.5s. The final head frame is immediately followed by
        # the next real head frame at loop start: no held or invented frames.
        # The discrete ramp reaches exactly B on its final encoded frame.
        ramp = f"min(1,T/{(overlap-1)/FPS:.12f})"
        graph += ["[v0]split=3[loopbody][looptail][loophead]",
                  f"[loopbody]trim=start_frame={overlap}:end_frame={source_frames-overlap},setpts=PTS-STARTPTS[loopmain]",
                  f"[looptail]trim=start_frame={source_frames-overlap}:end_frame={source_frames},setpts=PTS-STARTPTS[loopt]",
                  f"[loophead]trim=start_frame=0:end_frame={overlap},setpts=PTS-STARTPTS[looph]",
                  f"[loopt][looph]blend=all_expr='A*(1-{ramp})+B*{ramp}':shortest=1[loopseam]",
                  "[loopmain][loopseam]concat=n=2:v=1:a=0[looped]"]
        previous = "looped"
    for index in range(1, len(shots)):
        label = "x" + str(index)
        graph.append(f"[{previous}][v{index}]xfade=transition=fade:duration={FADE}:offset={starts[index]:.9f}[{label}]")
        previous = label
    measured = None
    if not silent:
        audio_filter, measured = normalise_music(music, duration)
        graph.append(f"[{len(shots)}:a]{audio_filter}[audio]")
    command += ["-filter_complex", ";".join(graph), "-map", "["+previous+"]"]
    if not silent:
        command += ["-map", "[audio]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
    else:
        command += ["-an"]
    command += ["-c:v", "libx264", "-crf", "18", "-preset", "slow", "-threads", "2", "-pix_fmt", "yuv420p", "-r", FPS, "-frames:v", frames, "-t", f"{duration:.9f}", "-movflags", "+faststart", "-metadata", "title="+" / ".join(value for value in title_pair(version.get("title")) if value), output]
    run(command, label=output.name)
    info = probe(output)
    encoded = next(item for item in info["streams"] if item["codec_type"] == "video")
    if int(encoded["nb_frames"]) != frames or encoded["codec_name"] != "h264" or (int(encoded["width"]), int(encoded["height"])) != (width, height):
        raise RuntimeError("Encoded film does not match its requested geometry/frame contract")
    audio_streams = [item for item in info["streams"] if item["codec_type"] == "audio"]
    if bool(audio_streams) == silent:
        raise RuntimeError("Encoded film has an incorrect silent/audio contract")
    output.with_suffix(".ffprobe.json").write_text(json.dumps(info, indent=2, ensure_ascii=False)+"\n")
    subtitles = srt_files(output, shots, starts, duration, version.get("title"))
    poster = output.with_suffix(".poster.jpg")
    poster_time = min(max(float(version.get("posterTime", duration * .4)), 0), max(0, duration-1/FPS))
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", poster_time, "-i", output, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2:flags=lanczos", "-q:v", "2", poster], label="poster")
    report = {"testOnly": test_only, "actualAppCapture": not test_only, "output": str(output), "width": width, "height": height, "fps": FPS, "frames": frames, "durationSeconds": duration, "nominalDurationSeconds": nominal, "transitionSeconds": FADE if len(shots)>1 else 0, "loop": {"enabled": loop, "tailHeadCrossfadeSeconds": LOOP_FADE if loop else 0, "sourcePlaybackStartsAtSeconds": LOOP_FADE if loop else 0, "exactAdjacentHeadFramesAtBoundary": loop}, "audio": {"silent": silent, "music": None if silent else music.name, "musicSHA256": None if silent else sha(music), "targetIntegratedLUFS": None if silent else -19, "tailFadeSeconds": None if silent else 1.5, "measuredBeforeNormalisation": measured}, "privacy": {"onlySpecifiedUsageRectangle": list(USAGE_RECT), "method": "7×4 pixel mosaic, composited into the original source before any crop/scale"}, "shots": [{"source": shot["source"].name, "sourceSHA256": sha(shot["source"]), "sourceStart": shot["start"], "duration": shot["duration"], "timelineStart": starts[index], "crop": list(shot["crop"]), "layout": shot["layout"], "usageMasked": shot["masked"], "canvasFrame": geometries[index], "zh": shot.get("zh", ""), "en": shot.get("en", "")} for index, shot in enumerate(shots)], "subtitles": subtitles, "poster": str(poster), "ffprobe": str(output.with_suffix(".ffprobe.json")), "generatorSHA256": sha(Path(__file__)), "bytes": output.stat().st_size, "sha256": sha(output)}
    report_file = output.with_suffix(".render.json"); report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False)+"\n")
    print(json.dumps({"ok": True, "output": str(output), "seconds": duration, "silent": silent, "poster": str(poster), "report": str(report_file)}, ensure_ascii=False), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--only", help="Render only a matching version id")
    parser.add_argument("--force", action="store_true", help="Re-render intermediates instead of reusing validated source/font/script caches")
    args = parser.parse_args()
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            parser.error(binary + " is required")
    for face in (FONT_ZH, FONT_EN):
        if not face.is_file():
            parser.error("Required system font is missing: " + str(face))
    manifest = args.manifest.resolve(); document = json.loads(manifest.read_text())
    versions = document.get("versions", [document])
    selected = [version for version in versions if args.only is None or version.get("id") == args.only]
    if not selected:
        parser.error("No version matches --only")
    outputs = [resolve(version["output"], manifest.parent) for version in selected]
    if len(set(outputs)) != len(outputs):
        parser.error("Each film version must have its own output path")
    for version in selected:
        render_version(version, document, manifest.parent, force=args.force)


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, OSError, RuntimeError) as error:
        print("Film render failed: " + str(error), file=sys.stderr)
        raise SystemExit(1)
