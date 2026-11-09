# -*- coding: utf-8 -*-
"""v32: no external map traffic, mapped places and proper offline restore."""
import json, os, socket, sys
sys.path.insert(0,os.path.dirname(__file__))
from cdp import Browser,serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
 with socket.socket() as s:
  s.bind(("127.0.0.1",0));return s.getsockname()[1]
def main():
 p=port(); server=serve(ROOT,p);b=Browser(width=320,height=720)
 base=f"http://127.0.0.1:{p}/";done=0
 def check(label,expr,expected=True):
  nonlocal done
  got=b.js(expr)
  if got!=expected:raise AssertionError(f"{label}: {got!r} != {expected!r}")
  print("PASS",label,flush=True);done+=1
 try:
  b.go(base,"#/island",cold=True)
  if not b.wait_for("document.querySelector('.island-atlas__svg')&&!document.querySelector('.loading')",20):
   raise AssertionError(f"atlas never loaded: {b.exceptions}")
  check("actual 1:50m path is present","document.querySelectorAll('.island-atlas__land').length",1)
  check("island has curated place markers","document.querySelectorAll('.island-atlas__pin').length>=28")
  check("two geographic map scales","document.querySelectorAll('.island-atlas__toolbar button').length",2)
  check("no online tile requests","performance.getEntriesByType('resource').filter(x=>/tile[.]openstreetmap|[.]png[?]tile/.test(x.name)).length",0)
  check("narrow 320px remains inside viewport","document.documentElement.scrollWidth<=innerWidth")
  b.js("document.querySelector('.island-atlas__toolbar button:nth-child(2)').click();true")
  check("full island selected","document.querySelector('.island-atlas__toolbar button:nth-child(2)').getAttribute('aria-pressed')","true")
  b.js("document.querySelector('.island-atlas__filter').value='yalong';document.querySelector('.island-atlas__filter').dispatchEvent(new Event('change'));true")
  check("region filters markers","[...document.querySelectorAll('.island-atlas__pin')].some(p=>p.style.display==='none')")
  check("region still has linked places","document.querySelectorAll('.island-atlas__item').length>=2")
  if not b.wait_for("navigator.serviceWorker.controller!==null",20):raise AssertionError("SW not active")
  b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  b.go(base,"#/island",cold=True)
  if not b.wait_for("document.querySelector('.island-atlas__svg')",20):
   diagnostics=b.js("""(async()=>({
      hash:location.hash,ready:document.readyState,ctrl:!!navigator.serviceWorker.controller,
      html:document.querySelector('#view')?.innerText?.slice(0,500),
      script:!!document.querySelector('script[type="module"]'),
      caches:await Promise.all((await caches.keys()).map(async name=>({name,
         count:(await (await caches.open(name)).keys()).length,
         coast:!!await(await caches.open(name)).match(new URL('data/hainan-coast.json',document.baseURI))
      })))
   }))()""")
   raise AssertionError(f"atlas did not load offline: {b.exceptions}, diagnostics={diagnostics}")
  check("natural-earth polygon cached offline","document.querySelector('.island-atlas__land').getAttribute('d').length>100")
  check("no JS errors offline","true" if not b.exceptions else "false")
  print(f"v32 {done} geographic map checks passed",flush=True)
 finally:
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
