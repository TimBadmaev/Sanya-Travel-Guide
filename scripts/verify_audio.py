#!/usr/bin/env python3
"""Validate generated audio from the content catalog."""
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
data = json.loads((root / "data" / "audio-guides.json").read_text("utf-8"))
items = data["items"]
for key in items:
    path = root / "assets" / "audio" / f"{key}.mp3"
    assert path.exists() and path.stat().st_size > 10000, f"Missing {key}"
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],text=True,stdout=subprocess.PIPE,check=True)
    seconds = float(result.stdout.strip())
    assert 45 < seconds < 360, f"Invalid duration for {key}: {seconds}"
print(f"PASS: {len(items)} playable MP3s, each 1–5 minutes (45–360s guard)")
