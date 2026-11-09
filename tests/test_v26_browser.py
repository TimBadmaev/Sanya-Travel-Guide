# -*- coding: utf-8 -*-
"""v26 Chrome: no map network before click, collectible ranks, offline explorer."""
import json, os, socket, sys
sys.path.insert(0,os.path.dirname(__file__))
from cdp import Browser, serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0))
        return sock.getsockname()[1]

def main():
    p=port()
    server=serve(ROOT,p)
    b=Browser(width=375,height=812)
    base=f"http://127.0.0.1:{p}/"
    tests=0
    def go(path,selector):
        b.go(base,path,cold=True)
        if not b.wait_for(f"location.hash === {json.dumps(path)} && !!document.querySelector({json.dumps(selector)}) && !document.querySelector('#view .loading')",22):
            raise AssertionError(f"Render {path} failed: {b.exceptions}")
        if b.exceptions:
            raise AssertionError(f"JS exceptions: {b.exceptions}")
    def check(label,expression,expected=True):
        nonlocal tests
        value=b.js(expression)
        if value!=expected:raise AssertionError(f"{label}: {value!r}, expected {expected!r}")
        tests+=1
        print("  PASS",label,flush=True)
    try:
        go("#/settings",".view-title")
        trip={"start":"2026-11-13","end":"2026-11-26","area":"yalong","stay":None,"home":None}
        seed={"stg:trip":trip,"stg:saved":["yalong-bay-beach"],"stg:passport":{"v":1,"visits":{
          "yalong-bay-beach":{"date":"2026-11-15","at":"2026-11-15T10:00:00Z","note":"Был тут"}}},
          "stg:explore":{"v":1,"completed":["sea"]}}
        b.js("(()=>{const d="+json.dumps(seed)+";Object.entries(d).forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));return true})()")
        go("#/passport",".atlas__svg")
        check("offline atlas loaded","!!document.querySelector('.atlas__svg')")
        check("online street map is not automatically expanded","document.querySelector('.street-map__frame').hidden")
        check("no network tile elements on arrival","document.querySelectorAll('.street-map__tile').length",0)
        check("visible OSM opt-in button","document.querySelector('.street-map__load').textContent.includes('Загрузить')")
        check("all verified places represented (including clusters)","document.querySelector('.atlas__count').textContent.includes('55 мест')")
        check("visited spots get animated coloration","document.querySelectorAll('.atlas__reveal').length >= 1")
        check("atlas has cluster buttons","document.querySelectorAll('.atlas__point').length > 0")
        b.js("document.querySelector('.atlas__point').dispatchEvent(new Event('click',{bubbles:true}));true")
        check("atlas group expands into place links","!document.querySelector('.atlas__preview').hidden")
        check("atlas group always points to real place","document.querySelector('.atlas__preview-links a').getAttribute('href').startsWith('#/place/')")
        check("old seven-area game map still present","document.querySelectorAll('.pp-badge').length",7)
        if not b.wait_for("!!document.querySelector('.passport .rank-card')", 15):
            raise AssertionError("Awards did not render in passport")
        check("rank awards embedded in passport","!!document.querySelector('.passport .rank-card')")
        check("milestone collection has six badges","document.querySelectorAll('.passport .rank-card__badge').length",6)
        check("only first milestone initially earned","document.querySelectorAll('.passport .rank-card__badge.is-earned').length",1)
        b.js("document.querySelector('.street-map__load').click();true")
        check("explicit click loads viewport tiles","document.querySelectorAll('.street-map__tile').length > 0")
        check("all requested tiles from OSM","[...document.querySelectorAll('.street-map__tile')].every(e=>e.src.startsWith('https://tile.openstreetmap.org/'))")
        b.js("document.querySelector('.street-map__load').click();true")
        check("hiding map detaches all loaded tile images","document.querySelectorAll('.street-map__tile').length",0)
        go("#/me",".rank-card")
        check("same profile and passport level","document.querySelector('.rank-card__title').textContent.includes('Первопроходец')")
        check("six milestones in profile","document.querySelectorAll('.quest-me .rank-card__badge').length",6)
        check("profile still offers backup and reset","!!document.querySelector('.quest-reset__trigger') && !!document.querySelector('.quest-me__link[href=\"#/data\"]')")
        go("#/excursions",".excursion-card")
        check("38 excursion cards","document.querySelectorAll('.excursion-card').length",38)
        go("#/excursion/phoenix-haiyue-sunset",".excursion-story")
        check("new rich route story","document.querySelectorAll('.excursion-story__steps li').length >= 3")
        check("new route gallery credits","document.querySelectorAll('.excursion-gallery__credit').length >= 1")
        go("#/place/phoenix-island-sanya",".place-detail__summary")
        check("new place has credited Commons image","document.querySelector('.place-photo__credit').textContent.includes('CC BY')")
        for width,height in [(320,568),(375,812),(414,896)]:
            b.set_viewport(width,height)
            go("#/passport",".atlas__svg")
            check(f"atlas no overflow at {width}px","document.documentElement.scrollWidth <= innerWidth")
            go("#/me",".rank-card")
            check(f"profile no overflow at {width}px","document.documentElement.scrollWidth <= innerWidth")
        b.set_viewport(375,812)
        go("#/passport",".atlas__svg")
        if not b.wait_for("navigator.serviceWorker.controller !== null",20):raise AssertionError("SW controller missing")
        b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
        go("#/passport",".atlas__svg")
        check("atlas opens offline","!!document.querySelector('.atlas__svg')")
        check("online tiles absent offline by default","document.querySelectorAll('.street-map__tile').length",0)
        go("#/me",".rank-card")
        check("badges available offline","document.querySelectorAll('.rank-card__badge').length",6)
        go("#/excursion/phoenix-haiyue-sunset",".excursion-story")
        check("new editorial story is offline","document.querySelector('.excursion-story__steps').textContent.length > 100")
        print(f"v26 {tests} browser checks passed",flush=True)
    finally:
        b.close()
        server.shutdown()
        server.server_close()

if __name__=="__main__":main()
