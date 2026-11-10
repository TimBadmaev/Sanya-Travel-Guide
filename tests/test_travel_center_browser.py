# -*- coding: utf-8 -*-
"""v39 browser regression: actual mobile itinerary editor, persistence, safe backup and airplane mode."""
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
  if got!=expected:raise AssertionError(f"{label}: got {got!r}, expected {expected!r}; {b.exceptions}")
  print("PASS",label,flush=True);done+=1
 def await_view(route,selector):
  b.go(base,route,cold=True)
  if not b.wait_for("!!document.querySelector("+repr(selector)+")",20):
   raise AssertionError(f"{route} did not load: {b.exceptions}")
 try:
  await_view("#/my-trip",".trip-center__title")
  check("correct title","document.querySelector('.trip-center__title').textContent","Моя поездка")
  check("no flight numbers or dates fabricated","document.querySelectorAll('.trip-center__flight').length",0)
  check("eight document items","document.querySelectorAll('.trip-center__doc').length",8)
  check("quick China actions","document.querySelectorAll('.trip-center__action').length",6)
  check("mobile display fits 320px","document.documentElement.scrollWidth<=innerWidth")
  check("no embedded passport file upload","document.querySelectorAll('input[type=file]').length",0)
  # User adds a multi-segment flight route using actual controls.
  b.js("document.querySelectorAll('.trip-center__add')[0].click();true")
  check("outbound new segment inserted","document.querySelectorAll('.trip-center__flight-group')[0].querySelectorAll('.trip-center__flight').length",1)
  check("new segment editor opened","document.querySelector('.trip-center__flight').open")
  b.js("""(()=>{
    const fields=document.querySelector('.trip-center__flight-fields');
    const input=fields.querySelectorAll('input');
    input[0].value='Москва';input[0].dispatchEvent(new Event('change',{bubbles:true}));
    input[1].value='Пекин';input[1].dispatchEvent(new Event('change',{bubbles:true}));
    input[2].value='2026-11-12';input[2].dispatchEvent(new Event('change',{bubbles:true}));
    input[3].value='15:45';input[3].dispatchEvent(new Event('change',{bubbles:true}));
    input[6].value='CA123';input[6].dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()""")
  check("edited flight route stored in its own key","JSON.parse(localStorage.getItem('stg:travelcenter')).outbound[0].to","Пекин")
  check("flight date stored without timezone inference","JSON.parse(localStorage.getItem('stg:travelcenter')).outbound[0].date","2026-11-12")
  check("terminal cannot be filled with invented data","JSON.parse(localStorage.getItem('stg:travelcenter')).outbound[0].terminalTo","")
  b.js("document.querySelectorAll('.trip-center__add')[1].click();true")
  check("return trip is independently saved","JSON.parse(localStorage.getItem('stg:travelcenter')).inbound.length",1)
  # Mark offline copies — no file is actually added to app.
  b.js("document.querySelector('.trip-center__doc-checks input').click();true")
  check("offline document marker stored","JSON.parse(localStorage.getItem('stg:travelcenter')).docs.passport.offline")
  check("document counter honest","document.querySelector('.trip-center__documents-status').textContent.includes('1 из 8')")
  # Hotel contact editing stays independent from the authoritative stg:trip address.
  b.js("""(()=>{
    const items=[...document.querySelectorAll('.trip-center__hotel-fields .trip-center__field')];
    const name=items[0].querySelector('input');
    name.value='Отель в Ялунване';name.dispatchEvent(new Event('change',{bubbles:true}));
    const email=items[7].querySelector('input');
    email.value='host@example.com';email.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()""")
  check("hotel name persists","JSON.parse(localStorage.getItem('stg:travelcenter')).hotel.name","Отель в Ялунване")
  check("receiving contact email persists","JSON.parse(localStorage.getItem('stg:travelcenter')).hotel.contactEmail","host@example.com")
  check("receiving email link correctly appears","!![...document.querySelectorAll('.trip-center__contact')].find(x=>x.href.includes('host%40example.com')||x.href.includes('host@example.com'))")
  check("responsive flight forms fit screen","document.documentElement.scrollWidth<=innerWidth")
  await_view("#/my-trip",".trip-center__title")
  check("flight survives cold reload","document.querySelectorAll('.trip-center__flight').length",2)
  check("document flags survive cold reload","document.querySelector('.trip-center__doc-checks input').checked")
  check("hotel survives cold reload","[...document.querySelectorAll('.trip-center__hotel-fields input')][0].value","Отель в Ялунване")
  # Shared Chinese address (single authority) must render without overwriting flight edits.
  b.js("""(()=>{
    const original=JSON.parse(localStorage.getItem('stg:trip')||'{}');
    localStorage.setItem('stg:trip',JSON.stringify({...original,
      home:{nameRu:'Наш отель',addressZh:'三亚市亚龙湾'}}));return true;
  })()""")
  await_view("#/my-trip",".trip-center__title")
  check("shared Chinese address available","document.querySelector('.trip-center__zh').textContent","三亚市亚龙湾")
  check("existing taxi card reused","!!document.querySelector('.trip-center__address a[href=\"#/handy/taxi\"]')")
  check("separate itinerary survives hotel address edit","JSON.parse(localStorage.getItem('stg:travelcenter')).outbound[0].to","Пекин")
  await_view("#/me",".quest-me__trip")
  check("profile shortcut opens unified trip center","document.querySelector('.quest-me__trip-edit').getAttribute('href')","#/my-trip")
  await_view("#/",".travel-hub")
  check("home contains travel hub shortcut","!!document.querySelector('.travel-hub__action[href=\"#/my-trip\"]')")
  # Offline PWA cache works even after fully reloading the page.
  if not b.wait_for("navigator.serviceWorker.controller!==null",20):
   raise AssertionError("Service Worker not controlling page")
  b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
  await_view("#/my-trip",".trip-center__title")
  check("saved flight available offline","document.querySelectorAll('.trip-center__flight').length",2)
  check("shared Chinese address available offline","document.querySelector('.trip-center__zh').textContent","三亚市亚龙湾")
  check("document status available offline","document.querySelector('.trip-center__doc-checks input').checked")
  check("no JavaScript errors","true" if not b.exceptions else "false")
  print(f"v39 {done} travel center browser checks passed",flush=True)
 finally:
  try:b.send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
  except Exception:pass
  b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
