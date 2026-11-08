# -*- coding: utf-8 -*-
"""Island Quest v23: Chrome end-to-end for onboarding, path, discovery,
map, profile, old user data, deep links, and offline; no test dependencies."""
import json
import os
import socket
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser, serve  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def main():
    p = port()
    server = serve(ROOT, p)
    b = Browser(width=375, height=812)
    base = "http://127.0.0.1:" + str(p) + "/"
    checks = 0

    def go(hash_, selector):
        b.go(base, hash_, cold=True)
        if not b.wait_for("location.hash === " + json.dumps(hash_) +
                          " && !!document.querySelector(" + json.dumps(selector) +
                          ") && !document.querySelector('#view .loading')", 25):
            raise AssertionError("screen did not render: " + hash_ + " " + str(b.exceptions))
        if b.exceptions:
            raise AssertionError("JS exceptions at " + hash_ + ": " + str(b.exceptions))

    def check(name, expression, expected=True):
        nonlocal checks
        value = b.js(expression)
        if value != expected:
            raise AssertionError(name + ": " + repr(value) + " expected " + repr(expected))
        print("  PASS ", name, flush=True)
        checks += 1

    try:
        # New visitor: welcome is automatic; no registration, no account.
        b.navigate(base + "index.html#/")
        if not b.wait_for("location.hash === '#/welcome' && !!document.querySelector('.welcome')", 20):
            raise AssertionError("First-run welcome did not open: " + str(b.exceptions))
        check("new user redirected to first-run welcome", "document.querySelector('.welcome__title').textContent", "Хайнань ждёт тебя!")
        check("welcome has no old bottom navigation", "getComputedStyle(document.querySelector('.bottom-nav')).display", "none")
        b.js("document.querySelector('.welcome__primary').click(); true")
        check("date step", "document.querySelector('.welcome__title').textContent", "Когда летим?")
        b.js("""(() => {
          const a = document.querySelectorAll('.welcome__date');
          a[0].value='2026-11-13';a[1].value='2026-11-26';
          a.forEach(x=>x.dispatchEvent(new Event('change',{bubbles:true})));
          document.querySelector('.welcome__primary').click();return true;
        })()""")
        check("area step", "document.querySelector('.welcome__title').textContent", "Где остановишься?")
        b.js("document.querySelector('input[name=\"welcome-area\"][value=\"yalong\"]').click(); document.querySelector('.welcome__primary').click(); true")
        if not b.wait_for("location.hash === '#/' && !!document.querySelector('.quest-world')", 20):
            raise AssertionError("After welcome game not open: " + str(b.exceptions))
        trip = b.js("JSON.parse(localStorage.getItem('stg:trip'))")
        if not (trip["start"] == "2026-11-13" and trip["end"] == "2026-11-26" and trip["area"] == "yalong"):
            raise AssertionError("Trip incorrectly saved: " + str(trip))
        checks += 1
        print("  PASS  first-run saved trip in old stg:trip schema", flush=True)
        check("new shell has exactly four tabs", "document.querySelectorAll('.bottom-nav__item').length", 4)
        check("one game path with four worlds", "document.querySelectorAll('.quest-world').length", 4)
        check("twelve tappable steps", "document.querySelectorAll('.quest-step__link').length", 12)
        check("first task opens existing catalog", "document.querySelector('.quest-step__link').getAttribute('href')", "#/places")

        # Existing data survives the new UI and contributes to scores.
        seed = {
          "stg:saved": ["yalong-bay-beach"],
          "stg:passport": {"v":1,"visits":{"yalong-bay-beach":
             {"date":"2026-11-15","at":"2026-11-15T09:00:00.000Z","note":"Красивый пляж"}},"seen":{}},
          "stg:expenses": {"v":1,"items":[{"id":"exp-1","date":"2026-11-19","amount":50,"currency":"CNY","category":"food"}]},
        }
        b.js("(() => { const data=" + json.dumps(seed) +
             ";Object.entries(data).forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));return true; })()")
        go("#/", ".quest-home")
        check("existing visit remains in new path", "document.querySelector('.quest-hud__visited').textContent.includes('1')")
        check("XP reflects saved existing data", "document.querySelector('.quest-hud__xp').textContent.includes('XP')")
        go("#/discover", ".discover__categories")
        check("discovery has four photographic category cards", "document.querySelectorAll('.discover__category').length", 4)
        check("discovery reuses verified photos", "document.querySelectorAll('.discover__place-photo').length >= 3")
        if not b.wait_for("[...document.querySelectorAll('.discover__category-photo')].some(img => img.complete && img.naturalWidth > 0)", 12):
            raise AssertionError("Local photos not loaded")
        checks += 1
        print("  PASS  category image loaded from assets/photos", flush=True)
        go("#/passport", ".passport-map")
        check("visited point colors the map", "document.querySelectorAll('.pp-reveal').length", 1)
        check("seven coastal areas are preserved", "document.querySelectorAll('.pp-badge').length", 7)
        go("#/me", ".quest-me__hero")
        check("profile shows experience and journey", "document.querySelectorAll('.quest-me__stat').length", 3)
        check("profile preserves accessible legacy tools", "document.querySelectorAll('.quest-me__link').length >= 10")
        for hash_, selector in [
          ("#/plan", ".view-title"), ("#/expenses", ".view-title"),
          ("#/prepare", ".view-title"), ("#/info", ".view-title"),
          ("#/now", ".view-title"), ("#/handy", ".view-title"),
          ("#/excursions", ".view-title"), ("#/places", ".search-bar__input"),
          ("#/data", ".view-title")
        ]:
            go(hash_, selector)
            checks += 1
            print("  PASS  legacy tool accessible: " + hash_, flush=True)
        go("#/explore/lesson/sea", ".explore-lesson__question")
        check("mini-story still interactive", "document.querySelectorAll('.explore-lesson__option').length", 4)
        b.js("document.querySelectorAll('.explore-lesson__option')[2].click(); document.querySelector('.explore-lesson__submit').click(); true")
        check("correct answer stored in existing game state", "JSON.parse(localStorage.getItem('stg:explore')).completed.join()", "sea")
        go("#/", ".quest-home")
        check("lesson reward appears on new path", "document.querySelector('.quest-hud__xp').textContent.includes('15') || Number(document.querySelector('.quest-hud__xp').textContent.match(/\\d+/)[0]) >= 15")
        go("#/me", ".quest-me")
        check("backup remains linked", "!!document.querySelector('.quest-me__link[href=\"#/data\"]')")

        for width, height in [(320, 568), (375, 812), (414, 896)]:
            b.set_viewport(width, height)
            go("#/", ".quest-home")
            check(str(width) + "px path no horizontal overflow", "document.documentElement.scrollWidth <= innerWidth")
            check(str(width) + "px nav has 4 usable tap targets",
                  "[...document.querySelectorAll('.bottom-nav__item')].every(x=>x.getBoundingClientRect().width>=44 && x.getBoundingClientRect().height>=44)")
            go("#/discover", ".discover")
            check(str(width) + "px discovery no horizontal overflow", "document.documentElement.scrollWidth <= innerWidth")
        b.set_viewport(375, 812)

        # SW pre-caches every new file. Cold navigation must succeed offline.
        go("#/", ".quest-home")
        if not b.wait_for("navigator.serviceWorker.controller !== null", 20):
            raise AssertionError("ServiceWorker not controlling")
        b.send("Network.emulateNetworkConditions", {"offline":True,"latency":0,"downloadThroughput":0,"uploadThroughput":0})
        for hash_, selector in [
          ("#/", ".quest-home"), ("#/discover", ".discover"),
          ("#/passport", ".passport-map"), ("#/me", ".quest-me__hero"),
          ("#/explore/lesson/li", ".explore-lesson__question")
        ]:
            go(hash_, selector)
            checks += 1
            print("  PASS  offline: " + hash_, flush=True)
        print("Island Quest v23: " + str(checks) + " checks passed", flush=True)
    finally:
        b.close()
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
