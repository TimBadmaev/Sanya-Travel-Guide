#!/usr/bin/env python3
"""Prepare small Russian AAC tour episodes with original programmatic music.

Build-time only; nothing here is delivered to the traveller. Uses Silero
v5_cis_base_nostress (MIT license, documented in AUDIO-GUIDES.md).
"""
import argparse, json, math, os, pathlib, re, subprocess, tempfile, wave

import numpy as np
import torch
from silero import silero_tts

ROOT=pathlib.Path(__file__).resolve().parents[1]
SR=24000
VOICE="ru_ekaterina"

def chunks(text,max_chars=380):
    parts=[]
    for paragraph in text.splitlines():
        p=paragraph.strip()
        if not p:continue
        sentences=re.split(r"(?<=[.!?…])\s+",p)
        output=""
        for sentence in sentences:
            if output and len(output)+1+len(sentence)>max_chars:
                parts.append(output);output=""
            if len(sentence)>max_chars:
                words=sentence.split()
                for w in words:
                    if output and len(output)+len(w)+1>max_chars:
                        parts.append(output);output=""
                    output+=(" " if output else "")+w
            else:output+=(" " if output else "")+sentence
        if output:parts.append(output)
        parts.append(None) # meaningful pause at end of scene
    return parts

def synthetic_music(path, seconds=52):
    # Original composition: 4 gentle suspended chords in a repeating 52s cycle.
    # No copyrighted recordings, samples, instruments or downloaded music.
    np.random.seed(319)
    t=np.arange(seconds*SR,dtype=np.float32)/SR
    result=np.zeros_like(t)
    chords=[[110,164.81,196,293.66],[87.31,130.81,164.81,261.63],
            [130.81,164.81,196,261.63],[98,146.83,196,246.94]]
    fade=0.08
    for k,chord in enumerate(chords):
        start=k*13;end=(k+1)*13
        ix=(t>=start)&(t<end)
        loc=t[ix]-start
        env=(1-np.exp(-loc/1.8))*np.minimum(1,(13-loc)/3.4)
        for h,freq in enumerate(chord):
            phase=2*np.pi*freq*loc
            result[ix]+=np.float32(0.09*env)*(
                np.sin(phase)*0.65+np.sin(2*phase+0.4)*0.14+
                np.sin(phase*1.002)*0.21
            )/(1+h*.45)
        # one soft bell/chime on chord change; quickly decays
        result[ix]+=0.03*np.exp(-loc/2.2)*np.sin(2*np.pi*chord[3]*2*loc)
    # soft soundscape shimmer, musically non-melodic, never louder than voice
    result=np.tanh(result).astype(np.float32)
    with wave.open(str(path),"wb") as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR)
        f.writeframes((np.clip(result,-1,1)*32767).astype(np.int16).tobytes())

def save_wav(path,arr):
    with wave.open(str(path),"wb") as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR)
        f.writeframes((np.clip(arr,-1,1)*32767).astype(np.int16).tobytes())

def make_voice(model, text):
    pcm=[]
    for part in chunks(text):
        if part is None:
            pcm.append(np.zeros(int(SR*0.48),dtype=np.float32))
            continue
        wav=model.apply_tts(text=part,speaker=VOICE,sample_rate=SR)
        if hasattr(wav,"detach"):wav=wav.detach().cpu().numpy()
        pcm.append(np.asarray(wav,dtype=np.float32))
        pcm.append(np.zeros(int(SR*0.18),dtype=np.float32))
    if not pcm:raise ValueError("Empty narration")
    return np.concatenate([np.zeros(int(SR*.9),dtype=np.float32),*pcm,np.zeros(int(SR*1.2),dtype=np.float32)])

def encode(voice_file,music_file,dest):
    # Quiet original instrumental bed blended at -26 dB. Spoken words dominate.
    # AAC/M4A is preferred over Opus for broad iPhone Safari/PWA compatibility.
    command=[
      "ffmpeg","-nostdin","-hide_banner","-v","error","-y",
      "-i",str(voice_file),"-stream_loop","-1","-i",str(music_file),
      "-filter_complex","[1:a]volume=0.065,afade=t=in:st=0:d=2[bed];"
                        "[0:a]volume=1.08[voice];"
                        "[voice][bed]amix=inputs=2:duration=first:normalize=0,"
                        "alimiter=limit=0.93[out]",
      "-map","[out]","-c:a","aac","-b:a","24k",
      "-ar",str(SR),"-ac","1","-movflags","+faststart",str(dest)]
    subprocess.run(command,check=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",default=str(ROOT/"assets/audio-v2"))
    parser.add_argument("--limit",type=int,default=0,help="Optional demo limit")
    args=parser.parse_args()
    data=json.loads((ROOT/"data/audio-guides.json").read_text("utf-8"))
    entries=list(data["items"].items())
    if args.limit:entries=entries[:args.limit]
    output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
    torch.set_num_threads(min(os.cpu_count() or 2,2))
    print("Load Silero v5_cis_base_nostress, MIT model",flush=True)
    model,_=silero_tts(language="ru",speaker="v5_cis_base_nostress")
    model.to(torch.device("cpu"))
    with tempfile.TemporaryDirectory() as tmp:
        tmp=pathlib.Path(tmp)
        music=tmp/"ambient.wav"
        synthetic_music(music)
        for i,(id,guide) in enumerate(entries,1):
            dest=output/(id+".m4a")
            if dest.exists() and dest.stat().st_size>9000:
                print(f"[{i}/{len(entries)}] EXISTS {id}",flush=True);continue
            print(f"[{i}/{len(entries)}] Narrate {id} ({guide['wordCount']} words)",flush=True)
            voice=tmp/"voice.wav"
            try:
                save_wav(voice,make_voice(model,guide["text"]))
                encode(voice,music,dest)
            except Exception:
                if dest.exists():dest.unlink()
                raise
            if dest.stat().st_size<9000:raise RuntimeError(f"Invalid output {dest}")
    print(f"Completed {len(entries)} episodes; {sum(f.stat().st_size for f in output.glob('*.m4a'))/1048576:.1f} MiB",flush=True)

if __name__=="__main__":main()
