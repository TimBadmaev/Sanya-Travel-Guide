# -*- coding: utf-8 -*-
"""Скриншоты до и после игрового обновления для ручного UX-ревью.
CHROME=/usr/bin/google-chrome python3 tests/capture_game.py <baseline_dir> <after_dir> <output_dir>
"""
import base64
import json
import os
import socket
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


TRIP = {"start": "2026-11-13", "end": "2026-11-26", "area": "yalong", "stay": None, "home": "Отель в Ялунване"}
PASSPORT = {
    "v": 1, "seen": {},
    "visits": {
        "yalong-bay-beach": {"date": "2026-11-15", "at": "2026-11-15T10:00:00.000Z", "note": "Солнечное утро на пляже."},
        "dadonghai-beach": {"date": "2026-11-17", "at": "2026-11-17T10:00:00.000Z", "note": "Красивые виды."},
        "luhuitou-park": {"date": "2026-11-18", "at": "2026-11-18T10:00:00.000Z", "note": "Вид на залив."},
    },
}
MY_PLAN = {"planId": None, "days": {"2026-11-19": {"placeIds": ["yalong-bay-beach"], "origin": "user"}}}
EXPENSES = {"v": 1, "items": [{"id": "exp-example", "date": "2026-11-19", "amount": 60, "currency": "CNY", "category": "food"}]}
FAKE_NOW = """
(() => {
  const RealDate = Date;
  const fixed = new RealDate(2026, 10, 19, 10, 0).getTime();
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(fixed); }
    static now() { return fixed; }
  }
  window.Date = FakeDate;
})();
"""


def write_shot(browser, output):
    browser.js("window.scrollTo(0, 0); true")
    result = browser.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True}, timeout=30)
    with open(output, "wb") as f:
        f.write(base64.b64decode(result["data"]))


def run(root, prefix, output):
    port = free_port()
    server = serve(root, port)
    base = f"http://127.0.0.1:{port}/"
    b = Browser(width=375, height=812)
    try:
        b.add_init_script(FAKE_NOW)
        b.go(base, "#/settings", cold=True)
        seed = {"stg:trip": TRIP, "stg:myplan": MY_PLAN, "stg:saved": ["yalong-bay-beach"],
                "stg:passport": PASSPORT, "stg:expenses": EXPENSES}
        if prefix == "after":
            seed["stg:explore"] = {"v": 1, "completed": ["sea"]}
        b.js("(() => { const entries = " + json.dumps(seed, ensure_ascii=False) +
             "; Object.entries(entries).forEach(([k,v]) => localStorage.setItem(k, JSON.stringify(v))); localStorage.setItem(\'stg:installHintDismissed\', \'1\'); return true; })()")
        pages = [("home", "#/", ".home-head"), ("passport", "#/passport", ".passport-map")]
        if prefix == "after":
            pages.append(("game", "#/explore", ".explore-chapter__path"))
            pages.append(("lesson", "#/explore/lesson/nanshan", ".explore-lesson__question"))
        for name, path, element in pages:
            b.go(base, path, cold=True)
            if not b.wait_for(f"!!document.querySelector({json.dumps(element)}) && !document.querySelector('.loading')", 20):
                raise RuntimeError(f"{prefix} {path} did not render: {b.exceptions}")
            if b.exceptions:
                raise RuntimeError(f"{prefix} {path}: JS exceptions {b.exceptions}")
            out = os.path.join(output, f"{prefix}_{name}.png")
            write_shot(b, out)
            print(out, os.path.getsize(out), "bytes", flush=True)
    finally:
        b.close()
        server.shutdown()


if __name__ == "__main__":
    before, after, output = sys.argv[1:4]
    os.makedirs(output, exist_ok=True)
    run(before, "before", output)
    run(after, "after", output)
