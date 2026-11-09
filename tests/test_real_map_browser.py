# -*- coding: utf-8 -*-
"""v35: optional OSM district downloads, true offline reload, routes and viewport."""
import json,os,socket,sys
sys.path.insert(0,os.path.dirname(__file__))
from cdp import Browser,serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
 with socket.socket() as s:
  s.bind(("127.0.0.1",0));return s.getsockname()[1]
def main():
 p=port();server=serve(ROOT,p);b=Browser(width=320,height=740);done=0
 base=f"http://127.0.0.1:{p}/"
 def check(label,expr,expected=True):
  nonlocal done
  got=b.js(expr)
  if got!=expected:raise AssertionError(f"{label}: {got!r} != {expected!r}; {b.exceptions}")
  print("PASS",label,flush=True);done+=1
 try:
  b.go(base,"#/map",cold=True)
  if not b.wait_for("!!document.querySelector('.map-page__canvas')&&!document.querySelector('.loading')",20):
   raise AssertionError(f"Real map not ready: {b.exceptions}")
  check("canvas draws real local map","document.querySelector('.map-page__canvas').width>0")
  check("local map has road source credit","document.querySelector('.map-page__attribution').textContent.includes('OpenStreetMap')")
  check("road data bundled, no auto-fetch of OSM tiles","performance.getEntriesByType('resource').filter(x=>x.name.includes('tile.openstreetmap.org')).length",0)
  check("local map shows points of interest","document.querySelectorAll('.map-page__pin').length>1")
  check("select A, B and walking/car modes","document.querySelectorAll('.map-page__selects select').length",3)
  check("320px map has no horizontal overflow","document.documentElement.scrollWidth<=innerWidth")
  b.js("""(()=>{
   const s=document.querySelectorAll('.map-page__selects select');
   s[0].value='yalong-bay-beach';s[0].dispatchEvent(new Event('change'));
   s[1].value='luhuitou-park';s[1].dispatchEvent(new Event('change'));
   return true;
  })()""")
  check("Amap actual A-to-B link","document.querySelector('.map-page__actions a').href.includes('uri.amap.com/navigation?from=')")
  check("Yandex is an alternative","document.querySelectorAll('.map-page__actions a')[1].href.includes('yandex.ru/maps/')")
  b.js("document.querySelector('.map-page__pick').click();true")
  check("manual map-point mode visible","!document.querySelector('.map-page__pick-note').hidden")
  check("offline map can zoom","document.querySelectorAll('.map-page__zoom button').length",2)
  check("all five areas accessible","document.querySelectorAll('.map-page__focus button').length",5)
  check("manual detail download controls present","document.querySelectorAll('.map-page__pack-actions button').length",2)
  check("map renders scale","document.querySelector('.map-page__scale').textContent.length>0")
  check("detail is NOT downloaded without consent","performance.getEntriesByType('resource').filter(x=>x.name.includes('sanya-detail-')).length",0)
  b.js("document.querySelector('.map-page__pack-actions button').click();true")
  if not b.wait_for("document.querySelector('.map-page__pack-actions button').textContent.includes('✓')",20):
   raise AssertionError(f"Optional area did not download: {b.exceptions}")
  check("explicit pack stored in independent offline cache","(async()=>{const c=await caches.open('sanya-detail-v35');return !!await c.match(new URL('data/sanya-detail-yalong.json',document.baseURI))})()")
  if not b.wait_for("navigator.serviceWorker.controller!==null",20):
   raise AssertionError("SW not controlling page")
  b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  b.go(base,"#/map",cold=True)
  if not b.wait_for("!!document.querySelector('.map-page__canvas')&&document.querySelector('.map-page__canvas').width>0",20):
   raise AssertionError(f"Offline street map cannot load: {b.exceptions}")
  check("raw road vectors remain usable offline","(async()=>{const c=(await caches.keys()).find(x=>x.startsWith('sanya-guide-v36'));return !!c&&!!await(await caches.open(c)).match(new URL('data/sanya-roads.json',document.baseURI))})()")
  check("offline map remains interactive","document.querySelectorAll('.map-page__focus button').length",5)
  if not b.wait_for("document.querySelector('.map-page__pack-actions button').textContent.includes('✓')",20):
   raise AssertionError(f"Optional district not restored offline: {b.exceptions}")
  check("optional offline layer recovered after cold reload","document.querySelector('.map-page__pack-info').textContent.includes('1 из 5')")
  check("no browser errors", "true" if not b.exceptions else "false")
  print(f"v35 {done} area-map/route tests passed",flush=True)
 finally:
  try:b.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
  except Exception:pass
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
