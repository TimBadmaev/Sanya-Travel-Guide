# -*- coding: utf-8 -*-
"""v38: island terrain, new playable multiplayer modes, and offline redraw."""
import os,socket,sys
sys.path.insert(0,os.path.dirname(__file__))
from cdp import Browser,serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
 with socket.socket() as s:
  s.bind(("127.0.0.1",0));return s.getsockname()[1]
def main():
 p=port();server=serve(ROOT,p);b=Browser(width=320,height=740)
 base=f"http://127.0.0.1:{p}/";done=0
 def check(name,js,expected=True):
  nonlocal done
  got=b.js(js)
  if got!=expected:raise AssertionError(f"{name}: {got!r} != {expected!r}; errors={b.exceptions}")
  print("PASS",name,flush=True);done+=1
 try:
  b.go(base,"#/island",cold=True)
  if not b.wait_for("!!document.querySelector('.island-atlas__geo-grid')",20):
   raise AssertionError(f"Atlas failed: {b.exceptions}")
  check("geographic latitude and longitude grid","document.querySelectorAll('.island-atlas__geo-grid line').length",6)
  check("real terrain image is present","document.querySelectorAll('image.island-atlas__relief').length",1)
  check("authentic Hainan coastline untouched","document.querySelector('.island-atlas__land').getAttribute('d').length>100")
  check("decorative shelf surrounds actual coastline","document.querySelectorAll('.island-atlas__shelf-wide,.island-atlas__shelf-narrow').length",2)
  check("compass visible","document.querySelectorAll('.island-atlas__compass').length",1)
  check("pins initially hidden to show real terrain","[...document.querySelectorAll('.island-atlas__pin')].every(x=>x.style.display==='none')")
  b.js("document.querySelector('.island-atlas__pin-toggle').click();true")
  check("pin toggle reveals geocoded places","[...document.querySelectorAll('.island-atlas__pin')].some(x=>x.style.display!=='none')")
  check("atlas fits narrow screen","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/four",cold=True)
  if not b.wait_for("document.querySelectorAll('.duo-four__drop').length===7",20):
   raise AssertionError(f"Connect Four failed: {b.exceptions}")
  check("connect four board has 42 cells","document.querySelectorAll('.duo-four__cell').length",42)
  b.js("document.querySelector('.duo-four__drop').click();true")
  check("first player chip persisted","JSON.parse(localStorage.getItem('stg:games')).fourMatch.moves",1)
  check("first chip falls to the bottom","document.querySelectorAll('.duo-four__cell.is-yellow').length",1)
  b.go(base,"#/games/four",cold=True)
  if not b.wait_for("document.querySelectorAll('.duo-four__cell.is-yellow').length===1",20):
   raise AssertionError(f"Saved Connect Four match not restored: {b.exceptions}")
  check("connect four survives reload","document.querySelectorAll('.duo-four__cell.is-yellow').length",1)
  check("board fits phone","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/hockey",cold=True)
  if not b.wait_for("!!document.querySelector('canvas.duo-hockey__canvas')",20):
   raise AssertionError(f"Air Hockey missing: {b.exceptions}")
  check("hockey frame is portrait","document.querySelector('.duo-hockey__canvas').height",520)
  b.js("document.querySelector('.duo-game__actions .btn--primary').click();true")
  check("hockey starts","document.querySelector('.duo-game__actions .btn--primary').textContent.includes('Пауза')")
  b.js("document.querySelector('.duo-game__actions .btn--primary').click();true")
  check("hockey pauses","document.querySelector('.duo-game__actions .btn--primary').textContent.includes('Продолжить')")
  check("hockey game fits phone","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/fish",cold=True)
  if not b.wait_for("!!document.querySelector('canvas.ocean-canvas')",20):
   raise AssertionError("Fish game missing")
  b.js("document.querySelector('.retro-game__actions .btn--primary').click();true")
  check("fish animates with pause controls","document.querySelector('.retro-game__actions .btn--primary').textContent.includes('Пауза')")
  if not b.wait_for("navigator.serviceWorker.controller!==null",20):
   raise AssertionError("PWA not controlled")
  b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  for route,selector in [("#/island",".island-atlas__relief"),("#/games/four",".duo-four__board"),("#/games/hockey",".duo-hockey__canvas")]:
   b.go(base,route,cold=True)
   if not b.wait_for("!!document.querySelector("+repr(selector)+")",20):
    raise AssertionError(f"{route} unavailable offline: {b.exceptions}")
   done+=1;print("PASS offline "+route,flush=True)
  check("offline Connect Four preserved state","document.querySelector('.duo-four__cell.is-yellow')!==null") if route=="#/games/four" else None
  check("no JavaScript errors","true" if not b.exceptions else "false")
  print(f"v38 {done} atlas/game/offline browser checks passed",flush=True)
 finally:
  try:b.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
  except Exception:pass
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
