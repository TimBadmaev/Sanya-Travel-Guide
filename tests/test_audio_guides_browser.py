# -*- coding: utf-8 -*-
"""v31: all-guides catalog and direct place player; no automatic audio download."""
import json, os, socket, sys
sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1",0))
        return s.getsockname()[1]
def main():
    p=port();server=serve(ROOT,p);b=Browser(width=320,height=740);done=0
    base=f"http://127.0.0.1:{p}/"
    def go(h,selector):
        b.go(base,h,cold=True)
        if not b.wait_for(f"location.hash==={json.dumps(h)}&&!!document.querySelector({json.dumps(selector)})&&!document.querySelector('.loading')",20):
            raise AssertionError(f"screen {h} did not load: {b.exceptions}")
    def check(name,expr,value=True):
        nonlocal done
        got=b.js(expr)
        if got!=value:raise AssertionError(f"{name}: {got!r} != {value!r}")
        print("PASS",name,flush=True);done+=1
    try:
        go("#/audio",".audio-catalog__item")
        check("every verified place has audio catalog entry","document.querySelectorAll('.audio-catalog__item').length",57)
        check("no MP3 auto-requested","performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.mp3')).length",0)
        check("catalog search and area are accessible","document.querySelectorAll('.audio-filter').length",2)
        check("mobile has no horizontal overflow","document.documentElement.scrollWidth<=innerWidth")
        check("bulk download requires user click","!!document.querySelector('.audio-catalog__actions button')")
        b.js("document.querySelector('.audio-filter').value='yalong';document.querySelector('.audio-filter').dispatchEvent(new Event('change'));true")
        check("Yalong filter shows subset","document.querySelectorAll('.audio-catalog__item').length>0&&document.querySelectorAll('.audio-catalog__item').length<57")
        go("#/place/luhuitou-park",".audio-guide")
        check("Luhuitou player controls available","document.querySelectorAll('.audio-guide__controls button').length",3)
        check("Russian transcript present","document.querySelector('.audio-guide__script').textContent.length>700")
        check("audio does not play automatically","document.querySelector('.audio-guide audio').paused")
        check("no audio downloaded by viewing the place","performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.mp3')).length",0)
        go("#/place/yalong-bay-beach",".audio-guide")
        check("Yalong has own guide","document.querySelector('.audio-guide__title').textContent.includes('Ялонг')")
        check("player buttons have min 44px touch targets","[...document.querySelectorAll('.audio-guide__controls button')].every(x=>x.getBoundingClientRect().height>=44)")
        check("no JavaScript errors","true" if not b.exceptions else "false")
        print(f"v31 {done} audio tests passed",flush=True)
    finally:
        b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
