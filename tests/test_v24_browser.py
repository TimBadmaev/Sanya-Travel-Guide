# -*- coding: utf-8 -*-
"""v24 Chrome: exact live pins, offline SVG, editorial photos, XP and backup."""
import json
import os
import socket
import sys
sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1",0))
        return s.getsockname()[1]

def main():
    port=free_port()
    server=serve(ROOT,port)
    base=f"http://127.0.0.1:{port}/"
    b=Browser(width=375,height=812)
    checks=0
    def go(path,selector):
        b.go(base,path,cold=True)
        if not b.wait_for(f"location.hash === {json.dumps(path)} && !!document.querySelector({json.dumps(selector)}) && !document.querySelector('#view .loading')",20):
            raise AssertionError(f"failed {path}: {b.exceptions}")
        if b.exceptions: raise AssertionError(f"JS errors {path}: {b.exceptions}")
    def check(name,code,expected=True):
        nonlocal checks
        v=b.js(code)
        if v!=expected: raise AssertionError(f"{name}: {v!r} != {expected!r}")
        checks+=1
        print("PASS",name,flush=True)
    try:
        go("#/settings",".view-title")
        trip={"start":"2026-11-13","end":"2026-11-26","area":"yalong","stay":None,"home":None}
        b.js("localStorage.setItem('stg:trip',"+json.dumps(json.dumps(trip))+");true")
        go("#/passport",".street-map__frame")
        check("map does not load OSM tiles without consent","document.querySelectorAll('.street-map__tile').length",0)
        check("offline atlas appears first","!!document.querySelector('.atlas__svg')")
        b.js("document.querySelector('.street-map__load').click();true")
        check("real map has tile viewport","document.querySelectorAll('.street-map__tile').length > 0")
        check("tile source is openstreetmap.org","[...document.querySelectorAll('.street-map__tile')].every(x=>x.src.startsWith('https://tile.openstreetmap.org/'))")
        check("correct street map attribution","document.querySelector('.street-map__credit').textContent.includes('OpenStreetMap')")
        check("actual markers on street map","document.querySelectorAll('.street-map__pin').length >= 4")
        check("offline SVG still available below","document.querySelector('.passport-map .pp-map__svg') !== null")
        check("offline atlas back button is available","document.querySelector('.street-map__offline').textContent.includes('офлайн')")
        b.js("document.querySelector('.street-map__pin').click();true")
        check("selecting marker opens map preview","!document.querySelector('.street-map__preview').hidden")
        check("map preview links to existing catalog","document.querySelector('.street-map__open').getAttribute('href').startsWith('#/place/')")
        b.js("document.querySelector('.street-map__controls button').click();true")
        check("map zoom changes tile addresses","[...document.querySelectorAll('.street-map__tile')].every(x=>x.src.includes('/11/'))")
        go("#/excursions",".excursion-card")
        check("all excursions shown as photo-rich cards","document.querySelectorAll('.excursion-card').length",38)
        check("licensed local cover photo","document.querySelector('.excursion-card__photo').src.includes('/assets/photos/')")
        if not b.wait_for("document.querySelector('.excursion-card__photo').complete && document.querySelector('.excursion-card__photo').naturalWidth > 0",12):
            raise AssertionError("First excursion photo did not load")
        check("first cover photo is eager","document.querySelector('.excursion-card__photo').loading","eager")
        go("#/excursion/nanshan-tianya-day",".excursion-gallery")
        check("Nanshan gallery contains multiple licensed photos","document.querySelectorAll('.excursion-gallery__photo').length >= 2")
        check("editorial guide readable","document.querySelectorAll('.excursion-story__steps li').length >= 3")
        check("checked video review links","document.querySelectorAll('.excursion-reviews__link').length >= 1")
        go("#/excursion/yanoda-rainforest",".excursion-gallery")
        check("Yanoda uses explicitly credited Wikimedia photos","document.querySelector('.excursion-gallery__credit').textContent.includes('Hanno Böck')")
        go("#/expenses",".expense-xp-tip")
        check("expenses explain fair XP","document.querySelector('.expense-xp-tip').textContent.includes('+12 XP')")
        go("#/",".quest-home")
        check("one check-in day recorded","JSON.parse(localStorage.getItem('stg:activity')).days.length",1)
        check("new level path includes diary chapter","document.querySelectorAll('.quest-world').length",5)
        check("new tasks count","document.querySelectorAll('.quest-step__link').length",15)
        go("#/data",".view-title")
        check("daily activity exported in backup data","(async()=>{const B=await import('./js/logic/backup.js');const S=(await import('./js/storage.js')).storage;return B.buildBackup(S.readUserData(),{appVersion:'v24'}).data['stg:activity'].days.length})()",1)
        if not b.wait_for("navigator.serviceWorker.controller !== null",20): raise AssertionError("SW missing")
        b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
        go("#/passport",".street-map__frame")
        check("offline real-map controls present","document.querySelectorAll('.street-map__controls button').length",3)
        check("offline legacy map still usable","!!document.querySelector('.passport-map .pp-map__svg')")
        go("#/excursion/nanshan-tianya-day",".excursion-story")
        check("editorial content available offline","document.querySelector('.excursion-story__steps').textContent.length>100")
        print(f"v24 {checks} browser checks passed",flush=True)
    finally:
        b.close()
        server.shutdown()
        server.server_close()

if __name__=="__main__":
    main()
