# -*- coding: utf-8 -*-
"""v31: real M4A stored by explicit request remains playable offline.
Run only when the generated assets/audio/*.m4a are present.
"""
import json, os, socket, sys
sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def main():
    assert os.path.getsize(os.path.join(ROOT, "assets", "audio-v2", "luhuitou-park.m4a")) > 10000
    p=port();server=serve(ROOT,p);b=Browser(width=375,height=812)
    base=f"http://127.0.0.1:{p}/"; done=0
    def check(label, expression, expected=True):
        nonlocal done
        value=b.js(expression)
        if value!=expected:
            raise AssertionError(f"{label}: {value!r} != {expected!r}")
        print("PASS",label,flush=True);done+=1
    try:
        b.go(base,"#/place/luhuitou-park",cold=True)
        if not b.wait_for("document.querySelector('.audio-guide__play')&&!document.querySelector('.audio-guide__play').disabled",20):
            raise AssertionError(f"audio UI unavailable: {b.exceptions}")
        if not b.wait_for("navigator.serviceWorker.controller!==null",20):
            raise AssertionError("PWA service worker never controlled the page")
        check("no automatic audio request on place view",
              "performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.mp3')).length",0)
        b.js("document.querySelector('.audio-guide__download').click();true")
        if not b.wait_for("document.querySelector('.audio-guide__status').textContent.includes('✓ Аудио сохранено')",30):
            raise AssertionError(f"MP3 did not download: {b.exceptions}")
        check("audio saved to dedicated Cache API",
              "(async()=>!!(await(await caches.open('sanya-audio-offline-v1')).match(new URL('assets/audio-v2/luhuitou-park.m4a',document.baseURI))))()")
        b.send("Network.emulateNetworkConditions",{
            "offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0
        })
        b.go(base,"#/place/luhuitou-park",cold=True)
        if not b.wait_for("document.querySelector('.audio-guide__status')?.textContent.includes('✓ Аудио сохранено')",20):
            raise AssertionError(f"Offline file was not restored: {b.exceptions}")
        check("offline player uses a Blob URL instead of network",
              "document.querySelector('.audio-guide audio').src.startsWith('blob:')")
        b.js("document.querySelector('.audio-guide audio').load();true")
        if not b.wait_for("document.querySelector('.audio-guide audio').readyState>=1",15):
            raise AssertionError("Cached MP3 metadata cannot be read offline")
        check("offline MP3 has realistic audio duration",
              "document.querySelector('.audio-guide audio').duration>=45&&document.querySelector('.audio-guide audio').duration<=360")
        check("offline user can read transcript",
              "document.querySelector('.audio-guide__script').textContent.length>700")
        check("no JS errors after offline reload","true" if not b.exceptions else "false")
        print(f"v31 {done} actual offline audio checks passed",flush=True)
    finally:
        try:b.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
        except Exception:pass
        b.close();server.shutdown();server.server_close()

if __name__=="__main__":main()
