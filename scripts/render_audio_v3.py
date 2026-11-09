#!/usr/bin/env python3
"""Build 33 compact Russian narrated M4A episodes with a neutral male Piper voice.
Piper is a build-only tool. The Hainan PWA plays prerecorded audio offline.
No copyrighted music: original ambient bed is synthesized in this script.
"""
import argparse, json, math, pathlib, shutil, subprocess, tempfile, wave

ROOT=pathlib.Path(__file__).resolve().parents[1]
SR=22050

def build_ambient(dest, seconds=38):
    # Original simple synth pad, gentle and almost inaudible beneath narration.
    chords=((110.,164.81,220.),(98.,146.83,196.),(130.81,164.81,261.63))
    with wave.open(str(dest),"wb") as file:
        file.setnchannels(1);file.setsampwidth(2);file.setframerate(SR)
        for start in range(0,seconds*SR,2048):
            samples=[]
            for n in range(start,min(seconds*SR,start+2048)):
                t=n/SR;part=int(t//(seconds/3))%3
                local=t % (seconds/3)
                fade=min(1,local/2,(seconds/3-local)/2)
                amp=.04*max(0,fade)
                val=sum(math.sin(2*math.pi*f*t)*amp/(i+2) for i,f in enumerate(chords[part]))
                samples.append(int(max(-1,min(1,val))*32767))
            import struct
            file.writeframes(struct.pack("<"+"h"*len(samples),*samples))

def verify(dest):
    p=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of",
      "default=noprint_wrappers=1:nokey=1",str(dest)],capture_output=True,text=True,check=True)
    d=float(p.stdout.strip())
    if not 45<d<350:raise RuntimeError(f"Unexpected narration duration {dest}: {d:.1f}s")
    if dest.stat().st_size<12000:raise RuntimeError(f"Unexpected empty narration: {dest}")
    return d

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--model",required=True)
    parser.add_argument("--output",default=str(ROOT/"assets/audio-v3"))
    args=parser.parse_args()
    assert shutil.which("ffmpeg") and shutil.which("piper") and shutil.which("ffprobe")
    guides=json.loads((ROOT/"data/audio-guides.json").read_text("utf-8"))["items"]
    out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        temp=pathlib.Path(tmp)
        bed=temp/"ambient.wav";build_ambient(bed)
        for i,(id,guide) in enumerate(guides.items(),1):
            target=out/(id+".m4a")
            if target.exists() and target.stat().st_size>12000:
                verify(target)
                print(f"[{i}/{len(guides)}] exists {id}",flush=True);continue
            print(f"[{i}/{len(guides)}] calm male voice {id}",flush=True)
            wav=temp/"voice.wav"
            p=subprocess.run(["piper","--model",args.model,"--output_file",str(wav)],
               input=guide["text"],text=True,encoding="utf-8",capture_output=True)
            if p.returncode:raise RuntimeError(p.stderr[-1200:])
            subprocess.run(["ffmpeg","-nostdin","-hide_banner","-v","error","-y",
               "-i",str(wav),"-stream_loop","-1","-i",str(bed),
               "-filter_complex","[0:a]volume=1.05[voice];[1:a]volume=0.07,afade=t=in:st=0:d=2[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.94[out]",
               "-map","[out]","-c:a","aac","-b:a","24k","-ar",str(SR),"-ac","1",
               "-movflags","+faststart",str(target)],check=True)
            verify(target)
    sizes={id:(out/(id+".m4a")).stat().st_size for id in guides}
    size_data={"version":3,"format":"aac/m4a","voice":"ru_RU-denis-medium",
        "count":len(sizes),"totalBytes":sum(sizes.values()),"items":sizes}
    (ROOT/"data/audio-sizes-v3.json").write_text(json.dumps(size_data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"PASS {len(sizes)} male voice episodes: {sum(sizes.values())/1048576:.2f} MiB",flush=True)

if __name__=="__main__":main()
