# -*- coding: utf-8 -*-
"""v36: critical game UX, honest offline status, persistence and airplane mode."""
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
 def check(label,expression,expected=True):
  nonlocal done
  got=b.js(expression)
  if got!=expected:raise AssertionError(f"{label}: {got!r} != {expected!r}; {b.exceptions}")
  print("PASS",label,flush=True);done+=1
 try:
  b.go(base,"#/games",cold=True)
  if not b.wait_for("!!document.querySelector('.game-hub__card')",20):
   raise AssertionError(f"Game hub not available: {b.exceptions}")
  check("3 standalone offline games","document.querySelectorAll('.game-hub__card').length",3)
  check("mobile games fit narrow viewport","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/sea",cold=True)
  if not b.wait_for("!!document.querySelector('.naval-game__new button')",20):
   raise AssertionError(f"Naval game unavailable: {b.exceptions}")
  b.js("document.querySelector('.naval-game__new button').click();true")
  check("two naval boards","document.querySelectorAll('.naval-game__grid').length",2)
  check("all 64 enemy cells accessible","document.querySelectorAll('button.naval-game__cell').length",64)
  check("ship placement not exposed in enemy DOM","!document.querySelector('.naval-game__boards .naval-game__board:nth-child(2) .is-ship')")
  b.js("document.querySelector('button.naval-game__cell').click();true")
  check("human and computer make one move each","JSON.parse(localStorage.getItem('stg:games')).match.shots.every(x=>x.length===1)")
  check("game state stored in localStorage","JSON.parse(localStorage.getItem('stg:games')).match.v",1)
  b.go(base,"#/games/sea",cold=True)
  if not b.wait_for("document.querySelectorAll('.naval-game__grid').length===2",20):
   raise AssertionError(f"Naval match did not restore: {b.exceptions}")
  check("game recovers after reload","JSON.parse(localStorage.getItem('stg:games')).match.shots[0].length",1)
  # Start a new two-player game without triggering the destructive action dialog.
  b.js("localStorage.removeItem('stg:games');true")
  b.go(base,"#/games/sea",cold=True)
  if not b.wait_for("document.querySelectorAll('.naval-game__new button').length===2",20):
   raise AssertionError("Mode picker unavailable")
  b.js("document.querySelectorAll('.naval-game__new button')[1].click();true")
  check("two-player handoff hides all boards","document.querySelectorAll('.naval-game__grid').length",0)
  b.js("document.querySelector('.naval-game__handoff button').click();true")
  check("first player can see own board","document.querySelectorAll('.naval-game__grid').length",2)
  b.js("document.querySelector('button.naval-game__cell').click();true")
  check("after shot next player sees covered handoff screen","document.querySelectorAll('.naval-game__grid').length",0)
  b.go(base,"#/games/phrases",cold=True)
  if not b.wait_for("document.querySelectorAll('.phrase-game__option').length===4",20):
   raise AssertionError(f"Phrase quiz did not start: {b.exceptions}")
  b.js("document.querySelector('.phrase-game__option').click();true")
  check("quiz reveals correct answer","!document.querySelector('.phrase-game__next').hidden")
  b.go(base,"#/games/memory",cold=True)
  if not b.wait_for("document.querySelectorAll('.memory-game__tile').length===16",20):
   raise AssertionError(f"Memory game did not start: {b.exceptions}")
  check("memory displays 16 hidden tiles","[...document.querySelectorAll('.memory-game__tile')].every(x=>x.textContent==='?')")
  b.go(base,"#/offline",cold=True)
  if not b.wait_for("document.querySelectorAll('.offline-center__item').length===4",20):
   raise AssertionError(f"Readiness not available: {b.exceptions}")
  check("offline check never downloads optional detail packs","performance.getEntriesByType('resource').filter(r=>r.name.includes('sanya-detail-')).length",0)
  if not b.wait_for("navigator.serviceWorker.controller!==null",20):
   raise AssertionError("App worker not ready")
  b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  b.go(base,"#/games",cold=True)
  if not b.wait_for("document.querySelectorAll('.game-hub__card').length===3",20):
   raise AssertionError(f"Game hub offline failed: {b.exceptions}")
  check("offline game hub remains narrow","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/phrases",cold=True)
  if not b.wait_for("document.querySelectorAll('.phrase-game__option').length===4",20):
   raise AssertionError(f"Quiz offline failed: {b.exceptions}")
  check("no JS exceptions","true" if not b.exceptions else "false")
  print(f"v36 {done} offline games and readiness checks passed",flush=True)
 finally:
  try:b.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
  except Exception:pass
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
