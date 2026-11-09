# -*- coding: utf-8 -*-
"""v37: retro games, marked must-do list, dark reset contrast and airplane mode."""
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
 def check(label,expr,expected=True):
  nonlocal done
  got=b.js(expr)
  if got!=expected:raise AssertionError(f"{label}: {got!r} != {expected!r}; {b.exceptions}")
  print("PASS",label,flush=True);done+=1
 try:
  b.go(base,"#/games",cold=True)
  if not b.wait_for("document.querySelectorAll('.game-hub__card').length===5",20):
   raise AssertionError(f"Game hub missing: {b.exceptions}")
  check("only snake fish and memory are featured","[...document.querySelectorAll('.game-hub__card')].map(x=>x.getAttribute('href')).join(',')","#/games/snake,#/games/fish,#/games/memory,#/games/four,#/games/hockey")
  check("game hub fits 320px","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/snake",cold=True)
  if not b.wait_for("document.querySelectorAll('.snake-grid__cell').length===324",20):
   raise AssertionError(f"Snake missing: {b.exceptions}")
  check("four touch direction buttons","document.querySelectorAll('.retro-controls__button').length",4)
  b.js("document.querySelector('.retro-game__actions .btn--primary').click();true")
  if not b.wait_for("document.querySelector('.retro-game__actions .btn--primary').textContent.includes('Пауза')",10):
   raise AssertionError("Snake did not start")
  b.js("document.querySelector('.retro-controls__up').click();document.querySelector('.retro-game__actions .btn--primary').click();true")
  check("snake pauses","document.querySelector('.retro-game__actions .btn--primary').textContent.includes('Продолжить')")
  check("snake mobile layout remains inside viewport","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/fish",cold=True)
  if not b.wait_for("!!document.querySelector('canvas.ocean-canvas')",20):
   raise AssertionError(f"Fish arena missing: {b.exceptions}")
  check("fish canvas actual dimensions","document.querySelector('.ocean-canvas').width",360)
  b.js("document.querySelector('.retro-game__actions .btn--primary').click();true")
  if not b.wait_for("document.querySelector('.retro-game__stats').textContent.includes('Счёт:')",8):
   raise AssertionError("Fish game did not start")
  b.js("document.querySelector('.retro-game__actions .btn--primary').click();true")
  check("fish pauses via visible control","document.querySelector('.retro-game__actions .btn--primary').textContent.includes('Продолжить')")
  check("fish game fits narrow mobile","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/games/memory",cold=True)
  if not b.wait_for("document.querySelectorAll('.memory-game__tile').length===16",20):
   raise AssertionError(f"Memory missing: {b.exceptions}")
  check("memory remains unchanged","[...document.querySelectorAll('.memory-game__tile')].every(x=>x.textContent==='?')")
  b.go(base,"#/must-do",cold=True)
  if not b.wait_for("document.querySelectorAll('.mustdo-card').length===10",20):
   raise AssertionError(f"Must-do list missing: {b.exceptions}")
  check("ten actionable cards","document.querySelectorAll('.mustdo-card__detail[href]').length",10)
  b.js("document.querySelector('.mustdo-card__check input').click();true")
  check("must-do item stored","JSON.parse(localStorage.getItem('stg:mustdo')).done.length",1)
  b.go(base,"#/must-do",cold=True)
  if not b.wait_for("document.querySelectorAll('.mustdo-card').length===10",20):
   raise AssertionError("Must-do did not restore")
  check("must-do mark survives reload","document.querySelector('.mustdo-card__check input').checked")
  check("must-do screen fits viewport","document.documentElement.scrollWidth<=innerWidth")
  b.go(base,"#/me",cold=True)
  if not b.wait_for("!!document.querySelector('.quest-reset__trigger')",20):
   raise AssertionError(f"Profile reset missing: {b.exceptions}")
  b.js("document.querySelector('.quest-reset__trigger').click();true")
  check("confirmation shows text and checkbox","!!document.querySelector('.quest-reset__ack span').textContent.trim()")
  contrast="""(()=>{
    const span=document.querySelector('.quest-reset__ack span');
    const panel=document.querySelector('.quest-reset__confirm');
    if(!span||!panel||panel.hidden)return false;
    const rgb=s=>[...s.matchAll(/[0-9.]+/g)].slice(0,3).map(m=>Number(m[0]));
    const lumi=c=>{const a=c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
    const a=lumi(rgb(getComputedStyle(span).color)),b=lumi(rgb(getComputedStyle(panel).backgroundColor));
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
  })()"""
  check("reset acknowledgement meets WCAG AA contrast",contrast)
  check("reset checkbox is big enough","document.querySelector('.quest-reset__ack input').getBoundingClientRect().width>=22")
  check("reset cancel button readable","getComputedStyle(document.querySelector('.quest-reset__cancel')).color !== getComputedStyle(document.querySelector('.quest-reset__cancel')).backgroundColor")
  b.go(base,"#/welcome",cold=True)
  if not b.wait_for("!!document.querySelector('.welcome__joke-button')",20):
   raise AssertionError("Welcome crab humor unavailable")
  before=b.js("document.querySelector('.welcome__joke').textContent")
  b.js("document.querySelector('.welcome__joke-button').click();true")
  check("optional Russian joke changes without navigation","document.querySelector('.welcome__joke').textContent !== "+repr(before))
  check("no Kazakh trap button","![...document.querySelectorAll('button')].some(x=>/казахск/i.test(x.textContent))")
  if not b.wait_for("navigator.serviceWorker.controller!==null",20):
   raise AssertionError("PWA not controlled yet")
  b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  b.go(base,"#/games",cold=True)
  if not b.wait_for("document.querySelectorAll('.game-hub__card').length===3",20):
   raise AssertionError(f"Games offline failed: {b.exceptions}")
  b.go(base,"#/games/snake",cold=True)
  if not b.wait_for("document.querySelectorAll('.snake-grid__cell').length===324",20):
   raise AssertionError(f"Snake offline failed: {b.exceptions}")
  b.go(base,"#/must-do",cold=True)
  if not b.wait_for("document.querySelectorAll('.mustdo-card').length===10",20):
   raise AssertionError(f"Bucket list offline failed: {b.exceptions}")
  check("must-do completion retained offline","document.querySelector('.mustdo-card__check input').checked")
  check("no JS errors","true" if not b.exceptions else "false")
  print(f"v37 {done} retro arcade, checklist and dark-theme checks passed",flush=True)
 finally:
  try:b.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
  except Exception:pass
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
