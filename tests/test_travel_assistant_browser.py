# -*- coding: utf-8 -*-
"""v40: search all verified local catalogs, first-day checklist, reload and offline."""
import os,socket,sys
sys.path.insert(0,os.path.dirname(__file__))
from cdp import Browser,serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
 with socket.socket() as s:
  s.bind(("127.0.0.1",0));return s.getsockname()[1]
def main():
 port=free_port();server=serve(ROOT,port);browser=Browser(width=320,height=740)
 base=f"http://127.0.0.1:{port}/";done=0
 def check(label,expression,expected=True):
  nonlocal done
  got=browser.js(expression)
  if got!=expected:
   raise AssertionError(f"{label}: {got!r} != {expected!r}; errors={browser.exceptions}")
  print("PASS",label,flush=True);done+=1
 def open_view(route,ready):
  browser.go(base,route,cold=True)
  if not browser.wait_for("!!document.querySelector("+repr(ready)+")",20):
   raise AssertionError(f"{route}: missing {ready}, errors={browser.exceptions}")
 try:
  open_view("#/assistant",".assistant-hub__search")
  if not browser.wait_for("document.querySelector('.assistant-hub__results').textContent.includes('Введи слово')",20):
   raise AssertionError(f"Search catalog not ready: {browser.exceptions}")
  check("header search is accessible","document.querySelector('.app-header__assistant').getAttribute('href')","#/assistant")
  check("six quick actions exist","document.querySelectorAll('.assistant-hub__action').length",6)
  check("helper offers first day checklist","document.querySelector('.assistant-hub__guide-link').getAttribute('href')","#/arrival-24h")
  check("assistant fits 320px","document.documentElement.scrollWidth<=innerWidth")
  browser.js("""(()=>{
   const input=document.querySelector('.assistant-hub__search');
   input.value='кокос';input.dispatchEvent(new Event('input',{bubbles:true}));return true;
  })()""")
  if not browser.wait_for("document.querySelectorAll('.assistant-hub__result').length>0",15):
   raise AssertionError(f"Coconut food match missing: {browser.exceptions}")
  check("coconut returns food search","!!document.querySelector('.assistant-hub__result[href^=\"#/places?mode=food&q=\"]')")
  check("live results all have links","[...document.querySelectorAll('.assistant-hub__result')].every(x=>x.getAttribute('href').startsWith('#/'))")
  browser.js("document.querySelector('.assistant-hub__search').value='Наньшань';document.querySelector('.assistant-hub__search').dispatchEvent(new Event('input',{bubbles:true}));true")
  check("excursion result exists","!!document.querySelector('.assistant-hub__result[href^=\"#/excursion/\"]')")
  browser.js("document.querySelector('.assistant-hub__search').value='такси';document.querySelector('.assistant-hub__search').dispatchEvent(new Event('input',{bubbles:true}));true")
  check("taxi returns info card","!!document.querySelector('.assistant-hub__result[href^=\"#/info/\"]')")
  browser.js("document.querySelector('.assistant-hub__search').value='помогите';document.querySelector('.assistant-hub__search').dispatchEvent(new Event('input',{bubbles:true}));true")
  check("Chinese language phrase available","!!document.querySelector('.assistant-hub__result[href^=\"#/handy/phrase/\"]')")
  check("search fits after typing","document.documentElement.scrollWidth<=innerWidth")
  open_view("#/assistant?q=кокос",".assistant-hub__search")
  if not browser.wait_for("document.querySelector('.assistant-hub__search').value==='кокос'&&document.querySelectorAll('.assistant-hub__result').length>0",20):
   raise AssertionError("Deep linked search does not work")
  href=browser.js("document.querySelector('.assistant-hub__result[href^=\"#/places?mode=food&q=\"]').getAttribute('href')")
  open_view(href,".search-bar__input")
  check("food search receives query","document.querySelector('.search-bar__input').value.length>0")
  open_view("#/arrival-24h",".assistant-arrival__title")
  check("first day has nine steps","document.querySelectorAll('.assistant-arrival__step').length",9)
  check("stages correctly separated","document.querySelectorAll('.assistant-arrival__section').length",4)
  check("nothing is automatically marked done","document.querySelectorAll('.assistant-arrival__check input:checked').length",0)
  check("two phone offline warning exists","document.querySelector('.assistant-arrival__footer').textContent.includes('каждом телефоне отдельно')")
  check("first-day fits 320px","document.documentElement.scrollWidth<=innerWidth")
  browser.js("document.querySelector('.assistant-arrival__check input').click();true")
  check("first-day saved in dedicated user-data key","JSON.parse(localStorage.getItem('stg:arrival')).done.length",1)
  check("first-day counter updated","document.querySelector('.assistant-arrival__stat').textContent.includes('1 / 9')")
  open_view("#/arrival-24h",".assistant-arrival__title")
  check("first-day survived reload","document.querySelector('.assistant-arrival__check input').checked")
  open_view("#/handy/phrase/help",".taxi__content")
  check("phrase shows Chinese characters","document.querySelector('.taxi__name').textContent.length>0")
  check("local voice control is explicit","!!document.querySelector('.handy__local-tts')")
  check("local voice is not enabled unless a trusted local voice exists","document.querySelector('.handy__local-tts').disabled||document.querySelector('.handy__local-tts').textContent.includes('Произнести')")
  open_view("#/",".quest-home")
  check("home links to search","!!document.querySelector('a.quest-assistant[href=\"#/assistant\"]')")
  open_view("#/discover",".discover__search")
  check("discover links to universal search","document.querySelector('.discover__search').getAttribute('href')","#/assistant")
  if not browser.wait_for("navigator.serviceWorker.controller!==null",20):
   raise AssertionError("PWA SW missing")
  browser.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  open_view("#/assistant",".assistant-hub__search")
  if not browser.wait_for("document.querySelector('.assistant-hub__results').textContent.includes('Введи слово')",20):
   raise AssertionError("Offline search cannot load local catalogs")
  browser.js("document.querySelector('.assistant-hub__preset').click();true")
  if not browser.wait_for("document.querySelectorAll('.assistant-hub__result').length>0",20):
   raise AssertionError("Offline preset query did not return places")
  check("offline search result available","!!document.querySelector('.assistant-hub__result[href^=\"#/place/\"]')")
  open_view("#/arrival-24h",".assistant-arrival__title")
  check("first-day checklist available offline","document.querySelectorAll('.assistant-arrival__step').length",9)
  check("first-day mark preserved offline","document.querySelector('.assistant-arrival__check input').checked")
  check("no JavaScript exceptions","true" if not browser.exceptions else "false")
  print(f"v40 {done} Search / Arrival / Mobile / Offline UI checks passed",flush=True)
 finally:
  try:browser.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
  except Exception:pass
  browser.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
