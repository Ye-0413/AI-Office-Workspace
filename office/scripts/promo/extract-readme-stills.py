#!/usr/bin/env python3
"""Extract three README stills from the approved, privacy-masked release films.

Run from any directory with Python 3, ffmpeg, and ffprobe installed. Defaults
read dist-mini-office/promo/films-ai-work-space and write docs/media. The full
editorial canvas, captions, and existing privacy mask remain visible; no raw
recordings are read. Source hashes are checked before any output is written.

The JSON report on stdout records source hashes, fixed film timestamps, output
dimensions, sizes, and hashes. Only the three named JPEGs are written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[3]
SOURCES = {
    "AI-Work-Space-product-tour-60s.mp4":
        "cdb4ff9ae6e238019ad2df29504b89534284bd21a08439dabd1fe8e654c49bf4",
    "AI-Work-Space-brand-40s.mp4":
        "952c194784085371e3b3bca5321db230cfbe252cd38086fa0fd88abb5b79c639",
}
SHOTS = (
    # Search is fully open, before the next caption or transition begins.
    ("AI-Work-Space-product-tour-60s.mp4", "6.500", "ai-work-space-search.jpg"),
    # Size drag has settled at 135%; both the control and label are readable.
    ("AI-Work-Space-product-tour-60s.mp4", "23.800", "ai-work-space-sizing.jpg"),
    # The room-wide observatory shot precedes the end card.
    ("AI-Work-Space-brand-40s.mp4", "28.000", "ai-work-space-observatory.jpg"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str]) -> str:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path,
                        default=ROOT / "dist-mini-office/promo/films-ai-work-space")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "docs/media")
    args = parser.parse_args()
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            parser.error(f"{binary} is required")

    for name, expected in SOURCES.items():
        source = args.source_dir / name
        if not source.is_file():
            parser.error(f"Missing approved release film: {name}")
        if sha256(source) != expected:
            parser.error(f"Source SHA-256 does not match the approved film: {name}")

    rows = []
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ai-work-space-readme-stills-") as temporary:
        staged = Path(temporary)
        for source_name, timestamp, output_name in SHOTS:
            output = staged / output_name
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                 "-ss", timestamp, "-i", str(args.source_dir / source_name),
                 "-map_metadata", "-1", "-frames:v", "1",
                 "-vf", "scale=960:540:flags=lanczos", "-q:v", "3", str(output)])
            info = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                                   "-show_entries", "stream=width,height,codec_name",
                                   "-of", "json", str(output)]))["streams"][0]
            if (info["width"], info["height"], info["codec_name"]) != (960, 540, "mjpeg"):
                raise RuntimeError(f"Unexpected image format: {output_name}")
            if output.stat().st_size >= 180_000:
                raise RuntimeError(f"Image exceeds the 180 KB README budget: {output_name}")
            rows.append({
                "source": source_name,
                "sourceSHA256": SOURCES[source_name],
                "sourceSHA256Verified": True,
                "filmTimestampSeconds": float(timestamp),
                "output": output_name,
                "width": 960,
                "height": 540,
                "bytes": output.stat().st_size,
                "sha256": sha256(output),
            })
        # All sources and all three extracts must pass before public files change.
        for _, _, output_name in SHOTS:
            shutil.copyfile(staged / output_name, args.output_dir / output_name)
    print(json.dumps({"source": "approved privacy-masked release films",
                      "fullEditorialCanvasPreserved": True,
                      "stills": rows}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
