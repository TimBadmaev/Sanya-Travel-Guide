# -*- coding: utf-8 -*-
"""v26: default zero-tile offline map, opt-in streets, XP ranks and editorial content."""
import json, os, socket, sys
sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1",0))
        return s.getsockname()[1]

def main():
    p=port(); server=serve(ROOT,p); b=Browser(width=375,height=812)
    base=f"http://127.0.0.1:{p}/"; done=0
    def go(h,sel):
        b.go(base,h,cold=True)
        if not b.wait_for(f"location.hash==={json.dumps(h)}&&!!document.querySelector({json.dumps(sel)})&&!document.querySelector('#view .loading')",20):
            raise AssertionError(f"failed to load {h}: {b.exceptions}")
        if b.exceptions: raise AssertionError(f"JS errors at {h}: {b.exceptions}")
    def check(msg,expr,expected=True):
        nonlocal done
        value=b.js(expr)
        if value != expected: raise AssertionError(f"{msg}: {value!r} != {expected!r}")
        print("PASS",msg,flush=True);done+=1
    try:
        go("#/settings",".view-title")
        trip={"start":"2026-11-13","end":"2026-11-26","area":"yalong","stay":None,"home":None}
        b.js("localStorage.setItem('stg:trip',"+json.dumps(json.dumps(trip))+");true")
        go("#/passport",".street-map__activate")
        check("local illustrated map is above online map",
              "Boolean(document.querySelector('.passport-map').compareDocumentPosition(document.querySelector('.street-map')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        check("street tile images not created before consent","document.querySelectorAll('.street-map__tile').length",0)
        check("online viewport is initially hidden","document.querySelector('.street-map__frame').hidden")
        check("offline SVG exists","!!document.querySelector('.passport-map .pp-map__svg')")
        check("map uses vivid local shading","!!document.querySelector('.pp-terrain__contour')")
        b.js("document.querySelector('.street-map__activate').click();true")
        check("click creates visible map","!document.querySelector('.street-map__frame').hidden")
        check("only visible tiles requested","document.querySelectorAll('.street-map__tile').length > 0")
        check("proper OSM source","[...document.querySelectorAll('.street-map__tile')].every(x=>x.src.startsWith('https://tile.openstreetmap.org/'))")
        go("#/passport",".street-map__activate")
        check("reopening map again costs zero tile loads","document.querySelectorAll('.street-map__tile').length",0)
        check("new rank link in passport","!!document.querySelector('.passport-rank-link')")
        go("#/me",".rank-collection")
        check("6 rank medals","document.querySelectorAll('.rank-medal').length",6)
        check("default rank 1 earned","document.querySelectorAll('.rank-medal.is-earned').length",1)
        check("profile mascot visible","!!document.querySelector('.rank-mascot')")
        go("#/place/houhai-village",".place-feature")
        check("Houhai local story","document.querySelector('.place-feature h3').textContent.includes('сёрфинг')")
        check("three editorial moments","document.querySelectorAll('.place-feature__moments li').length",3)
        check("source linked to official visit sanya","document.querySelector('.place-feature__source').href.includes('visitsanya.com')")
        go("#/place/yazhou-ancient-city",".place-feature")
        check("Yazhou ancient town new guide","document.querySelector('.place-feature').textContent.includes('истор')")
        go("#/place/yalong-bay-beach",".place-detail__head")
        check("places without new guide still work","!!document.querySelector('.place-params')")
        # Establish that all content is offline and online map opt-in remains optional.
        go("#/passport",".street-map__activate")
        if not b.wait_for("navigator.serviceWorker.controller !== null",20):raise AssertionError("SW not controlling page")
        b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
        go("#/passport",".street-map__activate")
        check("offline view never triggers tile requests","document.querySelectorAll('.street-map__tile').length",0)
        go("#/place/houhai-village",".place-feature")
        check("editorial stories in offline cache","document.querySelector('.place-feature h3').textContent.length > 12")
        go("#/me",".rank-collection")
        check("ranks accessible offline","document.querySelectorAll('.rank-medal').length",6)
        print(f"v26 {done} browser checks passed",flush=True)
    finally:
        b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
