# -*- coding: utf-8 -*-
"""Check actual computed CSS foreground/background in major dark-theme surfaces."""
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
 def open_view(route,ready):
  b.go(base,route,cold=True)
  if not b.wait_for("!!document.querySelector("+repr(ready)+")",20):
   raise AssertionError(f"{route} did not load: {b.exceptions}")
 def contrast(title,text_selector,bg_selector,minimum=4.5):
  nonlocal done
  expression="""(()=>{
    const text=document.querySelector(TEXT),bg=document.querySelector(BG);
    if(!text||!bg)return -1;
    const rgb=str=>(str.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
    const light=str=>{
      const a=rgb(str).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
      return .2126*a[0]+.7152*a[1]+.0722*a[2];
    };
    const a=light(getComputedStyle(text).color),
      c=light(getComputedStyle(bg).backgroundColor);
    return Math.round((Math.max(a,c)+.05)/(Math.min(a,c)+.05)*100)/100;
  })()""".replace("TEXT",repr(text_selector)).replace("BG",repr(bg_selector))
  value=b.js(expression)
  if not isinstance(value,(int,float)) or value<minimum:
   raise AssertionError(f"{title}: measured {value}, expected >= {minimum}; {b.exceptions}")
  print(f"PASS {title}: {value}:1",flush=True);done+=1
 try:
  open_view("#/me",".quest-reset__trigger")
  b.js("document.querySelector('.quest-reset__trigger').click();true")
  for args in [
   ("reset title",".quest-reset__title",".quest-reset"),
   ("reset explanation",".quest-reset__description",".quest-reset"),
   ("reset warning heading",".quest-reset__confirm > strong",".quest-reset__confirm"),
   ("reset warning paragraph",".quest-reset__confirm > p",".quest-reset__confirm"),
   ("reset acknowledge label",".quest-reset__ack span",".quest-reset__confirm"),
   ("reset cancel button",".quest-reset__cancel",".quest-reset__cancel"),
   ("reset disabled confirm button",".quest-reset__delete",".quest-reset__delete")
  ]:contrast(*args)
  open_view("#/welcome",".welcome__joke-button")
  contrast("welcome joke button",".welcome__joke-button",".welcome__joke-button")
  open_view("#/games",".game-hub__card")
  contrast("game hub cards",".game-hub__card",".game-hub__card")
  open_view("#/games/snake",".snake-grid")
  contrast("retro arrow keys",".retro-controls__button",".retro-controls__button")
  contrast("arcade score",".retro-game__stats",".retro-game")
  open_view("#/must-do",".mustdo-card")
  for args in [
   ("bucket hero title",".mustdo-hero__title",".mustdo-hero"),
   ("bucket first card title",".mustdo-card__title",".mustdo-card"),
   ("bucket check label",".mustdo-card__check span",".mustdo-card"),
   ("bucket explanation",".mustdo-card__description",".mustdo-card"),
   ("bucket tip",".mustdo-card__tip",".mustdo-card"),
   ("bucket joke",".mustdo-card__joke",".mustdo-card"),
   ("bucket random button",".mustdo-hero__picker",".mustdo-hero__picker")
  ]:contrast(*args)
  print(f"v37 {done} computed dark-theme contrast checks passed",flush=True)
 finally:
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
