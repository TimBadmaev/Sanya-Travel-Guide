#!/usr/bin/env python3
"""Assert each curated guide has an independently playable, non-truncated AAC."""
import json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((root/"data/audio-guides.json").read_text("utf-8"))["items"]
out=root/"assets"/"audio-v2"
actual={p.stem for p in out.glob("*.m4a")}
assert actual==set(catalog), f"Wrong audio: missing={set(catalog)-actual}; extra={actual-set(catalog)}"
sizes=[]
for id in catalog:
    p=out/(id+".m4a")
    result=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration:stream=codec_name",
       "-of","json",str(p)],check=True,capture_output=True,text=True)
    x=json.loads(result.stdout)
    duration=float(x["format"]["duration"])
    assert 50<=duration<=360, f"{id}: {duration:.2f}s"
    assert x["streams"][0]["codec_name"]=="aac",id
    sizes.append(p.stat().st_size)
print(f"PASS: {len(sizes)} AAC narrations, {sum(sizes)/1048576:.2f} MiB, {min(sizes)//1024}-{max(sizes)//1024} KiB each")
