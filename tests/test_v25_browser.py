# -*- coding: utf-8 -*-
"""v25 mobile E2E: before-trip checklist, XP, diary, reset and offline."""
import json
import os
import socket
import sys
sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE_NOW = """
(() => {
  const Base = Date, value = new Base(2026, 10, 9, 10, 0).getTime();
  class TestDate extends Base {
    constructor(...args) { if (args.length) super(...args); else super(value); }
    static now() { return value; }
  }
  window.Date = TestDate;
})();
"""
def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def main():
    p = port()
    server = serve(ROOT, p)
    b = Browser(width=375, height=812)
    b.add_init_script(FAKE_NOW)
    base = f"http://127.0.0.1:{p}/"
    count = 0

    def go(path, selector):
        b.go(base, path, cold=True)
        if not b.wait_for(f"location.hash === {json.dumps(path)} && !!document.querySelector({json.dumps(selector)}) && !document.querySelector('#view .loading')", 20):
            raise AssertionError(f"no view {path}: {b.exceptions}")
        if b.exceptions:
            raise AssertionError(f"JS errors {path}: {b.exceptions}")
    def check(name, code, expected=True):
        nonlocal count
        value = b.js(code)
        if value != expected:
            raise AssertionError(f"{name}: {value!r} != {expected!r}")
        count += 1
        print("PASS", name, flush=True)
    try:
        go("#/settings", ".view-title")
        trip = {"start":"2026-11-13","end":"2026-11-26","area":"yalong","stay":None,"home":None}
        data = {
            "stg:trip": trip,
            "stg:saved": ["yalong-bay-beach"],
            "stg:expenses": {"v":1, "items":[{"id":"exp-reset","date":"2026-11-09","amount":20,"currency":"CNY","category":"food"}]},
            "stg:explore": {"v":1, "completed":["sea"]},
            "stg:passport": {"v":1, "visits":{"yalong-bay-beach":{"date":"2026-11-09","at":"2026-11-09T08:00:00Z","note":"для теста"}}},
            "stg:activity": {"v":1, "days":["2026-11-09"]},
        }
        b.js("(() => { const data=" + json.dumps(data) +
             "; for(const [k,v] of Object.entries(data))localStorage.setItem(k,JSON.stringify(v)); return true; })()")
        go("#/", ".quest-preflight")
        check("prioritize preparation before game", 
              "document.querySelector('.quest-preflight').getBoundingClientRect().top < document.querySelector('.quest-intro').getBoundingClientRect().top")
        check("countdown 4 days before 13 November",
              "document.querySelector('.quest-preflight__title').textContent.includes('4 дня')")
        check("24 preflight checklist items excluding after-arrival",
              "document.querySelector('.quest-preflight__meter strong').textContent", "Готово 0 из 24")
        check("four real checkboxes shown", "document.querySelectorAll('.quest-preflight__task input[type=\"checkbox\"]').length",4)
        check("documents are included", "document.querySelector('.quest-preflight__tasks').textContent.includes('Документы')")
        check("packing is included", "document.querySelector('.quest-preflight__tasks').textContent.includes('Чемодан')")
        check("full checklist link available", "document.querySelector('.quest-preflight__primary').getAttribute('href')", "#/prepare")
        xp_before = b.js("Number(document.querySelector('.quest-hud__xp').textContent.match(/\\d+/)[0])")
        task_id = b.js("document.querySelector('.quest-preflight__task input').dataset.taskId")
        b.js("document.querySelector('.quest-preflight__task input').click();true")
        check("completed task saves in standard storage",
              f"JSON.parse(localStorage.getItem('stg:checklist'))[{json.dumps(task_id)}]",True)
        check("home checklist meter updates immediately",
              "document.querySelector('.quest-preflight__meter strong').textContent","Готово 1 из 24")
        go("#/", ".quest-preflight")
        check("+4 XP granted for a completed task",
              f"Number(document.querySelector('.quest-hud__xp').textContent.match(/\\d+/)[0]) - {xp_before}",4)
        go("#/prepare", ".phase-list")
        check("same item remains completed in full checklist",
              f"JSON.parse(localStorage.getItem('stg:checklist'))[{json.dumps(task_id)}]",True)
        go("#/me", ".quest-reset")
        check("reset panel initially hidden", "document.querySelector('.quest-reset__confirm').hidden",True)
        b.js("document.querySelector('.quest-reset__trigger').click();true")
        check("explicit reset warning displayed", "!document.querySelector('.quest-reset__confirm').hidden")
        check("confirmation disabled before acknowledgement", "document.querySelector('.quest-reset__delete').disabled")
        b.js("document.querySelector('.quest-reset__cancel').click();true")
        check("cancel leaves all data untouched", "!!localStorage.getItem('stg:passport')")
        b.js("document.querySelector('.quest-reset__trigger').click();document.querySelector('.quest-reset__ack input').click();true")
        check("explicit consent enables destructive button", "!document.querySelector('.quest-reset__delete').disabled")
        b.js("document.querySelector('.quest-reset__delete').click();true")
        if not b.wait_for("location.hash === '#/welcome' && !!document.querySelector('.welcome')",20):
            raise AssertionError("No welcome screen after reset")
        count += 1
        print("PASS after confirmed reset new onboarding opens",flush=True)
        check("all user data keys removed, no accidental localStorage.clear",
              "(async()=>{ const S=await import('./js/storage.js'); return S.USER_DATA_KEYS.every(k=>localStorage.getItem(k)===null) })()")
        check("no old user trip or XP", "!localStorage.getItem('stg:trip') && !localStorage.getItem('stg:activity')")
        go("#/", ".welcome")
        check("start from scratch re-enters welcome", "location.hash","#/welcome")
        # Previously completed items are erased along with user data, not the content.
        b.js("document.querySelector('.welcome__secondary').click();true")
        if not b.wait_for("location.hash === '#/' && !!document.querySelector('.quest-preflight')",20):
            raise AssertionError("Onboarding skip did not open main")
        check("empty trip opens preflight guidance", "document.querySelector('.quest-preflight__title').textContent","Сначала подготовимся!")
        check("no checklist state after reset", "document.querySelector('.quest-preflight__meter strong').textContent","Готово 0 из 24")
        check("XP starts at zero after reset", "document.querySelector('.quest-hud__xp').textContent.includes('0 XP')")

        b.js("localStorage.setItem('stg:trip', JSON.stringify({start:'2026-11-01',end:'2026-11-26',area:'yalong',stay:null,home:null}));true")
        go("#/", ".quest-home")
        check("during trip preflight does not interrupt game", "!document.querySelector('.quest-preflight')")
        b.js("localStorage.setItem('stg:trip', JSON.stringify({start:'2026-10-01',end:'2026-10-15',area:'yalong',stay:null,home:null}));true")
        go("#/", ".quest-home")
        check("after trip preflight not shown", "!document.querySelector('.quest-preflight')")
        if not b.wait_for("navigator.serviceWorker.controller !== null",20):
            raise AssertionError("No SW")
        b.send("Network.emulateNetworkConditions",{"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
        b.js("localStorage.setItem('stg:trip', JSON.stringify({start:'2026-11-13',end:'2026-11-26',area:'yalong',stay:null,home:null}));true")
        go("#/", ".quest-preflight")
        check("preflight available in airplane mode", "document.querySelectorAll('.quest-preflight__task').length",4)
        go("#/me", ".quest-reset")
        check("reset confirmation available offline", "!!document.querySelector('.quest-reset__trigger')")
        print(f"v25 {count} browser checks passed",flush=True)
    finally:
        b.close()
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
