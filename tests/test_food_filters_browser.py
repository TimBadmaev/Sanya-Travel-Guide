# -*- coding: utf-8 -*-
"""Food facets integration, mobile layout and adjacent old app behavior."""
import json, os, socket, sys
sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1",0))
        return s.getsockname()[1]
def main():
    p=port(); server=serve(ROOT,p); b=Browser(width=320,height=740)
    base=f"http://127.0.0.1:{p}/";done=0
    def check(label, js, expected=True):
        nonlocal done
        value=b.js(js)
        if value!=expected: raise AssertionError(f"{label}: {value!r} != {expected!r}")
        done+=1;print("PASS",label,flush=True)
    def choose(key,value):
        return b.js(f"""(() => {{
          const e=document.querySelector('.food-filters .food-filter__select[aria-label={json.dumps(key)}]');
          e.value={json.dumps(value)};e.dispatchEvent(new Event('change',{{bubbles:true}}));return true;
        }})()""")
    try:
        b.go(base,"#/places?mode=food",cold=True)
        if not b.wait_for("document.querySelectorAll('.food-card').length===31",20):
            raise AssertionError(f"food load failed: {b.exceptions}")
        check("three select filters","document.querySelectorAll('.food-filter__select').length",3)
        check("all verified food, no draft","document.querySelectorAll('.food-card').length",31)
        choose("Район","yalong")
        check("yalong only","document.querySelectorAll('.food-card').length",16)
        choose("Кухня","coconut")
        check("coconut in Yalong","document.querySelectorAll('.food-card').length",4)
        choose("Средний чек","61-120")
        check("sourced coconut price band","document.querySelectorAll('.food-card').length",2)
        choose("Средний чек","over-120")
        check("empty from combined filters","!!document.querySelector('.food-scope-body--all .empty-state')")
        check("reset visible","!document.querySelector('.food-filter-footer__reset').hidden")
        b.js("document.querySelector('.food-filter-footer__reset').click();true")
        check("reset returns all", "document.querySelectorAll('.food-card').length",31)
        choose("Средний чек","unknown")
        check("unknown bucket has no fake cheap entries","document.querySelectorAll('.food-card').length",20)
        choose("Средний чек","any")
        check("320px no horizontal scroll","document.documentElement.scrollWidth <= innerWidth")
        check("tap target","[...document.querySelectorAll('.food-filter__select')].every(x=>x.getBoundingClientRect().height>=44)")
        check("no JS errors","!!"+str(not b.exceptions).lower())
        print(f"v30 {done} food-browser checks passed",flush=True)
    finally:
        b.close();server.shutdown();server.server_close()
if __name__=="__main__":main()
