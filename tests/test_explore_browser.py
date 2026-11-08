# -*- coding: utf-8 -*-
"""Браузерная проверка нового игрового пути: ответы, XP, карта, копии и офлайн."""
import json
import os
import socket
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cdp import Browser, serve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = free_port()
    server = serve(ROOT, port)
    base = f"http://127.0.0.1:{port}/"
    b = Browser(width=375, height=812)
    checks = 0

    def expect(label, code, expected=True):
        nonlocal checks
        result = b.js(code)
        if result != expected:
            raise AssertionError(f"{label}: {result!r} != {expected!r}")
        print("  PASS", label, flush=True)
        checks += 1

    def go(route, selector):
        b.go(base, route, cold=True)
        if not b.wait_for(f"!!document.querySelector({json.dumps(selector)}) && !document.querySelector('.loading')", 20):
            raise AssertionError(f"{route} did not render: {b.exceptions}")
        if b.exceptions:
            raise AssertionError(f"{route}: {b.exceptions}")

    try:
        go("#/settings", ".view-title")
        trip = {"start": "2026-11-13", "end": "2026-11-26", "area": "yalong", "stay": None, "home": None}
        b.js(f"localStorage.setItem('stg:trip', JSON.stringify({json.dumps(trip)})); true")
        go("#/explore", ".explore-hero")
        expect("4 главы", "document.querySelectorAll('.explore-chapter').length", 4)
        expect("12 пунктов пути", "document.querySelectorAll('.explore-node__link').length", 12)
        expect("Старт с 0 XP", "document.querySelector('.explore-hero__stat strong').textContent", "0 XP")
        expect("Без шестой вкладки", "document.querySelectorAll('.bottom-nav__item').length", 5)
        go("#/explore/lesson/sea", ".explore-lesson__question")
        expect("Есть 4 ответа", "document.querySelectorAll('.explore-lesson__option').length", 4)
        expect("Нельзя проверить без выбора", "document.querySelector('.explore-lesson__submit').disabled")
        b.js("document.querySelectorAll('.explore-lesson__option')[0].click(); document.querySelector('.explore-lesson__submit').click(); true")
        expect("Неверный ответ не начисляет XP", "localStorage.getItem('stg:explore')", None)
        expect("После ошибки можно повторить", "!document.querySelector('.explore-lesson__submit').hidden")
        b.js("document.querySelectorAll('.explore-lesson__option')[2].click(); document.querySelector('.explore-lesson__submit').click(); true")
        expect("Правильный ответ сохраняется", "JSON.parse(localStorage.getItem('stg:explore')).completed.join()", "sea")
        expect("Показана награда", "document.querySelector('.explore-lesson__feedback').textContent.includes('+15 XP')")
        go("#/explore", ".explore-hero")
        expect("Урок дал 15 XP", "document.querySelector('.explore-hero__stat strong').textContent", "15 XP")
        go("#/explore/lesson/sea", ".explore-lesson__question")
        expect("Повторный урок не даёт новой награды", "document.querySelector('.explore-lesson__submit').hidden")

        # Прогресс из старых данных, без нового «списка посещений».
        setup = {
            "stg:saved": ["yalong-bay-beach"],
            "stg:myplan": {"planId": None, "days": {"2026-11-19": {"placeIds": ["yalong-bay-beach"], "origin": "user"}}},
            "stg:passport": {"v": 1, "visits": {"yalong-bay-beach": {"date": "2026-11-15", "note": "Красивое море"}}},
            "stg:expenses": {"v": 1, "items": [{"id": "exp-01", "date": "2026-11-19", "amount": 1, "currency": "CNY", "category": "food"}]},
        }
        b.js("(() => { const data = " + json.dumps(setup, ensure_ascii=False) +
             "; Object.entries(data).forEach(([k,v]) => localStorage.setItem(k, JSON.stringify(v))); return true; })()")
        go("#/explore", ".explore-hero")
        expect("Старые данные включаются в XP", "document.querySelector('.explore-hero__stat strong').textContent", "95 XP")
        go("#/passport", ".passport-map")
        expect("Посещённая точка раскрашена", "document.querySelectorAll('.pp-reveal').length", 1)
        expect("Посещённая точка отмечена", "document.querySelectorAll('.pp-dot--visited').length", 1)

        backup = b.js("""(async () => {
          const B = await import('./js/logic/backup.js');
          const S = (await import('./js/storage.js')).storage;
          const copy = B.buildBackup(S.readUserData(), { appVersion: 'v22' });
          return {
            game: copy.data['stg:explore'],
            oldWipesGame: B.snapshotReplaceKeys('v21').includes('stg:explore'),
            newIncludesGame: B.snapshotReplaceKeys('v22').includes('stg:explore'),
            recovered: B.parseBackup(B.serializeBackup(copy)).ok
          };
        })()""")
        if backup != {"game": {"v": 1, "completed": ["sea"]}, "oldWipesGame": False, "newIncludesGame": True, "recovered": True}:
            raise AssertionError(f"Backup check: {backup}")
        checks += 1
        print("  PASS копии: игра экспортируется, старые копии не стирают прогресс", flush=True)

        # Приложение уже установило SW и прокэшировало игровой контент.
        if not b.wait_for("navigator.serviceWorker.controller !== null", 20):
            raise AssertionError("service worker not ready")
        b.send("Network.emulateNetworkConditions", {"offline": True, "latency": 0, "downloadThroughput": 0, "uploadThroughput": 0})
        go("#/explore", ".explore-hero")
        expect("Игровой путь открывается без сети", "document.querySelectorAll('.explore-chapter').length", 4)
        go("#/explore/lesson/li", ".explore-lesson__question")
        expect("Уроки открываются без сети", "document.querySelectorAll('.explore-lesson__option').length", 4)
        print(f"Game browser: {checks} checks passed", flush=True)
    finally:
        b.close()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
