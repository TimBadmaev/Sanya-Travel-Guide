#!/usr/bin/env python3
"""Render pre-approved Russian scripts into compressed MP3 narration with Piper.
Executed only in GitHub Actions, never in the PWA or on travellers' devices.
The model is downloaded to the temporary Actions runner and never committed.
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "assets" / "audio")
    args = parser.parse_args()
    data = json.loads((ROOT / "data" / "audio-guides.json").read_text(encoding="utf-8"))
    items = data["items"]
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    assert shutil.which("ffmpeg"), "ffmpeg is required"
    assert shutil.which("piper"), "piper executable is required"
    failures = []
    for index, (key, guide) in enumerate(items.items(), 1):
        target = out / f"{key}.mp3"
        if target.is_file() and target.stat().st_size > 10000:
            print(f"[{index}/{len(items)}] exists {key}", flush=True)
            continue
        print(f"[{index}/{len(items)}] synthesize {key}: {guide['wordCount']} words", flush=True)
        with tempfile.TemporaryDirectory() as folder:
            wav = pathlib.Path(folder) / "voice.wav"
            process = subprocess.run(
                ["piper", "--model", str(args.model), "--output_file", str(wav)],
                input=guide["text"], text=True, encoding="utf-8",
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            if process.returncode:
                failures.append(f"{key}: {process.stderr[-1000:]}")
                continue
            subprocess.run([
                "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(wav),
                "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame",
                "-b:a", "40k", str(target)
            ], check=True)
            if target.stat().st_size < 10000:
                failures.append(f"{key}: suspicious output size")
    if failures:
        raise RuntimeError("\n".join(failures))
    print(f"Rendered {len(items)} guides; audio files total {sum(p.stat().st_size for p in out.glob('*.mp3')) / (1024**2):.1f} MiB", flush=True)


if __name__ == "__main__":
    main()
