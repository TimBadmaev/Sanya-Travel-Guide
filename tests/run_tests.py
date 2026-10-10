# -*- coding: utf-8 -*-
"""Проверки Sanya Travel Guide: статические, логика в браузере, сценарии,
регрессия существующих экранов, офлайн и обновление Service Worker.

Запуск из корня проекта:  python3 -u tests/run_tests.py [раздел …]
Разделы: static unit passport map layout regression travel ux offline upgrade (по умолчанию — все).
Нужен Google Chrome (путь — переменная CHROME). Node и сторонние пакеты не
нужны. В приложение и в публикацию каталог tests/ не входит.
"""

import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser, serve  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = []
SECTION = [""]


def check(name, ok, detail=""):
    RESULTS.append((SECTION[0], name, bool(ok), detail))
    mark = "PASS" if ok else "FAIL"
    print(f"  {mark}  {name}" + ("" if ok or not detail else f"  — {detail}"))


def load(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return json.load(f)


PLACES = [p for p in load("data/places.json") if p["status"] == "verified"]
CONFIG = load("data/config.json")
PASSPORT = load("data/passport.json")
CACHE = re.search(r'const CACHE_VERSION = "(v\d+)"', open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()).group(1)
SHOPPING = [p for p in PLACES if p["category"] == "shopping"]
REWARD = [p for p in PLACES if p["category"] != "shopping"]

TRIP = {"start": "2026-11-13", "end": "2026-11-26", "area": "yalong", "stay": None, "home": None}
FAKE_DATE = r"""
(() => {
  let fake = null;
  try { fake = sessionStorage.getItem('__fakeNow'); } catch (e) {}
  if (!fake) return;
  const [Y, M, D, h, m] = fake.split(',').map(Number);
  const Real = Date;
  const fixed = new Real(Y, M - 1, D, h, m).getTime();
  const started = Real.now();
  class FakeDate extends Real {
    constructor(...args) { if (args.length) { super(...args); } else { super(fixed + (Real.now() - started)); } }
    static now() { return fixed + (Real.now() - started); }
  }
  window.Date = FakeDate;
})();
"""
FIND = """
window.__byText = (selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text) || null;
window.__click = (selector, text) => { const el = text === undefined ? document.querySelector(selector) : window.__byText(selector, text); if (!el) return false; el.click(); return true; };
"""


# ------------------------------------------------------------------ static

def run_static():
    SECTION[0] = "static"
    print("\n[static] данные, PRECACHE, версия кэша")
    for name in sorted(os.listdir(os.path.join(ROOT, "data"))):
        if name.endswith(".json"):
            try:
                load("data/" + name)
                check(f"data/{name} — валидный JSON", True)
            except Exception as e:  # noqa: BLE001
                check(f"data/{name} — валидный JSON", False, str(e))

    sw = open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()
    block = re.search(r"const PRECACHE = \[(.*?)\];", sw, re.S).group(1)
    precache = [p[2:] for p in re.findall(r'"(\./[^"]+)"', block)]
    missing = [p for p in precache if not os.path.isfile(os.path.join(ROOT, p))]
    check(f"все {len(precache)} файлов PRECACHE существуют", not missing, missing)
    check("в PRECACHE нет повторов", len(precache) == len(set(precache)))

    # Замыкание статических import от js/app.js.
    seen, stack = set(), ["js/app.js"]
    while stack:
        path = stack.pop()
        if path in seen:
            continue
        seen.add(path)
        src = open(os.path.join(ROOT, path), encoding="utf-8").read()
        for rel in re.findall(r'(?:from|import)\s+"(\.{1,2}/[^"]+)"', src):
            stack.append(os.path.normpath(os.path.join(os.path.dirname(path), rel)))
    not_cached = sorted(p for p in seen if p not in precache)
    check(f"все {len(seen)} модулей, достижимых от js/app.js, в PRECACHE", not not_cached, not_cached)
    data_src = open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read()
    data_files = re.findall(r'loadJSON\("([^"]+)"\)', data_src)
    check("все data/*.json, которые грузит data.js, в PRECACHE", all(f in precache for f in data_files),
          [f for f in data_files if f not in precache])
    photos = ["assets/photos/" + ph["file"] for p in PLACES for ph in p.get("photos", [])]
    check("все фото verified-мест в PRECACHE", all(f in precache for f in photos))
    for f in ("js/logic/passport.js", "js/views/passport.js", "data/passport.json", "js/logic/passport-map.js", "js/views/passport-art.js"):
        check(f"файл паспорта {f} в PRECACHE", f in precache)

    version = re.search(r'const CACHE_VERSION = "v(\d+)"', sw)
    try:
        head = subprocess.run(["git", "show", "HEAD:sw.js"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        head_version = int(re.search(r'const CACHE_VERSION = "v(\d+)"', head).group(1))
    except Exception:  # noqa: BLE001
        head_version = None
    check("CACHE_VERSION — следующий номер после HEAD", version and head_version is not None and int(version.group(1)) in (head_version, head_version + 1),
          f"HEAD v{head_version}, сейчас v{version.group(1) if version else '?'}")
    if head_version is not None and version and int(version.group(1)) == head_version:
        print("        (примечание: версия совпадает с HEAD — изменений к выпуску нет или их ещё не закоммитили с новой версией)")

    # Контент паспорта и справочники.
    cats = {c["id"] for c in CONFIG["categories"]}
    tags = {t["id"] for t in CONFIG["tags"]}
    areas = {a["id"] for a in CONFIG["areas"]}
    stickers = PASSPORT["stickers"]
    check("в passport.json 12 наклеек", len(stickers) == 12, len(stickers))
    check("id наклеек уникальны", len({s["id"] for s in stickers}) == len(stickers))
    bad = [s["id"] for s in stickers if s["rule"].get("where", {}).get("category", "beach") not in cats
           or s["rule"].get("where", {}).get("tag", "view") not in tags]
    check("категории и теги условий есть в config.json", not bad, bad)
    check("ни одна наклейка не требует shopping", not any(s["rule"].get("where", {}).get("category") == "shopping" for s in stickers))
    parts = PASSPORT["coastParts"]
    check("id частей побережья не совпадают с id районов config.areas", not ({p["id"] for p in parts} & areas))

    def part_of(place):
        loc = place["location"]
        for p in parts:
            b = p["bounds"]
            if "lngMin" in b and not loc["lng"] >= b["lngMin"]:
                continue
            if "lngMax" in b and not loc["lng"] < b["lngMax"]:
                continue
            if "latMin" in b and not loc["lat"] >= b["latMin"]:
                continue
            if "latMax" in b and not loc["lat"] < b["latMax"]:
                continue
            return p["id"]
        return None

    orphan = [p["id"] for p in PLACES if part_of(p) is None]
    check(f"каждое из {len(PLACES)} verified-мест попадает в часть побережья", not orphan, orphan)
    sizes = {p["id"]: sum(1 for x in PLACES if part_of(x) == p["id"]) for p in parts}
    check("в части побережья не больше 14 мест", max(sizes.values()) <= 14, sizes)
    check("в каждой части побережья есть места без shopping", all(any(part_of(x) == p["id"] for x in REWARD) for p in parts))

    # Справочный контент «Под рукой», «Справки» и чек-листа (схемы — js/data.js).
    today = time.strftime("%Y-%m-%d")
    date_ok = lambda v: isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) and v <= today  # noqa: E731
    url_ok = lambda s: isinstance(s, dict) and s.get("title") and str(s.get("url", "")).startswith(("https://", "http://"))  # noqa: E731
    handy_src = open(os.path.join(ROOT, "js/views/handy.js"), encoding="utf-8").read()

    def group_ids(const):
        return set(re.findall(r'\["([a-z-]+)", "', re.search(const + r" = \[(.*?)\];", handy_src, re.S).group(1)))

    phrases = load("data/phrases.json")
    check("phrases.json: id уникальны", len({p["id"] for p in phrases}) == len(phrases))
    bad = [p["id"] for p in phrases if not (p.get("ru") and p.get("zh") and p.get("context") and url_ok(p.get("source")) and date_ok(p.get("verifiedAt")))]
    check(f"phrases.json: у всех {len(phrases)} фраз есть перевод, иероглифы, контекст, источник и дата проверки", not bad, bad)
    bad = [p["id"] for p in phrases if p.get("group") not in group_ids("PHRASE_GROUPS")]
    check("phrases.json: группа каждой фразы известна экрану «Под рукой»", not bad, bad)
    bad = [p["id"] for p in phrases if "pinyin" in p and not str(p["pinyin"]).strip()]
    check("phrases.json: пустого пиньиня нет (поле либо заполнено, либо отсутствует)", not bad, bad)

    contacts = load("data/contacts.json")
    check("contacts.json: id уникальны", len({c["id"] for c in contacts}) == len(contacts))
    bad = [c["id"] for c in contacts if not (c.get("label") and c.get("number") and date_ok(c.get("verifiedAt")) and c.get("sources") and all(url_ok(s) for s in c["sources"]))]
    check(f"contacts.json: у всех {len(contacts)} контактов есть подпись, номер, источник и дата проверки", not bad, bad)
    digits = lambda v: re.sub(r"[^\d+]", "", v)  # noqa: E731
    bad = [c["id"] for c in contacts if not c.get("tel", "").startswith("tel:") or digits(c["tel"][4:]).lstrip("+")[-len(digits(c["number"]).lstrip("+")):] != digits(c["number"]).lstrip("+")]
    check("contacts.json: ссылка tel: набирает тот же номер, что показан", not bad, bad)
    bad = [c["id"] for c in contacts if c.get("group") not in group_ids("GROUPS")]
    check("contacts.json: группа каждого контакта известна экрану «Под рукой»", not bad, bad)

    # У источника «Справки» url может быть пустым (документ без страницы в
    # сети — info.js показывает его текстом), но хотя бы одна ссылка нужна.
    info_all = load("data/info.json")
    info_ids = {i["id"] for i in info_all if i["status"] == "verified"}
    check("info.json: id уникальны", len({i["id"] for i in info_all}) == len(info_all))
    bad = [i["id"] for i in info_all if i["status"] == "verified" and not (i.get("title") and i.get("summary") and i.get("points")
           and all(isinstance(p, str) and p.strip() for p in i["points"]) and i.get("sources") and any(url_ok(s) for s in i["sources"]) and all(url_ok(s) or (s.get("title") and s.get("url") == "") for s in i["sources"])
           and date_ok(i.get("verifiedAt")))]
    check(f"info.json: у всех {len(info_ids)} карточек есть текст, источники и дата проверки", not bad, bad)
    bad = {i["id"]: len(i["points"]) for i in info_all if i["status"] == "verified" and not 3 <= len(i["points"]) <= 7}
    check("info.json: в каждой карточке 3–7 пунктов (PRODUCT.md 9.6)", not bad, bad)
    linked = set()
    for name in sorted(os.listdir(os.path.join(ROOT, "js/views"))):
        linked |= set(re.findall(r'"#/info/([a-z0-9-]+)"', open(os.path.join(ROOT, "js/views", name), encoding="utf-8").read()))
    check(f"все {len(linked)} карточек «Справки», на которые ссылаются экраны, существуют и verified", linked <= info_ids, sorted(linked - info_ids))

    checklist = load("data/checklist.json")
    check("checklist.json: id уникальны", len({c["id"] for c in checklist}) == len(checklist))
    phases = set(re.findall(r'"([a-z]+)"', re.search(r"PHASE_ORDER = \[(.*?)\]", open(os.path.join(ROOT, "js/logic/trip.js"), encoding="utf-8").read()).group(1)))
    bad = [c["id"] for c in checklist if c.get("phase") not in phases or not c.get("title") or not c.get("details") or not date_ok(c.get("verifiedAt"))
           or not all(url_ok(s) for s in c.get("sources", []))]
    check(f"checklist.json: у всех {len(checklist)} дел известный этап, текст и дата проверки", not bad, bad)

    workflow = open(os.path.join(ROOT, ".github/workflows/pages.yml"), encoding="utf-8").read() if os.path.exists(os.path.join(ROOT, ".github/workflows/pages.yml")) else ""
    if workflow:
        check("workflow публикации копирует js/ и data/ целиком", "cp -R css js data assets _site/" in workflow)


# ------------------------------------------------------------------ helpers

class App:
    def __init__(self, port, width=375, height=667):
        self.base = f"http://127.0.0.1:{port}/"
        self.b = Browser(width, height)
        self.b.add_init_script(FAKE_DATE)
        self.b.add_init_script(FIND)

    def setup(self, now="2026,11,19,10,0", trip=TRIP, extra=None):
        """Чистое состояние: даты поездки, подсказка установки скрыта."""
        b = self.b
        b.navigate(self.base + "index.html#/places")
        data = {"stg:trip": json.dumps(trip), "stg:installHintDismissed": "1"}
        data.update(extra or {})
        b.js(f"""localStorage.clear(); sessionStorage.setItem('__fakeNow', {json.dumps(now)});
                 Object.entries({json.dumps(data)}).forEach(([k, v]) => localStorage.setItem(k, v)); true""")

    def go(self, hash_, cold=False):
        self.b.go(self.base, hash_, cold=cold)

    def storage(self, key):
        raw = self.b.js(f"localStorage.getItem({json.dumps(key)})")
        return None if raw is None else json.loads(raw)

    def raw(self, key):
        return self.b.js(f"localStorage.getItem({json.dumps(key)})")

    def text(self, selector):
        return self.b.js(f"(document.querySelector({json.dumps(selector)}) || {{textContent: null}}).textContent")

    def click(self, selector, text=None):
        arg = "" if text is None else f", {json.dumps(text)}"
        return self.b.js(f"window.__click({json.dumps(selector)}{arg})")

    def errors(self):
        errs = [t for kind, t in self.b.console if kind == "error"] + list(self.b.exceptions)
        self.b.console.clear()
        self.b.exceptions.clear()
        return errs

    def overflow(self):
        return self.b.js("document.documentElement.scrollWidth - window.innerWidth")

    def small_targets(self, scope):
        return self.b.js(f"""[...document.querySelectorAll({json.dumps(scope)})].flatMap((root) =>
            [...root.querySelectorAll('a, button, textarea, input, summary')]).filter((el) => el.getClientRects().length && !(el instanceof SVGElement))
            .map((el) => {{ const r = el.getBoundingClientRect(); return [el.textContent.trim().slice(0, 40), Math.round(r.width), Math.round(r.height)]; }})
            .filter(([, w, h]) => w < 44 || h < 44)""")

    def close(self):
        self.b.close()


# ------------------------------------------------------------------ unit

def run_unit(port):
    SECTION[0] = "unit"
    print("\n[unit] logic/passport.js, storage.js, logic/backup.js — import() в Chrome")
    app = App(port)
    b = app.b
    try:
        app.setup()
        b.js("""(async () => {
          window.P = await import('./js/logic/passport.js');
          window.B = await import('./js/logic/backup.js');
          window.D = await import('./js/data.js');
          window.places = await D.loadPlaces();
          window.config = await D.loadConfig();
          window.content = P.prepareContent(await D.loadPassport(), config);
          return true; })()""")
        check("контент паспорта проходит проверку без проблем", b.js("content.problems.length === 0"), b.js("content.problems"))
        check("12 наклеек и 7 частей побережья после проверки", b.js("content.stickers.length === 12 && content.coastParts.length === 7"))

        # Нормализация и повреждённые данные.
        cases = b.js(r"""(() => {
          const N = P.normalizePassportState;
          const empty = JSON.stringify({ v: 1, visits: {}, seen: {} });
          const r = {};
          r.nullish = [null, undefined, 42, 'x', [], [1, 2]].every((v) => JSON.stringify(N(v)) === empty);
          r.visitsArray = JSON.stringify(N({ visits: [{ date: '2026-11-19' }] })) === empty;
          const s = N({ v: 3, future: 1, visits: {
            'ok-place': { date: '2026-11-19', at: '2026-11-19T02:00:00.000Z', note: '  тёплая вода  ', extra: 1 },
            'bad-date': { date: '2026-02-31' },
            'no-date': { note: 'x' },
            'bad at': { date: '2026-11-19' },
            'a:b': { date: '2026-11-19' },
            '__proto__': { date: '2026-11-19' },
            'bad-at': { date: '2026-11-20', at: 'вчера' },
            'empty-note': { date: '2026-11-20', note: '   ' },
            'long-note': { date: '2026-11-20', note: 'я'.repeat(250) },
            'emoji-note': { date: '2026-11-20', note: 'a'.repeat(199) + '😀' },
          }, seen: { 'first-stamp': '2026-11-19', 'bad id': '2026-11-19', 'x': 'nope' } });
          r.v = s.v === 1;
          r.keys = Object.keys(s.visits).sort().join(',') === ['bad-at', 'emoji-note', 'empty-note', 'long-note', 'ok-place'].sort().join(',');
          r.trim = s.visits['ok-place'].note === 'тёплая вода' && !('extra' in s.visits['ok-place']);
          r.badAt = !('at' in s.visits['bad-at']) && s.visits['bad-at'].date === '2026-11-20';
          r.emptyNote = !('note' in s.visits['empty-note']);
          r.long = s.visits['long-note'].note.length === 200;
          r.emoji = s.visits['emoji-note'].note === 'a'.repeat(199);
          r.seen = JSON.stringify(s.seen) === JSON.stringify({ 'first-stamp': '2026-11-19' });
          r.proto = Object.getPrototypeOf(s.visits) === Object.prototype;
          r.noFuture = !('future' in s);
          return r; })()""")
        for k, v in cases.items():
            check(f"нормализация stg:passport: {k}", v)

        ops = b.js(r"""(() => {
          let s = P.normalizePassportState(null);
          s = P.withVisit(s, 'yalong-bay-beach', { date: '2026-11-14', at: '2026-11-14T01:00:00.000Z' });
          const again = P.withVisit(s, 'yalong-bay-beach', { date: '2026-11-19', at: '2026-11-19T01:00:00.000Z' });
          const noted = P.withNote(again, 'yalong-bay-beach', 'x'.repeat(300));
          const noteOther = P.withNote(noted, 'not-visited', 'hi');
          const cleared = P.withNote(noted, 'yalong-bay-beach', '   ');
          const removed = P.withoutVisit(noted, 'yalong-bay-beach');
          const restored = P.withRestoredVisit(removed, 'yalong-bay-beach', noted.visits['yalong-bay-beach']);
          return {
            single: Object.keys(again.visits).length === 1,
            keepsDate: again.visits['yalong-bay-beach'].date === '2026-11-14',
            noteClamp: noted.visits['yalong-bay-beach'].note.length === 200,
            noteNeedsVisit: !('not-visited' in noteOther.visits),
            noteCleared: !('note' in cleared.visits['yalong-bay-beach']),
            removed: !('yalong-bay-beach' in removed.visits),
            restored: JSON.stringify(restored.visits['yalong-bay-beach']) === JSON.stringify(noted.visits['yalong-bay-beach']),
            immutable: Object.keys(s.visits).length === 1 && !('note' in s.visits['yalong-bay-beach']),
          }; })()""")
        for k, v in ops.items():
            check(f"операции с отметками: {k}", v)

        # Пороги всех наклеек: открываются ровно на пороге и закрываются ниже.
        thresholds = b.js(r"""(() => {
          const reward = P.rewardCatalog(places);
          const partOf = (p) => P.coastPartOf(p, content.coastParts);
          const visit = (ids) => ({ v: 1, visits: Object.fromEntries(ids.map((id, i) => [id, { date: '2026-11-' + String(13 + (i % 13)).padStart(2, '0'), at: new Date(Date.UTC(2026, 10, 13, i)).toISOString() }])), seen: {} });
          const out = {};
          content.stickers.forEach((sticker) => {
            const rule = sticker.rule;
            let pool;
            if (rule.type === 'count') {
              pool = reward.filter((p) => (!rule.where || ((!rule.where.category || p.category === rule.where.category) && (!rule.where.tag || (p.tags || []).includes(rule.where.tag)) && (!rule.where.hasStory || !!p.story))));
            } else {
              const seenKey = new Set();
              pool = reward.filter((p) => { const k = rule.type === 'distinctCategories' ? p.category : partOf(p); if (!k || seenKey.has(k)) return false; seenKey.add(k); return true; });
            }
            const ids = pool.slice(0, rule.min).map((p) => p.id);
            const at = P.evaluatePassport({ state: visit(ids), places, content }).stickers.find((s) => s.id === sticker.id);
            const below = P.evaluatePassport({ state: visit(ids.slice(0, -1)), places, content }).stickers.find((s) => s.id === sticker.id);
            out[sticker.id] = { enough: ids.length === rule.min, atEarned: !!at && at.earned, belowEarned: !!below && below.earned, belowProgress: below && below.progress, min: rule.min };
          });
          return out; })()""")
        for sid, r in thresholds.items():
            check(f"наклейка {sid}: открыта ровно на пороге {r['min']}, закрыта ниже",
                  r["enough"] and r["atEarned"] and not r["belowEarned"] and r["belowProgress"] == r["min"] - 1, r)

        det = b.js(r"""(() => {
          const ids = ['yalong-bay-beach', 'dadonghai-beach', 'luhuitou-park', 'sanya-first-market', 'cdf-duty-free-city', 'tianya-haijiao'];
          const make = (order) => ({ v: 1, visits: Object.fromEntries(order.map((id, i) => [id, { date: '2026-11-1' + (i % 9), at: '2026-11-1' + (i % 9) + 'T00:00:00.000Z' }])), seen: {} });
          const a = make(ids);
          const shuffled = { v: 1, visits: Object.fromEntries(Object.entries(a.visits).reverse()), seen: {} };
          const strip = (r) => JSON.stringify({ ...r, partOf: undefined });
          const r1 = P.evaluatePassport({ state: a, places, content });
          const r2 = P.evaluatePassport({ state: a, places, content });
          const r3 = P.evaluatePassport({ state: shuffled, places, content });
          // Отметка места, которого нет в каталоге (удалено/draft), не считается.
          const ghost = { v: 1, visits: { ...a.visits, 'no-such-place': { date: '2026-11-19' } }, seen: {} };
          const r4 = P.evaluatePassport({ state: ghost, places, content });
          return { same: strip(r1) === strip(r2), orderFree: strip(r1) === strip(r3), ghost: strip(r1) === strip(r4), visits: r1.visits.length }; })()""")
        check("расчёт детерминирован (повтор даёт тот же результат)", det["same"])
        check("результат не зависит от порядка ключей в хранилище", det["orderFree"])
        check("отметка места вне каталога не показывается и не считается", det["ghost"])

        shop = b.js(r"""(() => {
          const shopping = places.filter((p) => p.category === 'shopping');
          const state = { v: 1, visits: Object.fromEntries(shopping.map((p) => [p.id, { date: '2026-11-19' }])), seen: {} };
          const r = P.evaluatePassport({ state, places, content, origin: { lat: 18.23, lng: 109.64 } });
          const empty = P.evaluatePassport({ state: { v: 1, visits: {}, seen: {} }, places, content, origin: { lat: 18.23, lng: 109.64 } });
          const allHints = [...r.stickers, ...empty.stickers].flatMap((s) => s.hints);
          const rewardCount = places.filter((p) => p.category !== 'shopping').length;
          // Смешанный случай: покупки + 1 обычное место.
          const mixed = { v: 1, visits: { ...state.visits, 'yalong-bay-beach': { date: '2026-11-19' } }, seen: {} };
          const rm = P.evaluatePassport({ state: mixed, places, content });
          const onlyBeach = P.evaluatePassport({ state: { v: 1, visits: { 'yalong-bay-beach': { date: '2026-11-19' } }, seen: {} }, places, content });
          const strip = (x) => JSON.stringify({ reward: x.reward, parts: x.coastParts, partsVisited: x.coastPartsVisited, counts: x.stickerCounts, st: x.stickers.map((s) => [s.id, s.earned, s.progress, s.collected, s.matched.map((p) => p.id), s.hints.map((p) => p.id)]) });
          return {
            visitsShown: r.visits.length === shopping.length,
            keepsakes: r.keepsakes === shopping.length,
            rewardVisited: r.reward.visited === 0,
            denominator: r.reward.total === rewardCount,
            partsDenominator: r.coastParts.reduce((s, p) => s + p.total, 0) === rewardCount,
            partsVisited: r.coastPartsVisited === 0 && r.coastParts.every((p) => p.visited === 0),
            noStickers: r.stickers.every((s) => !s.earned && s.progress === 0) && r.stickerCounts.earned === 0,
            hintsNoShopping: allHints.length > 0 && allHints.every((p) => p.category !== 'shopping'),
            mixedEqualsBeachOnly: strip(rm) === strip(onlyBeach),
          }; })()""")
        for k, v in shop.items():
            check(f"shopping исключён из наград: {k}", v)

        reach = b.js(r"""(() => {
          const noBeaches = places.filter((p) => p.category !== 'beach');
          const r = P.evaluatePassport({ state: { v: 1, visits: {}, seen: {} }, places: noBeaches, content });
          const full = P.evaluatePassport({ state: { v: 1, visits: {}, seen: {} }, places, content });
          const oneStory = places.filter((p) => !p.story || p.id === 'luhuitou-park');
          const r2 = P.evaluatePassport({ state: { v: 1, visits: {}, seen: {} }, places: oneStory, content });
          // Недостижимая, но уже открытая (места остались в отметках, но не в каталоге) — не показывается,
          // если мест нет; открытая при наличии — показывается.
          return {
            hidden: !r.stickers.some((s) => s.id === 'sea-explorer'),
            total: r.stickerCounts.total === full.stickerCounts.total - 1,
            storyHidden: !r2.stickers.some((s) => s.id === 'story-keeper'),
            fullTotal: full.stickerCounts.total,
            optionalNotCounted: full.stickers.some((s) => s.id === 'island-horizon' && s.optional) && full.stickerCounts.total === full.stickers.length - 1,
            optionalNoHints: full.stickers.find((s) => s.id === 'island-horizon').hints.length === 0,
          }; })()""")
        check("недостижимая по каталогу наклейка скрыта (каталог без пляжей)", reach["hidden"])
        check("недостижимая наклейка не входит в «из N»", reach["total"])
        check("«Хранитель легенд» скрыт, если историй меньше трёх", reach["storyHidden"])
        check("необязательная наклейка не входит в «из N» и без подсказок", reach["optionalNotCounted"] and reach["optionalNoHints"], reach)
        check("по текущему каталогу доступно 11 основных наклеек", reach["fullTotal"] == 11, reach["fullTotal"])

        hints = b.js(r"""(() => {
          const origin = { lat: 18.2306, lng: 109.6409 };
          const r = P.evaluatePassport({ state: { v: 1, visits: { 'dadonghai-beach': { date: '2026-11-19' } }, seen: {} }, places, content, origin });
          const sea = r.stickers.find((s) => s.id === 'sea-explorer');
          const coast = r.stickers.find((s) => s.id === 'west-to-east');
          const noOrigin = P.evaluatePassport({ state: { v: 1, visits: {}, seen: {} }, places, content });
          const firstStamp = noOrigin.stickers.find((s) => s.id === 'first-stamp');
          const catalogOrder = places.filter((p) => p.category !== 'shopping').slice(0, 3).map((p) => p.id);
          return {
            seaHints: sea.hints.map((p) => p.id),
            seaUnvisited: sea.hints.every((p) => p.category === 'beach' && p.id !== 'dadonghai-beach'),
            seaNearest: sea.hints[0] && sea.hints[0].id === 'yalong-bay-beach',
            coastOtherParts: coast.hints.every((p) => P.coastPartOf(p, content.coastParts) !== 'coast-dadonghai'),
            limit: r.stickers.every((s) => s.hints.length <= P.HINTS_LIMIT),
            catalogOrder: JSON.stringify(firstStamp.hints.map((p) => p.id)) === JSON.stringify(catalogOrder),
          }; })()""")
        check("подсказки: только непосещённые подходящие места", hints["seaUnvisited"], hints["seaHints"])
        check("подсказки: ближайшие к точке отсчёта первыми", hints["seaNearest"], hints["seaHints"])
        check("подсказки «Четыре части побережья» — из других частей", hints["coastOtherParts"])
        check("подсказок не больше трёх", hints["limit"])
        check("без точки отсчёта подсказки в порядке каталога", hints["catalogOrder"])

        validation = b.js(r"""(() => {
          const base = { coastParts: [{ id: 'coast-x', name: 'X', bounds: { lngMax: 110 } }], stickers: [] };
          const st = (rule, extra = {}) => ({ id: 'test-' + Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, 'a'), status: 'verified', title: 'T', description: 'D', rule, ...extra });
          const run = (stickers, parts = base.coastParts) => P.prepareContent({ coastParts: parts, stickers }, config);
          return {
            unknownType: run([st({ type: 'visits', min: 1 })]).stickers.length === 0,
            unknownCategory: run([st({ type: 'count', min: 1, where: { category: 'food' } })]).stickers.length === 0,
            unknownTag: run([st({ type: 'count', min: 1, where: { tag: 'nightlife' } })]).stickers.length === 0,
            unknownWhereKey: run([st({ type: 'count', min: 1, where: { area: 'yalong' } })]).stickers.length === 0,
            badMin: run([st({ type: 'count', min: 0 })]).stickers.length === 0,
            draft: run([st({ type: 'count', min: 1 }, { status: 'draft' })]).stickers.length === 0,
            duplicate: run([st({ type: 'count', min: 1 }, { id: 'dup' }), st({ type: 'count', min: 1 }, { id: 'dup' })]).stickers.length === 1,
            areaIdClash: run([], [{ id: 'yalong', name: 'Y', bounds: { lngMin: 1 } }]).coastParts.length === 0,
            problemsReported: run([st({ type: 'visits', min: 1 })]).problems.length === 1,
            shoppingRuleHidden: P.evaluatePassport({ state: { v: 1, visits: Object.fromEntries(places.filter((p) => p.category === 'shopping').map((p) => [p.id, { date: '2026-11-19' }])), seen: {} }, places, content: run([st({ type: 'count', min: 1, where: { category: 'shopping' } }, { id: 'shop-sticker' })]) }).stickers.length === 0,
          }; })()""")
        for k, v in validation.items():
            check(f"проверка passport.json: {k}", v)

        backup = b.js(r"""(() => ({
          label: B.SECTION_LABELS['stg:passport'] === 'Паспорт исследователя',
          v15: !B.snapshotReplaceKeys('v15').includes('stg:passport') && B.snapshotReplaceKeys('v15').includes('stg:expenses'),
          v16: B.snapshotReplaceKeys('v16').includes('stg:passport'),
          unknown: !B.snapshotReplaceKeys(null).includes('stg:passport'),
          count: B.countSection('stg:passport', { visits: { a: {}, b: {} } }) === 2,
          raw: B.countRaw('stg:passport', { visits: { a: {}, b: {}, c: 1 } }) === 3,
          parseKeepsUnknown: (() => { const p = B.parseBackup(JSON.stringify({ app: 'sanya-travel-guide', kind: 'user-data-backup', schemaVersion: 1, data: { 'stg:passport': { v: 1, visits: {} }, 'stg:future': {} } })); return p.ok && 'stg:passport' in p.sections && p.unknownKeys.join() === 'stg:future'; })(),
        }))()""")
        for k, v in backup.items():
            check(f"копия данных: {k}", v)

        # storage.js — запись поверх повреждённого значения и без дублей.
        app.setup(extra={"stg:passport": "{повреждено"})
        b.navigate(app.base + "index.html#/places")
        b.wait_ready()
        st = b.js(r"""(async () => {
          const { storage } = await import('./js/storage.js');
          const read = storage.getPassport();
          const rawKept = localStorage.getItem('stg:passport') === '{повреждено';
          const ok1 = storage.markPassportVisit('yalong-bay-beach', '2026-11-19', '2026-11-19T03:00:00.000Z');
          const ok2 = storage.markPassportVisit('yalong-bay-beach', '2026-11-20', '2026-11-20T03:00:00.000Z');
          const after = JSON.parse(localStorage.getItem('stg:passport'));
          const backup = localStorage.getItem('stg:passport:backup');
          storage.removePassportVisit('yalong-bay-beach');
          localStorage.setItem('stg:passport', '[]');
          storage.markPassportVisit('luhuitou-park', '2026-11-19', '2026-11-19T03:00:00.000Z');
          return {
            readEmpty: Object.keys(read.visits).length === 0,
            rawKept,
            writes: ok1 && ok2,
            single: Object.keys(after.visits).length === 1 && after.visits['yalong-bay-beach'].date === '2026-11-19',
            backup: backup === '{повреждено',
            backupOnce: localStorage.getItem('stg:passport:backup') === '{повреждено',
            schema: localStorage.getItem('stg:schema') === '1',
          }; })()""")
        for k, v in st.items():
            check(f"storage stg:passport: {k}", v)
    finally:
        app.close()


# ------------------------------------------------------------------ passport UI

def run_passport(port):
    SECTION[0] = "passport"
    print("\n[passport] карточка места, экран паспорта, копия данных")
    app = App(port)
    b = app.b
    other_keys = {
        "stg:checklist": json.dumps({"visa-check": True}),
        "stg:saved": json.dumps(["luhuitou-park"]),
        "stg:myplan": json.dumps({"planId": None, "days": {"2026-11-19": {"placeIds": ["yalong-bay-beach"], "origin": "user"}}}),
        "stg:plandone": json.dumps({"v": 1, "days": {"2026-11-19": ["place:yalong-bay-beach"]}}),
        "stg:expenses": json.dumps({"v": 1, "items": [{"id": "exp-1", "date": "2026-11-19", "amount": 50, "currency": "CNY", "category": "food"}]}),
        "stg:budget": json.dumps({"v": 1, "base": "RUB", "rates": {"CNY": 11.8}}),
    }
    try:
        app.setup(extra=other_keys)
        snapshot = {k: app.raw(k) for k in list(other_keys) + ["stg:trip"]}
        place = "yalong-bay-beach"
        app.go(f"#/place/{place}", cold=True)
        check("карточка места открылась", app.text(".view-title") == "Пляж Ялонг Бэй")
        order = b.js("""(() => { const kids = [...document.querySelector('#view').children];
            const i = (sel) => kids.findIndex((el) => el.matches(sel));
            return { plan: i('.place-plan-link'), block: i('.passport-block'), last: kids[kids.length - 1].className,
                     firstAction: document.querySelector('.place-actions .btn').textContent }; })()""")
        check("блок «Паспорт» сразу после «Добавить в мой план»", order["block"] == order["plan"] + 1, order)
        check("закреплённые действия по-прежнему последние, первая — «Показать таксисту»",
              order["last"] == "place-actions" and order["firstAction"] == "Показать таксисту", order)
        check("до отметки — «Ещё не отмечено»", app.text(".passport-block__state") == "Ещё не отмечено")
        check("в блоке нет «Снять отметку» до отметки", not b.js("!!window.__byText('.passport-block button', 'Снять отметку')"))

        app.click(".passport-block button", "Отметить посещение")
        status = app.text(".passport-block__status")
        check("после отметки — сообщение о новой наклейке «Первый штамп»", "Новая наклейка" in status and "Первый штамп" in status, status)
        stored = app.storage("stg:passport")
        visit = (stored or {}).get("visits", {}).get(place, {})
        check("отметка записана в stg:passport с датой отметки", visit.get("date") == "2026-11-19" and "at" in visit, stored)
        check("состояние «✓ Отмечено · 19 ноября 2026»", app.text(".passport-block__state") == "✓ Отмечено · 19 ноября 2026", app.text(".passport-block__state"))
        check("фокус остаётся в блоке после отметки", b.js("document.activeElement && document.activeElement.closest('.passport-block') !== null"))

        app.go(f"#/place/{place}", cold=True)
        check("отметка сохраняется после перезапуска", app.text(".passport-block__state") == "✓ Отмечено · 19 ноября 2026")
        check("при повторном открытии кнопки «Отметить» нет", not b.js("!!window.__byText('.passport-block button', 'Отметить посещение')"))

        # Заметка: maxlength и обрезка до 200.
        app.click(".passport-block button", "Добавить заметку")
        check("редактор заметки: textarea с maxlength 200 и 16 px",
              b.js("(() => { const t = document.querySelector('#passport-note-text'); return !!t && t.maxLength === 200 && getComputedStyle(t).fontSize === '16px' && document.activeElement === t; })()"))
        b.js("(() => { const t = document.querySelector('#passport-note-text'); t.value = 'Вода тёплая. ' + 'ж'.repeat(240); t.dispatchEvent(new Event('input')); return true; })()")
        check("счётчик символов обновляется", app.text(".passport-note__counter").endswith("/ 200"))
        app.click(".passport-note button", "Сохранить")
        note = app.storage("stg:passport")["visits"][place].get("note", "")
        check("заметка сохранена и обрезана до 200 символов", len(note) == 200 and note.startswith("Вода тёплая."), len(note))
        check("заметка видна в блоке", (app.text(".passport-block__note") or "").startswith("Заметка: «Вода тёплая."))
        check("статус «Заметка сохранена.»", app.text(".passport-block__status") == "Заметка сохранена.")
        app.click(".passport-block button", "Изменить заметку")
        b.js("(() => { const t = document.querySelector('#passport-note-text'); t.value = 'Вода тёплая, закат в 17:40'; return true; })()")
        app.click(".passport-note button", "Сохранить")
        check("заметку можно изменить", app.storage("stg:passport")["visits"][place].get("note") == "Вода тёплая, закат в 17:40")
        app.click(".passport-block button", "Изменить заметку")
        app.click(".passport-note button", "Отмена")
        check("«Отмена» не меняет заметку", app.storage("stg:passport")["visits"][place].get("note") == "Вода тёплая, закат в 17:40")

        # Снятие отметки с заметкой — только после подтверждения.
        app.click(".passport-block button", "Снять отметку")
        check("с заметкой — встроенное подтверждение", b.js("!!document.querySelector('.passport-block .plan-confirm')"))
        check("до подтверждения отметка на месте", place in app.storage("stg:passport")["visits"])
        app.click(".passport-block .plan-confirm button", "Отмена")
        check("«Отмена» оставляет отметку", place in app.storage("stg:passport")["visits"] and not b.js("!!document.querySelector('.passport-block .plan-confirm')"))
        before_remove = app.storage("stg:passport")["visits"][place]
        app.click(".passport-block button", "Снять отметку")
        app.click(".passport-block .plan-confirm button", "Снять отметку и заметку")
        check("отметка и заметка сняты", place not in app.storage("stg:passport")["visits"])
        check("статус «Отметка снята.» и кнопка «Вернуть отметку»",
              app.text(".passport-block__status") == "Отметка снята." and b.js("!!window.__byText('.passport-block button', 'Вернуть отметку')"))
        app.click(".passport-block button", "Вернуть отметку")
        check("«Вернуть отметку» восстанавливает дату и заметку", app.storage("stg:passport")["visits"].get(place) == before_remove)

        # Снятие без заметки — сразу.
        app.go("#/place/luhuitou-park")
        app.click(".passport-block button", "Отметить посещение")
        app.click(".passport-block button", "Снять отметку")
        check("без заметки отметка снимается сразу", "luhuitou-park" not in app.storage("stg:passport")["visits"] and not b.js("!!document.querySelector('.passport-block .plan-confirm')"))
        app.click(".passport-block button", "Отметить посещение")
        check("повторная отметка — одна запись", list(app.storage("stg:passport")["visits"]).count("luhuitou-park") == 1)

        # Покупки: на память, без наград.
        app.go("#/place/cdf-duty-free-city")
        check("у покупок есть пояснение «на память»", b.js("[...document.querySelectorAll('.passport-block__muted')].some((p) => p.textContent.includes('Покупки можно отмечать на память'))"))
        app.click(".passport-block button", "Отметить посещение")
        check("отметка покупок без сообщения о наклейке", app.text(".passport-block__status") == "Отмечено.", app.text(".passport-block__status"))
        check("отметка покупок сохранена", "cdf-duty-free-city" in app.storage("stg:passport")["visits"])

        # Экран паспорта.
        app.go("#/passport")
        check("#/passport открылся с карточки места («Паспорт ›» не нужен — переход по hash)", app.text(".view-title") == "Паспорт исследователя")
        stats = b.js("[...document.querySelectorAll('.passport-stat')].map((li) => li.textContent)")
        reward_total = len(REWARD)
        check(f"счётчик мест без покупок: 2 из {reward_total}", stats and stats[0] == f"2из {reward_total} мест", stats)
        check("счётчик наклеек «из 11»", stats and stats[1].endswith("из 11 наклеек"), stats)
        check("счётчик частей побережья «из 7»", stats and stats[2].endswith("из 7 частей побережья"), stats)
        visits = b.js("[...document.querySelectorAll('.passport-visit')].map((li) => li.textContent)")
        check("в посещениях 3 места, включая покупки", len(visits) == 3, visits)
        check("заметка видна в посещениях", any("Вода тёплая, закат в 17:40" in v for v in visits))
        check("у мест без заметки — понятная строка", any("Заметки нет" in v for v in visits))
        check("покупки помечены «На память»", any("CDF" in v and "На память" in v for v in visits))
        check("дата подписана как дата отметки", all("Отмечено · " in v for v in visits))
        earned = b.js("[...document.querySelectorAll('.passport-sticker--earned .passport-sticker__title')].map((h) => h.textContent)")
        check("на #/passport лента из 12 наклеек, 1 цветная", b.js("document.querySelectorAll('.passport-strip .pp-sticker-art').length") == 12
              and b.js("document.querySelectorAll('.passport-strip .pp-sticker-art--earned').length") == 1)
        check("на #/passport есть вход в альбом", b.js("!!document.querySelector('a[href=\"#/passport/album\"]')"))
        hint_ids = b.js("[...document.querySelectorAll('.passport-sticker__hint')].map((a) => a.getAttribute('href').replace('#/place/', ''))")
        shop_ids = {p["id"] for p in SHOPPING}
        check("в подсказках нет покупок", hint_ids and not (set(hint_ids) & shop_ids), hint_ids)
        check("в подсказках нет уже отмеченных мест", not ({"yalong-bay-beach", "luhuitou-park"} & set(hint_ids)))
        check("подсказки — только у двух наклеек, ближайших к получению",
              b.js("[...document.querySelectorAll('.passport-sticker')].filter((li) => li.querySelector('.passport-sticker__hints')).length") == 2)
        parts = b.js("[...document.querySelectorAll('.passport-part')].map((a) => a.querySelector('.passport-part__name').textContent + ' ' + a.querySelector('.passport-part__count').textContent)")
        check("части побережья: 7 строк, Ялонг Бэй — 1 из 6", len(parts) == 7 and "Ялонг Бэй 1 из 6 ›" in parts, parts)
        app.go("#/passport/album")
        earned = b.js("[...document.querySelectorAll('.passport-sticker--earned .passport-sticker__title')].map((h) => h.textContent)")
        check("альбом: «Первый штамп» получен", earned == ["Первый штамп"], earned)
        check("альбом: 12 наклеек (11 + необязательная)", b.js("document.querySelectorAll('.passport-sticker').length") == 12)
        check("альбом: необязательная наклейка помечена", b.js("[...document.querySelectorAll('.passport-sticker')].some((li) => li.textContent.includes('Остров на горизонте') && li.textContent.includes('Необязательная'))"))
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← К паспорту» из альбома — назад на #/passport", b.js("location.hash") == "#/passport")
        check("ссылка «Сохранить копию ›» ведёт в #/data", b.js("!!document.querySelector('.passport a[href=\"#/data\"]')"))
        check("подсвечена вкладка «Сейчас»", b.js("document.querySelector('.bottom-nav__item.is-active').dataset.route") == "/")
        check("ошибок в консоли нет", not app.errors())

        # Переход в карточку из паспорта и обратно.
        hist = b.js("history.length")
        b.js("document.querySelector('.passport-visit__link').click(); true")
        b.wait_ready()
        check("карточка из паспорта: «← Назад»", app.text(".place-detail__back") == "← Назад")
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← Назад» из карточки возвращает в паспорт", b.js("location.hash") == "#/passport")
        check("история не растёт после «← Назад»", b.js("history.length") <= hist + 1)
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← Назад» из паспорта — в карточку места, откуда пришли", b.js("location.hash") == "#/place/cdf-duty-free-city", b.js("location.hash"))

        # Вход с Главной и «Назад».
        app.go("#/", cold=True)
        check("на Главной есть вход в паспорт", b.js("!!document.querySelector('.home-head a[href=\"#/passport\"]')"))
        b.js("document.querySelector('a[href=\"#/passport\"]').click(); true")
        b.wait_ready()
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← Назад» из паспорта на Главную", b.js("location.hash") == "#/")
        app.go("#/passport", cold=True)
        app.click(".place-detail__back")
        b.wait_ready()
        check("глубокая ссылка #/passport: «← Назад» — replace на Главную", b.js("location.hash") == "#/")
        b.js("history.back(); true")
        time.sleep(0.4)
        check("после replace «Назад» браузера не возвращает в паспорт", b.js("location.hash") != "#/passport", b.js("location.hash"))

        # addTo: блока нет.
        app.go("#/plan/2026-11-20", cold=True)
        app.go("#/places?addTo=2026-11-20")
        b.js("document.querySelector('a[href^=\"#/place/\"][href*=\"addTo=\"]').click(); true")
        b.wait_ready()
        check("в режиме выбора места для дня блока «Паспорт» нет",
              "addTo=" in b.js("location.hash") and not b.js("!!document.querySelector('.passport-block')"), b.js("location.hash"))

        # Остальные данные пользователя не изменились.
        after = {k: app.raw(k) for k in snapshot}
        check("stg:trip/checklist/saved/myplan/plandone/expenses/budget не изменились", after == snapshot,
              [k for k in snapshot if after[k] != snapshot[k]])

        # Экспорт.
        app.go("#/data", cold=True)
        summary = b.js("[...document.querySelectorAll('.backup-list li')].map((li) => li.textContent)")
        check("«Мои данные»: строка «Паспорт исследователя — 3 посещения»", "Паспорт исследователя — 3 посещения" in summary, summary)
        b.js("""(() => { window.__blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__blobs.push(blob); return orig(blob); };
              HTMLAnchorElement.prototype.click = function () { window.__downloaded = this.download; }; return true; })()""")
        app.click(".backup-actions button", "Скачать файл копии")
        b.wait_for("window.__downloaded")
        exported = json.loads(b.js("window.__blobs[0].text()"))
        data = exported.get("data", {})
        check("экспорт содержит stg:passport с заметкой",
              data.get("stg:passport", {}).get("visits", {}).get(place, {}).get("note") == "Вода тёплая, закат в 17:40")
        check("экспорт сохраняет все прежние разделы", all(k in data for k in list(other_keys) + ["stg:trip"]), list(data))
        check(f"appVersion копии — {CACHE} (SW активен)", exported.get("appVersion") == CACHE, exported.get("appVersion"))
        exported_text = json.dumps(exported)

        # Импорт восстанавливает паспорт.
        b.js("localStorage.removeItem('stg:passport'); true")
        app.go("#/data", cold=True)
        b.js(f"document.querySelector('#backup-text').value = {json.dumps(exported_text)}; true")
        app.click(".backup-actions button", "Проверить текст копии")
        preview = app.text(".backup-preview")
        check("предпросмотр импорта называет паспорт", "Паспорт исследователя — 3 посещения" in (preview or ""), preview)
        app.click(".backup-preview button", "Заменить мои данные")
        b.wait_for("!!document.querySelector('.backup-message')")
        check("импорт восстановил посещения и заметки", app.storage("stg:passport") == data["stg:passport"])
        check("снимок перед импортом сохранён", app.raw("stg:import:backup") is not None)

        # Старая копия (без паспорта) паспорт не трогает; неизвестный раздел пропускается.
        old_copy = {"app": "sanya-travel-guide", "kind": "user-data-backup", "schemaVersion": 1, "exportedAt": "2026-10-01T10:00:00.000Z",
                    "appVersion": "v15", "data": {"stg:saved": ["egret-park"], "stg:future-section": {"x": 1}}}
        passport_before = app.raw("stg:passport")
        app.go("#/data", cold=True)
        b.js(f"document.querySelector('#backup-text').value = {json.dumps(json.dumps(old_copy))}; true")
        app.click(".backup-actions button", "Проверить текст копии")
        preview = app.text(".backup-preview") or ""
        check("неизвестный раздел копии назван пропущенным", "неизвестных разделов пропущено: 1" in preview, preview)
        check("паспорт в списке «Не изменится»", "паспорт исследователя" in preview)
        app.click(".backup-preview button", "Заменить мои данные")
        b.wait_for("!!document.querySelector('.backup-message')")
        check("импорт старой копии не тронул паспорт", app.raw("stg:passport") == passport_before)
        check("импорт старой копии применил известный раздел", app.storage("stg:saved") == ["egret-park"])

        # Откат к снимку старой версии (v15) паспорт не стирает.
        v15_snapshot = {"app": "sanya-travel-guide", "kind": "user-data-backup", "schemaVersion": 1, "exportedAt": "2026-10-01T10:00:00.000Z",
                        "appVersion": "v15", "data": {"stg:saved": ["luhuitou-park"], "stg:trip": TRIP}}
        b.js(f"localStorage.setItem('stg:import:backup', {json.dumps(json.dumps(v15_snapshot))}); true")
        app.go("#/data", cold=True)
        app.click(".backup-actions button", "Вернуть как было до импорта")
        app.click(".plan-confirm button", "Вернуть")
        b.wait_for("!!document.querySelector('.backup-message')")
        check("«Вернуть как было» к снимку v15 сохраняет паспорт", app.raw("stg:passport") == passport_before)
        check("«Вернуть как было» к снимку v15 убирает разделы, которых не было (expenses)", app.raw("stg:expenses") is None)
        v16_snapshot = dict(v15_snapshot, appVersion="v16")
        b.js(f"localStorage.setItem('stg:import:backup', {json.dumps(json.dumps(v16_snapshot))}); true")
        app.go("#/data", cold=True)
        app.click(".backup-actions button", "Вернуть как было до импорта")
        app.click(".plan-confirm button", "Вернуть")
        b.wait_for("!!document.querySelector('.backup-message')")
        check("«Вернуть как было» к снимку v16 без паспорта убирает паспорт, созданный импортом", app.raw("stg:passport") is None)

        # Повреждённое значение: экран не ломается, данные не теряются молча.
        b.js("localStorage.setItem('stg:passport', '{\"visits\": [повреждено'); localStorage.removeItem('stg:passport:backup'); true")
        app.go("#/passport", cold=True)
        check("повреждённый stg:passport: экран открывается пустым", b.js("!!document.querySelector('.passport-empty')"))
        check("повреждённое значение не перезаписано при чтении", app.raw("stg:passport") == '{"visits": [повреждено')
        app.go("#/place/egret-park")
        app.click(".passport-block button", "Отметить посещение")
        check("первая запись поверх повреждённого сохраняет сырую копию", app.raw("stg:passport:backup") == '{"visits": [повреждено')
        check("после записи stg:passport снова валиден", "egret-park" in (app.storage("stg:passport") or {}).get("visits", {}))
        app.go("#/data", cold=True)
        check("аварийная копия не входит в «Мои данные»", "stg:passport:backup" not in (b.js("document.querySelector('.backup-list').textContent") or ""))

        # Пустой паспорт.
        b.js("localStorage.removeItem('stg:passport'); true")
        app.go("#/passport", cold=True)
        empty = app.text(".passport-empty") or ""
        check("пустой паспорт: понятное пустое состояние со ссылкой «К местам»", "Отметить посещение" in empty and b.js("!!document.querySelector('.passport-empty a[href=\"#/places\"]')"), empty)
        check("пустой паспорт: счётчики с нулями", b.js("[...document.querySelectorAll('.passport-stat__value')].map((s) => s.textContent).join()") == "0,0,0")
        app.errors()
    finally:
        app.close()

    # localStorage недоступен.
    app = App(port)
    b = app.b
    try:
        app.setup()
        b.add_init_script("Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });")
        app.go("#/passport", cold=True)
        check("без localStorage: паспорт открывается с пояснением",
              "Отметки не сохраняются" in (app.text(".passport .area-notice") or ""))
        app.go("#/place/yalong-bay-beach", cold=True)
        check("без localStorage: в блоке пояснение и нет кнопок",
              "Отметки не сохраняются" in (app.text(".passport-block") or "") and not b.js("!!document.querySelector('.passport-block button')"))
        errs = [e for e in app.errors() if "stg:" not in e]
        check("без localStorage: неожиданных ошибок в консоли нет", not errs, errs)
    finally:
        app.close()


# ------------------------------------------------------------------ layout

def run_layout(port):
    SECTION[0] = "layout"
    print("\n[layout] 320/360/375/414: переполнение, зоны нажатия, шрифт")
    for width, height in ((320, 568), (360, 640), (375, 667), (414, 896)):
        app = App(port, width, height)
        b = app.b
        try:
            visits = {p["id"]: {"date": "2026-11-19", "at": "2026-11-19T02:00:00.000Z", "note": "Очень длинная заметка " * 9}
                      for p in PLACES[:6] + SHOPPING[:1]}
            app.setup(extra={"stg:passport": json.dumps({"v": 1, "visits": visits, "seen": {}})})
            app.go("#/passport", cold=True)
            check(f"{width}px #/passport: нет горизонтального переполнения", app.overflow() <= 0, app.overflow())
            small = app.small_targets(".passport")
            check(f"{width}px #/passport: зоны нажатия ≥ 44 px", not small, small)
            fonts = b.js("""[...document.querySelectorAll('.passport-visit__note, .passport-sticker__text, .passport-visit__date, .passport-part__name, .settings__intro')]
                .map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((s) => s < 16)""")
            check(f"{width}px #/passport: основной текст ≥ 16 px", not fonts, fonts)
            app.go(f"#/place/{PLACES[0]['id']}", cold=True)
            app.click(".passport-block button", "Изменить заметку")
            check(f"{width}px карточка с блоком и редактором: нет переполнения", app.overflow() <= 0, app.overflow())
            small = app.small_targets(".passport-block")
            check(f"{width}px блок «Паспорт»: зоны нажатия ≥ 44 px", not small, small)
            app.click(".passport-note button", "Отмена")
            app.click(".passport-block button", "Снять отметку")
            check(f"{width}px подтверждение снятия: нет переполнения", app.overflow() <= 0)
            check(f"{width}px ошибок в консоли нет", not app.errors())
        finally:
            app.close()

# -*- coding: utf-8 -*-


# ------------------------------------------------------------------ map

LNG_STOPS = [(109.10, 20), (109.25, 170), (109.42, 300), (109.475, 330), (109.545, 700), (109.67, 850), (109.77, 980)]


def py_project(loc):
    lat, lng = loc["lat"], loc["lng"]
    if not (18.2 <= lat <= 18.39 and LNG_STOPS[0][0] <= lng <= LNG_STOPS[-1][0]):
        return None
    for (a, xa), (b, xb) in zip(LNG_STOPS, LNG_STOPS[1:]):
        if lng <= b:
            x = xa + (lng - a) / (b - a) * (xb - xa)
            break
    y = 910 - (lat - 18.2) / 0.19 * 760
    return (round(x, 1), round(y, 1))


def py_part_of(place):
    loc = place.get("location") or {}
    for part in PASSPORT["coastParts"]:
        b = part["bounds"]
        if "lngMin" in b and not loc.get("lng", -1) >= b["lngMin"]:
            continue
        if "lngMax" in b and not loc.get("lng", 1e9) < b["lngMax"]:
            continue
        if "latMin" in b and not loc.get("lat", -1) >= b["latMin"]:
            continue
        if "latMax" in b and not loc.get("lat", 1e9) < b["latMax"]:
            continue
        return part["id"]
    return None


def run_map(port):
    SECTION[0] = "map"
    print("\n[map] схема побережья, части побережья, альбом")
    app = App(port)
    b = app.b
    try:
        app.setup()
        app.go("#/places", cold=True)
        # Логика проекции и раскладки — import() в браузере.
        unit = b.js(r"""(async () => {
          const M = await import('./js/logic/passport-map.js');
          const D = await import('./js/data.js');
          const P = await import('./js/logic/passport.js');
          const places = await D.loadPlaces();
          const content = P.prepareContent(await D.loadPassport(), await D.loadConfig());
          const pts = places.map((p) => ({ id: p.id, loc: p.location, pt: M.projectPoint(p.location) }));
          let orderOk = true;
          for (const a of pts) for (const b of pts) {
            if (a.loc.lng < b.loc.lng && !(a.pt.x <= b.pt.x)) orderOk = false;
            if (a.loc.lat > b.loc.lat && !(a.pt.y <= b.pt.y)) orderOk = false;
          }
          const layouts = {};
          content.coastParts.forEach((part) => {
            const inPart = M.orderForMap(places.filter((p) => P.coastPartOf(p, content.coastParts) === part.id)).filter((o) => o.point);
            const points = inPart.map((o) => ({ id: o.place.id, x: o.point.x, y: o.point.y }));
            const l1 = M.layoutMarkers(points);
            const l2 = M.layoutMarkers(points);
            let minGap = Infinity;
            l1.markers.forEach((a, i) => l1.markers.forEach((b, j) => { if (i < j) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y)); }));
            const hitPx = (l1.hitR * 280) / l1.viewBox.w;
            const inside = l1.markers.every((m) => m.x - l1.hitR >= l1.viewBox.x - 0.5 && m.x + l1.hitR <= l1.viewBox.x + l1.viewBox.w + 0.5 && m.y - l1.hitR >= l1.viewBox.y - 0.5 && m.y + l1.hitR <= l1.viewBox.y + l1.viewBox.h + 0.5);
            layouts[part.id] = { same: JSON.stringify(l1) === JSON.stringify(l2), n: points.length, noOverlap: l1.markers.length < 2 || minGap >= 2 * l1.hitR - 0.2, hitPx, inside };
          });
          return {
            all: pts.map((p) => [p.id, p.pt && p.pt.x, p.pt && p.pt.y]),
            orderOk,
            corner: JSON.stringify(M.projectPoint({ lat: 18.2, lng: 109.1 })) === JSON.stringify({ x: 20, y: 910 }),
            outside: M.projectPoint({ lat: 18.5, lng: 109.5 }) === null && M.projectPoint({ lat: 18.25, lng: 110.2 }) === null && M.projectPoint(null) === null && M.projectPoint({ lat: NaN, lng: 109.5 }) === null,
            rect: JSON.stringify(M.partRect({ lngMin: 109.42, lngMax: 109.545, latMin: 18.232, latMax: 18.27 })),
            layouts,
          }; })()""")
        expected = {p["id"]: py_project(p["location"]) for p in PLACES}
        mismatch = [i for i, x, y in unit["all"] if expected[i] is None or abs(expected[i][0] - x) > 0.11 or abs(expected[i][1] - y) > 0.11]
        check(f"проекция всех {len(PLACES)} мест совпадает с независимым расчётом", not mismatch, mismatch)
        check("проекция сохраняет порядок: западнее — левее, севернее — выше", unit["orderOk"])
        check("проекция: опорная точка (18.20, 109.10) → (20, 910)", unit["corner"])
        check("место вне охвата схемы или без координат — без точки (null)", unit["outside"])
        rect = json.loads(unit["rect"])
        check("прямоугольник части «Центр» по её границам", abs(rect["x"] - 300) < 0.01 and abs(rect["x"] + rect["w"] - 700) < 0.01 and abs(rect["y"] - 630) < 0.01 and abs(rect["y"] + rect["h"] - 782) < 0.01, rect)
        for pid, r in unit["layouts"].items():
            check(f"раскладка {pid}: детерминирована, без пересечений, зона нажатия ≥ 22 px радиус на 280 px, значки в рамке",
                  r["same"] and r["noOverlap"] and r["hitPx"] >= 21.9 and r["inside"], r)

        # Обзорная схема.
        visits = {"yalong-bay-beach": {"date": "2026-11-14", "note": "Вода тёплая"}, "cdf-duty-free-city": {"date": "2026-11-15"},
                  "luhuitou-park": {"date": "2026-11-16"}}
        app.setup(extra={"stg:passport": json.dumps({"v": 1, "visits": visits, "seen": {}})})
        app.go("#/passport", cold=True)
        ov = b.js(r"""(() => {
          const svg = document.querySelector('.passport-map .pp-map__svg');
          const land = document.getElementById('pp-land');
          const coast = document.getElementById('pp-coast');
          const dots = [...svg.querySelectorAll('.pp-dot')].map((c) => ({ id: c.dataset.place, x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), visited: c.classList.contains('pp-dot--visited') }));
          const len = coast.getTotalLength();
          const samples = []; for (let s = 0; s <= len; s += 2) { const p = coast.getPointAtLength(s); samples.push([p.x, p.y]); }
          const coastDist = (x, y) => Math.min(...samples.map(([a, b]) => Math.hypot(a - x, b - y)));
          return {
            badges: [...svg.querySelectorAll('.pp-badge')].map((a) => a.dataset.part),
            badgeHrefs: [...svg.querySelectorAll('.pp-badge')].map((a) => a.getAttribute('href')),
            dots,
            onLand: dots.filter((d) => !land.isPointInFill(new DOMPoint(d.x, d.y))).map((d) => d.id),
            coastDist: Object.fromEntries(dots.map((d) => [d.id, Math.round(coastDist(d.x, d.y))])),
            islands: svg.querySelectorAll('.pp-island').length,
            caption: document.querySelector('.passport-map__caption').textContent,
            external: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !n.startsWith(location.origin)),
            images: svg.querySelectorAll('image, use[href^="http"]').length,
            role: svg.getAttribute('role'), label: svg.getAttribute('aria-label'),
            badgeLabels: [...svg.querySelectorAll('.pp-badge')].map((a) => a.getAttribute('aria-label')),
          }; })()""")
        part_ids = [p["id"] for p in PASSPORT["coastParts"]]
        check("на схеме 7 значков частей побережья в порядке data/passport.json", ov["badges"] == part_ids, ov["badges"])
        check("значки ведут на экраны частей", ov["badgeHrefs"] == [f"#/passport/zone/{i}" for i in part_ids])
        check("значки с доступными названиями частей и счётом", all(lbl and "отмечено" in lbl for lbl in ov["badgeLabels"]) and "2. Тянья и Сидао: отмечено 0 из 3" in ov["badgeLabels"], ov["badgeLabels"])
        dot_ids = [d["id"] for d in ov["dots"]]
        catalog_ids = {p["id"] for p in PLACES}
        check(f"все {len(PLACES)} verified-мест — точками, ни одной лишней", sorted(dot_ids) == sorted(catalog_ids) and len(dot_ids) == len(set(dot_ids)))
        drafts = [p["id"] for p in load("data/places.json") if p["status"] != "verified"]
        check("черновиков на схеме нет", not (set(drafts) & set(dot_ids)))
        bad_pos = [d["id"] for d in ov["dots"] if expected[d["id"]] and (abs(d["x"] - expected[d["id"]][0]) > 0.11 or abs(d["y"] - expected[d["id"]][1]) > 0.11)]
        check("точки стоят по проекции координат карточек", not bad_pos, bad_pos)
        check("отмеченные места выделены, остальные — нет (по stg:passport)",
              sorted(d["id"] for d in ov["dots"] if d["visited"]) == sorted(visits), [d["id"] for d in ov["dots"] if d["visited"]])
        check("каждое место на суше рисунка (isPointInFill)", not ov["onLand"], ov["onLand"])
        beaches = {p["id"]: ov["coastDist"][p["id"]] for p in PLACES if p["category"] == "beach"}
        check("пляжи у кромки берега (≤ 25 единиц)", all(v <= 25 for v in beaches.values()), beaches)
        check("островов не нарисовано (координат островов в данных нет)", ov["islands"] == 0)
        check("постоянная подпись «Схема для отметок…»", ov["caption"] == "Схема для отметок. Форма берега и расстояния условны. Дорога — в карточке места.", ov["caption"])
        check("нет запросов за пределы приложения и внешних изображений", not ov["external"] and ov["images"] == 0, ov["external"])
        check("схема — группа с доступным названием (не картинка со ссылками)", ov["role"] == "group" and "схема" in (ov["label"] or "").lower())
        check("на схеме нет GPS, отеля, линейки и маршрутов",
              b.js("!document.querySelector('.passport-map [class*=\"route\"], .passport-map [class*=\"hotel\"], .passport-map [class*=\"scale\"], .passport-map [class*=\"gps\"], .passport-map polyline')"))
        check("список частей под схемой — 7 ссылок", b.js("[...document.querySelectorAll('.passport-parts a.passport-part')].map((a) => a.getAttribute('href')).join()") == ",".join(f"#/passport/zone/{i}" for i in part_ids))
        check("ошибок в консоли нет", not app.errors())

        # Переход: значок → часть → место → назад.
        b.js("document.querySelector('.pp-badge[data-part=\"coast-yalong\"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); true")
        b.wait_ready()
        check("значок «Ялонг» открывает #/passport/zone/coast-yalong", b.js("location.hash") == "#/passport/zone/coast-yalong", b.js("location.hash"))
        check("экран части: название и «← К паспорту»", app.text(".view-title") == "Ялонг Бэй" and app.text(".place-detail__back") == "← К паспорту")
        b.js("document.querySelector('.pp-marker[data-place=\"yalong-bay-beach\"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); true")
        b.wait_ready()
        check("значок места открывает карточку места", b.js("location.hash") == "#/place/yalong-bay-beach")
        check("карточка из части побережья — «← Назад»", app.text(".place-detail__back") == "← Назад")
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← Назад» из карточки — в часть побережья", b.js("location.hash") == "#/passport/zone/coast-yalong")
        b.js("document.querySelector('.passport-zone-list a[href=\"#/place/bohou-village\"]').click(); true")
        b.wait_ready()
        check("название места в списке части ведёт в карточку", b.js("location.hash") == "#/place/bohou-village")
        app.click(".place-detail__back")
        b.wait_ready()
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← К паспорту» возвращает на #/passport", b.js("location.hash") == "#/passport")

        # Каждая часть побережья.
        for part in PASSPORT["coastParts"]:
            app.go(f"#/passport/zone/{part['id']}", cold=True)
            want = [p["id"] for p in PLACES if py_part_of(p) == part["id"]]
            reward_total = sum(1 for p in PLACES if py_part_of(p) == part["id"] and p["category"] != "shopping")
            reward_visited = sum(1 for p in PLACES if py_part_of(p) == part["id"] and p["category"] != "shopping" and p["id"] in visits)
            z = b.js("""(() => ({
              items: [...document.querySelectorAll('.passport-zone-item')].map((li) => li.dataset.place),
              markers: [...document.querySelectorAll('.pp-marker')].map((a) => a.dataset.place),
              visitedMarkers: [...document.querySelectorAll('.pp-marker--visited')].map((a) => a.dataset.place),
              labels: [...document.querySelectorAll('.pp-marker')].map((a) => a.getAttribute('aria-label')),
              progress: document.querySelector('.passport-zone__progress').textContent,
              title: document.querySelector('.view-title').textContent,
              hits: [...document.querySelectorAll('.pp-marker__hit')].map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; }),
              svgRect: (() => { const r = document.querySelector('.pp-map__svg').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })(),
              highlighted: document.querySelector('.pp-part--current').dataset.part,
              caption: !!document.querySelector('.passport-map__caption'),
            }))()""")
            check(f"{part['id']}: список — ровно места этой части ({len(want)})", sorted(z["items"]) == sorted(want) and len(z["items"]) == len(set(z["items"])), z["items"])
            check(f"{part['id']}: на схеме значок у каждого места части", sorted(z["markers"]) == sorted(want))
            check(f"{part['id']}: отмеченные значки — по stg:passport", sorted(z["visitedMarkers"]) == sorted(i for i in want if i in visits))
            check(f"{part['id']}: прогресс без покупок «Отмечено {reward_visited} из {reward_total}»", z["progress"] == f"Отмечено {reward_visited} из {reward_total}", z["progress"])
            check(f"{part['id']}: заголовок, выделение части и подпись схемы", z["title"] == part["name"] and z["highlighted"] == part["id"] and z["caption"])
            check(f"{part['id']}: у значков доступные названия с номером и состоянием", all(re.match(r"^\d+\. .+ — (отмечено|ещё не отмечено)$", l) for l in z["labels"]))
            hits = z["hits"]
            small = [h for h in hits if h[2] < 44]
            overlap = [(i, j) for i in range(len(hits)) for j in range(i + 1, len(hits)) if math.hypot(hits[i][0] - hits[j][0], hits[i][1] - hits[j][1]) < (hits[i][2] + hits[j][2]) / 2 - 1]
            l, t, r, bt = z["svgRect"]
            cut = [h for h in hits if h[0] - h[2] / 2 < l - 1 or h[0] + h[2] / 2 > r + 1 or h[1] - h[2] / 2 < t - 1 or h[1] + h[2] / 2 > bt + 1]
            check(f"{part['id']}: зоны нажатия ≥ 44 px, не пересекаются и не обрезаны (375 px)", not small and not overlap and not cut, {"small": small, "overlap": overlap, "cut": cut})
            check(f"{part['id']}: нет переполнения и ошибок", app.overflow() <= 0 and not app.errors())
        app.go("#/passport/zone/coast-nowhere", cold=True)
        check("неизвестная часть побережья — replace на #/passport", b.js("location.hash") == "#/passport")
        app.go("#/passport/zone/dadonghai", cold=True)
        check("ID района config.areas — не часть побережья (replace на #/passport)", b.js("location.hash") == "#/passport")

        # Клавиатура: значки мест в порядке Tab и с видимым фокусом.
        app.go("#/passport/zone/coast-west", cold=True)
        focus = b.js("""(() => { const a = document.querySelector('.pp-marker'); a.focus(); return document.activeElement === a && a.tabIndex >= 0; })()""")
        check("значок места получает фокус клавиатуры", focus)

        # Альбом.
        app.go("#/passport/album", cold=True)
        album = b.js("""(() => [...document.querySelectorAll('.passport-album .passport-sticker')].map((li) => ({
            id: li.dataset.sticker, title: li.querySelector('.passport-sticker__title').textContent,
            earned: li.classList.contains('passport-sticker--earned'), state: li.querySelector('.passport-sticker__state').textContent,
            art: !!li.querySelector('svg.pp-sticker-art'), text: li.querySelector('.passport-sticker__text').textContent,
            hints: [...li.querySelectorAll('.passport-sticker__hint')].map((a) => a.getAttribute('href').replace('#/place/', '')) })))()""")
        check("альбом: все 12 наклеек в порядке data/passport.json", [s["id"] for s in album] == [s["id"] for s in PASSPORT["stickers"]], [s["id"] for s in album])
        titles = {s["id"]: s["title"] for s in album}
        check("альбом: принятые названия", titles.get("taste-of-hainan") == "Рыночный день" and titles.get("green-island") == "Зелёная Санья"
              and titles.get("island-pathfinder") == "Разные стороны Саньи" and titles.get("west-to-east") == "Четыре части побережья", titles)
        above = next(s for s in album if s["id"] == "above-the-bay")
        check("альбом: «above-the-bay» без утверждения о виде сверху", "сверху" not in (above["title"] + above["text"]).lower() and "«Виды»" in above["text"])
        check("альбом: у каждой наклейки иллюстрация, название и описание", all(s["art"] and s["title"] and s["text"] for s in album))
        check("альбом: состояния «✓ Получена» / «Ещё впереди · x из y»", all(s["state"] == "✓ Получена" if s["earned"] else re.match(r"^Ещё впереди · \d+ из \d+$", s["state"]) for s in album))
        check("альбом: получены «Первый штамп» и только он (покупки не считаются)", [s["id"] for s in album if s["earned"]] == ["first-stamp"])
        shop_ids = {p["id"] for p in SHOPPING}
        all_hints = [h for s in album for h in s["hints"]]
        check("альбом: подсказки — без покупок и без отмеченных мест", all_hints and not (set(all_hints) & (shop_ids | set(visits))))
        check("альбом: у необязательной наклейки нет подсказок", not next(s for s in album if s["id"] == "island-horizon")["hints"])
        check("альбом: подсказки свёрнуты, «Какие места подойдут» ≥ 44 px", b.js("[...document.querySelectorAll('.passport-sticker__summary')].every((s) => s.getBoundingClientRect().height >= 44)"))

        # Получение наклейки обновляется по отметкам.
        app.go("#/place/dadonghai-beach", cold=True)
        app.click(".passport-block button", "Отметить посещение")
        check("вторая отметка пляжа: «Новая наклейка: «Морской исследователь»»", "Морской исследователь" in (app.text(".passport-block__status") or ""))
        app.go("#/passport/album")
        check("альбом: «Морской исследователь» получен после отметки", b.js("document.querySelector('[data-sticker=\"sea-explorer\"]').classList.contains('passport-sticker--earned')"))
        app.go("#/place/dadonghai-beach")
        app.click(".passport-block button", "Снять отметку")
        app.go("#/passport/album")
        check("альбом: после снятия отметки наклейка снова «Ещё впереди · 1 из 2»",
              app.text("[data-sticker=\"sea-explorer\"] .passport-sticker__state") == "Ещё впереди · 1 из 2")
        # Все покупки отмечены — наград не прибавилось.
        all_shop = dict(visits, **{p["id"]: {"date": "2026-11-18"} for p in SHOPPING})
        b.js(f"localStorage.setItem('stg:passport', {json.dumps(json.dumps({'v': 1, 'visits': all_shop, 'seen': {}}))}); true")
        app.go("#/passport/album", cold=True)
        check("альбом: все 14 покупок отмечены — получен по-прежнему только «Первый штамп»",
              b.js("[...document.querySelectorAll('.passport-sticker--earned')].map((li) => li.dataset.sticker).join()") == "first-stamp")
        app.go("#/passport", cold=True)
        check("схема: покупки отмечены на схеме, но счёт частей без покупок",
              b.js("document.querySelectorAll('.pp-dot--visited').length") == len(all_shop)
              and b.js("document.querySelector('.pp-badge[data-part=\"coast-haitang\"]').getAttribute('aria-label')") == "7. Хайтанг Бэй: отмечено 0 из 7")

        # Отметки и заметки после перезагрузки.
        b.js("location.reload(); true")
        time.sleep(0.5)
        b.wait_ready()
        app.go("#/passport/zone/coast-yalong")
        check("после перезагрузки отметка и заметка на экране части", "Вода тёплая" in (app.text(".passport-zone-list") or "")
              and b.js("!!document.querySelector('.pp-marker--visited[data-place=\"yalong-bay-beach\"]')"))
        check("ошибок в консоли нет", not app.errors())
    finally:
        app.close()

    # 320 px: обзор и значки без переполнения, зоны нажатия значков ≥ 44 px.
    for width, height in ((320, 568), (414, 896)):
        app = App(port, width, height)
        b = app.b
        try:
            app.setup()
            app.go("#/passport", cold=True)
            badges = b.js("""[...document.querySelectorAll('.pp-badge__hit')].map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; })""")
            small = [h for h in badges if h[2] < 44]
            overlap = [(i, j) for i in range(len(badges)) for j in range(i + 1, len(badges)) if math.hypot(badges[i][0] - badges[j][0], badges[i][1] - badges[j][1]) < (badges[i][2] + badges[j][2]) / 2 - 1]
            check(f"{width}px обзор: зоны значков ≥ 44 px и не пересекаются", not small and not overlap, {"small": small, "overlap": overlap})
            check(f"{width}px обзор: нет переполнения", app.overflow() <= 0)
            for part in PASSPORT["coastParts"]:
                app.go(f"#/passport/zone/{part['id']}")
                hits = b.js("""[...document.querySelectorAll('.pp-marker__hit')].map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; })""")
                small = [h for h in hits if h[2] < 44]
                overlap = [(i, j) for i in range(len(hits)) for j in range(i + 1, len(hits)) if math.hypot(hits[i][0] - hits[j][0], hits[i][1] - hits[j][1]) < (hits[i][2] + hits[j][2]) / 2 - 1]
                check(f"{width}px {part['id']}: зоны нажатия ≥ 44 px, без пересечений, без переполнения", not small and not overlap and app.overflow() <= 0, {"small": small, "overlap": overlap})
            app.go("#/passport/album")
            check(f"{width}px альбом: нет переполнения, зоны нажатия ≥ 44 px", app.overflow() <= 0 and not app.small_targets(".passport"), app.small_targets(".passport"))
            check(f"{width}px ошибок в консоли нет", not app.errors())
        finally:
            app.close()

    # Дата отметки — по настоящим часам устройства, без подмены даты.
    b = Browser()
    try:
        b.navigate(f"http://127.0.0.1:{port}/index.html#/places")
        b.js(f"localStorage.clear(); localStorage.setItem('stg:trip', {json.dumps(json.dumps(TRIP))}); localStorage.setItem('stg:installHintDismissed', '1'); true")
        b.navigate(f"http://127.0.0.1:{port}/index.html#/place/egret-park")
        b.js("[...document.querySelectorAll('.passport-block button')].find((e) => e.textContent === 'Отметить посещение').click(); true")
        real = b.js("""(() => { const v = JSON.parse(localStorage.getItem('stg:passport')).visits['egret-park']; const d = new Date();
            const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            return { date: v.date, today, atAge: Date.now() - Date.parse(v.at) }; })()""")
        check("дата новой отметки — сегодняшняя дата устройства (не даты поездки)", real["date"] == real["today"], real)
        check("момент отметки — текущее время (не старше минуты)", 0 <= real["atAge"] < 60000, real)
    finally:
        b.close()


# ------------------------------------------------------------------ regression

def run_regression(port):
    SECTION[0] = "regression"
    print("\n[regression] существующие экраны, навигация, Главная во всех состояниях")
    excursions = [e for e in load("data/excursions.json") if e["status"] == "verified"]
    info = [i for i in load("data/info.json") if i["status"] == "verified"]
    routes = [
        "#/", "#/places", "#/places?mode=food", f"#/place/{PLACES[0]['id']}", f"#/place/{PLACES[0]['id']}/taxi",
        f"#/place/{PLACES[0]['id']}/plan", "#/excursions", f"#/excursion/{excursions[0]['id']}", "#/prepare", "#/info",
        f"#/info/{info[0]['id']}", "#/handy", "#/handy/taxi", "#/plan", "#/plan/2026-11-19", "#/recommended",
        "#/recommended/2026-11-19", "#/expenses", "#/expenses/add", "#/expenses/settings", "#/now", "#/data", "#/settings",
        "#/passport", "#/passport/album", *[f"#/passport/zone/{p['id']}" for p in PASSPORT["coastParts"]],
    ]
    for width, height in ((375, 667), (320, 568)):
        app = App(port, width, height)
        b = app.b
        try:
            app.setup()
            for route in routes:
                app.go(route, cold=True)
                ok = b.js("!!document.querySelector('#view') && document.querySelector('#view').children.length > 0 && !document.querySelector('#view .error-state')")
                errs = app.errors()
                over = app.overflow()
                check(f"{width}px {route}: открылся без ошибок и без переполнения", ok and not errs and over <= 0, {"errs": errs, "overflow": over})
            check(f"{width}px нижняя навигация — 5 вкладок", b.js("document.querySelectorAll('.bottom-nav__item').length") == 5)
        finally:
            app.close()

    app = App(port)
    b = app.b
    try:
        app.setup()
        # «Подготовка»: отметка сохраняется.
        app.go("#/prepare", cold=True)
        first = b.js("(() => { const c = document.querySelector('.task__checkbox'); c.click(); return c.dataset.id || c.id || c.closest('[data-id]') && c.closest('[data-id]').dataset.id || 'ok'; })()")
        state = app.storage("stg:checklist") or {}
        check("«Подготовка»: отметка пункта пишет stg:checklist", len(state) == 1, state)
        app.go("#/prepare", cold=True)
        check("«Подготовка»: отметка сохраняется после перезапуска", b.js("document.querySelectorAll('.task__checkbox:checked').length") == 1)

        # Избранное в карточке места по-прежнему работает.
        app.go(f"#/place/{PLACES[1]['id']}", cold=True)
        app.click(".place-detail__save")
        check("избранное в карточке места работает", PLACES[1]["id"] in (app.storage("stg:saved") or []))

        # «← К местам» со списка — history.back без роста истории.
        app.go("#/places", cold=True)
        h0 = b.js("history.length")
        b.js(f"document.querySelector('a[href=\"#/place/{PLACES[2]['id']}\"]').click(); true")
        b.wait_ready()
        app.click(".place-detail__back")
        b.wait_ready()
        check("карточка места → «← К местам» возвращает в список", b.js("location.hash") == "#/places")
        check("история после «← К местам» не растёт", b.js("history.length") <= h0 + 1)

        # Главная во всех состояниях: вход в паспорт — один, в шапке экрана
        # (UX-итерация 2026-10: раньше — строка под основным сценарием, на
        # втором-третьем экране). Основной сценарий остаётся на месте.
        for label, now, trip, after_sel in (
            ("до поездки", "2026-11-01,10,0", TRIP, ".home-action"),
            ("в поездке", "2026-11-19,10,0", TRIP, ".home-scenarios"),
            ("после поездки", "2026-12-05,10,0", TRIP, ".home-scenarios"),
            ("без дат", "2026-11-19,10,0", {"start": None, "end": None, "area": None, "stay": None, "home": None}, ".home-scenarios"),
        ):
            now = now.replace("-", ",")
            app.setup(now=now, trip=trip)
            app.go("#/", cold=True)
            pos = b.js(f"""(() => {{ const links = [...document.querySelectorAll('#view a[href="#/passport"]')]; const main = document.querySelector({json.dumps(after_sel)});
                if (links.length !== 1 || !main) return {{ links: links.length, main: !!main }};
                const r = links[0].getBoundingClientRect(); const title = document.querySelector('.home-head .view-title').getBoundingClientRect();
                return {{ links: 1, main: true, inHead: !!links[0].closest('.home-head'), name: links[0].getAttribute('aria-label'), top: Math.round(r.top), h: Math.round(r.height),
                         w: Math.round(r.width), titleTop: Math.round(title.top), settings: !!document.querySelector('.home-head a[href="#/settings"]') }}; }})()""")
            check(f"Главная {label}: вход в паспорт один, в шапке экрана рядом с настройками, на первом экране",
                  pos.get("links") == 1 and pos.get("inHead") and pos.get("name") == "Паспорт исследователя" and pos.get("settings")
                  and pos["top"] < 160 and pos["h"] >= 44 and pos["w"] >= 44, pos)
            check(f"Главная {label}: основной сценарий на месте, шапка экрана не выросла", pos.get("main") is True and pos.get("titleTop") == 101, pos)
            # Поведение, а не только разметка: вход открывает паспорт, «← Назад» возвращает на «Сейчас».
            h0 = b.js("history.length")
            b.js("document.querySelector('.home-head a[href=\"#/passport\"]').click(); true")
            b.wait_ready()
            opened = [b.js("location.hash"), app.text(".view-title")]
            app.click(".place-detail__back")
            b.wait_ready()
            check(f"Главная {label}: вход из шапки открывает паспорт, «← Назад» возвращает на «Сейчас» без роста истории",
                  opened == ["#/passport", "Паспорт исследователя"] and b.js("location.hash") == "#/" and b.js("history.length") <= h0 + 1, opened)
            check(f"Главная {label}: нет переполнения и ошибок", app.overflow() <= 0 and not app.errors())
    finally:
        app.close()


# ------------------------------------------------------------------ travel

HOME = {"addressZh": "三亚市吉阳区亚龙湾国家旅游度假区测试酒店", "nameRu": "Тестовый отель"}


def run_travel(port):
    SECTION[0] = "travel"
    print("\n[travel] прилёт и первый вечер, фразы по группам, справка для поездки")
    phrases = load("data/phrases.json")
    contacts = load("data/contacts.json")
    first_evening = next(i for i in load("data/info.json") if i["id"] == "first-evening")
    arrival_links = "[...document.querySelectorAll('.today-arrival a')].map((a) => a.getAttribute('href'))"
    for width, height in ((375, 667), (320, 568)):
        app = App(port, width, height)
        b = app.b
        try:
            # Вечер прилёта, адрес отеля ещё не указан.
            app.setup(now="2026,11,13,20,30")
            app.go("#/", cold=True)
            check(f"{width}px вечер прилёта: блок «Прилёт и первый вечер» на «Сейчас»",
                  b.js(arrival_links) == ["#/info/first-evening", "#/settings?section=home", "#/info/airport-arrival"], b.js(arrival_links))
            check(f"{width}px вечер прилёта: блок один, без переполнения и ошибок",
                  b.js("document.querySelectorAll('.today-arrival').length") == 1 and app.overflow() <= 0 and not app.errors())
            check(f"{width}px вечер прилёта: ссылки блока не меньше 44 px", not app.small_targets(".today-arrival"), app.small_targets(".today-arrival"))
            # Поведение ссылки без адреса: настройки открываются на блоке адреса, «← Назад» возвращает на «Сейчас».
            b.js("document.querySelector('.today-arrival a[href=\"#/settings?section=home\"]').click(); true")
            b.wait_ready()
            time.sleep(0.3)
            field = b.js("(() => { const f = document.querySelector('#trip-home-address'); if (!f) return null; const r = f.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight, f.value]; })()")
            check(f"{width}px вечер прилёта: «Указать адрес отеля» открывает настройки на блоке адреса, поле на экране и пустое",
                  bool(field) and 0 <= field[0] and field[1] <= field[2] and field[3] == "", field)
            app.click(".place-detail__back")
            b.wait_ready()
            check(f"{width}px вечер прилёта: из настроек «← Назад» возвращает на «Сейчас»", b.js("location.hash") == "#/", b.js("location.hash"))

            # Адрес указан: с Главной — сразу на экран для таксиста и обратно.
            app.setup(now="2026,11,13,20,30", trip=dict(TRIP, home=HOME))
            app.go("#/", cold=True)
            check(f"{width}px с адресом: ссылка «Показать адрес таксисту»",
                  b.js(arrival_links) == ["#/info/first-evening", "#/handy/taxi", "#/info/airport-arrival"], b.js(arrival_links))
            b.js("document.querySelector('.today-arrival a[href=\"#/handy/taxi\"]').click(); true")
            b.wait_ready()
            check(f"{width}px адрес открыт крупно, китайский текст из настроек", app.text(".taxi__name") == HOME["addressZh"], app.text(".taxi__name"))
            check(f"{width}px экран адреса: без переполнения", app.overflow() <= 0)
            app.click(".taxi__actions a", "Закрыть")
            b.wait_ready()
            check(f"{width}px «Закрыть» возвращает на «Сейчас»", b.js("location.hash") == "#/", b.js("location.hash"))
            # Прежний путь: из «Под рукой» «Закрыть» возвращает в «Под рукой».
            app.go("#/handy", cold=True)
            b.js("document.querySelector('a[href=\"#/handy/taxi\"]').click(); true")
            b.wait_ready()
            app.click(".taxi__actions a", "Закрыть")
            b.wait_ready()
            check(f"{width}px из «Под рукой» «Закрыть» возвращает в «Под рукой»", b.js("location.hash") == "#/handy", b.js("location.hash"))

            # День прилёта с планом на день: блок внутри карточки «Сегодня».
            app.setup(now="2026,11,13,20,30", extra={
                "stg:myplan": json.dumps({"planId": None, "days": {"2026-11-13": {"placeIds": ["yalong-bay-beach"], "origin": "user"}}})})
            app.go("#/", cold=True)
            check(f"{width}px день прилёта с планом: блок внутри карточки «Сегодня», один",
                  b.js("document.querySelectorAll('.today .today-arrival').length") == 1 and b.js("document.querySelectorAll('.today-arrival').length") == 1)

            # Когда блок нужен, а когда нет.
            for label, now, expected in (("накануне вылета", "2026,11,12,9,0", 1), ("за две недели", "2026,11,1,9,0", 0),
                                         ("в середине поездки", "2026,11,19,10,0", 0), ("после поездки", "2026,12,5,10,0", 0)):
                app.setup(now=now)
                app.go("#/", cold=True)
                check(f"{width}px {label}: блок прилёта {'есть' if expected else 'не показан'}",
                      b.js("document.querySelectorAll('.today-arrival').length") == expected)
                check(f"{width}px {label}: «Сейчас» без переполнения и ошибок", app.overflow() <= 0 and not app.errors())

            # Карточки справки для поездки.
            app.setup(now="2026,11,13,20,30")
            for info_id in ("first-evening", "airport-arrival", "taxi-rules", "payment", "connectivity"):
                app.go(f"#/info/{info_id}", cold=True)
                item = next(i for i in load("data/info.json") if i["id"] == info_id)
                shown = b.js("document.querySelectorAll('.info-detail__points li').length")
                links = b.js("document.querySelectorAll('.sources__list a').length")
                check(f"{width}px #/info/{info_id}: все пункты и источники на экране, без переполнения",
                      app.text(".view-title") == item["title"] and shown == len(item["points"]) and links == len(item["sources"]) and app.overflow() <= 0 and not app.errors(),
                      {"points": shown, "sources": links, "overflow": app.overflow()})
            app.go("#/info", cold=True)
            order = b.js("[...document.querySelectorAll('.info-list a')].map((a) => a.getAttribute('href'))")
            check(f"{width}px «Справка»: «Первый вечер» стоит перед «Прилётом»",
                  "#/info/first-evening" in order and order.index("#/info/first-evening") < order.index("#/info/airport-arrival"), order[:6])

            # «Под рукой»: фразы по группам, контакт аэропорта.
            app.go("#/handy", cold=True)
            groups = b.js("[...document.querySelectorAll('.handy__group')].map((h) => h.textContent)")
            check(f"{width}px «Под рукой»: четыре группы фраз по порядку", groups == ["Основное", "Такси и дорога", "Кафе и покупки", "Здоровье и помощь"], groups)
            check(f"{width}px «Под рукой»: показаны все {len(phrases)} фраз, каждая один раз",
                  sorted(b.js("[...document.querySelectorAll('a.phrase')].map((a) => decodeURIComponent(a.getAttribute('href').split('/').pop()))")) == sorted(p["id"] for p in phrases))
            check(f"{width}px «Под рукой»: показаны все {len(contacts)} контактов",
                  b.js("document.querySelectorAll('a.contact').length") == len(contacts))
            check(f"{width}px «Под рукой»: справочная аэропорта набирается в один тап",
                  b.js("!!document.querySelector('a.contact[href=\"tel:0898-9612333\"]')"))
            check(f"{width}px «Под рукой»: без переполнения, ошибок и мелких целей",
                  app.overflow() <= 0 and not app.errors() and not app.small_targets("#view"), app.small_targets("#view"))
            # Быстрый переход: прокрутка к разделу без смены адреса и истории.
            chips = b.js("[...document.querySelectorAll('.handy__jump .chip')].map((c) => c.textContent)")
            check(f"{width}px «Под рукой»: быстрые переходы к телефонам и группам фраз",
                  chips == ["Телефоны", "Основное", "Такси и дорога", "Кафе и покупки", "Здоровье и помощь"], chips)
            h0 = b.js("history.length")
            app.click(".handy__jump .chip", "Здоровье и помощь")
            top = b.js("Math.round([...document.querySelectorAll('.handy__group')].find((h) => h.textContent === 'Здоровье и помощь').getBoundingClientRect().top)")
            check(f"{width}px быстрый переход прокручивает к группе «Здоровье и помощь»", top is not None and -2 <= top <= height / 2, top)
            check(f"{width}px быстрый переход не меняет адрес и историю", b.js("location.hash") == "#/handy" and b.js("history.length") == h0)
            # Фраза без пиньиня (источник его не даёт) и фраза с пиньинем.
            b.js("document.querySelector('a.phrase[href=\"#/handy/phrase/receipt\"]').click(); true")
            b.wait_ready()
            check(f"{width}px фраза без пиньиня: иероглифы и перевод, пустой строки нет",
                  app.text(".taxi__name") == "发票" and b.js("document.querySelectorAll('.taxi__pinyin').length") == 0 and app.text(".taxi__ru") == "Чек")
            app.click(".taxi__actions a", "Закрыть")
            b.wait_ready()
            check(f"{width}px фраза → «Закрыть» возвращает в «Под рукой»", b.js("location.hash") == "#/handy")
            app.go("#/handy/phrase/cash", cold=True)
            check(f"{width}px фраза с пиньинем показывает его", app.text(".taxi__name") == "现金" and bool(app.text(".taxi__pinyin")) and app.overflow() <= 0)

            # Новое дело чек-листа видно в «Подготовке».
            app.go("#/prepare", cold=True)
            check(f"{width}px «Подготовка»: есть дело про проверку без интернета",
                  b.js("[...document.querySelectorAll('.task')].some((t) => t.textContent.includes('открывается без интернета'))"))
            check(f"{width}px «Подготовка»: без переполнения и ошибок", app.overflow() <= 0 and not app.errors())
        finally:
            app.close()
    check("карточка «Первый вечер» ссылается только на существующие разделы приложения",
          all(name in " ".join(first_evening["points"]) for name in ("«Под рукой»", "«Показать таксисту»", "«Прилёт: аэропорт Феникс»")))


# ------------------------------------------------------------------ offline

def run_offline(port):
    SECTION[0] = "offline"
    print(f"\n[offline] Service Worker {CACHE}, паспорт без сети")
    server = serve(ROOT, port)
    app = App(port)
    b = app.b
    try:
        app.setup()
        app.go("#/places", cold=True)
        ready = b.wait_for("navigator.serviceWorker && navigator.serviceWorker.controller !== null", 20)
        check("Service Worker взял страницу под контроль", ready)
        cached = b.js("""(async () => { const keys = await caches.keys(); const c = await caches.open('sanya-guide-""" + CACHE + """');
            const urls = (await c.keys()).map((r) => new URL(r.url).pathname.replace(/^\\//, ''));
            return { keys, urls }; })()""")
        check(f"кэш называется sanya-guide-{CACHE}", f"sanya-guide-{CACHE}" in cached["keys"], cached["keys"])
        for f in ("js/logic/passport.js", "js/views/passport.js", "data/passport.json", "js/logic/passport-map.js", "js/views/passport-art.js"):
            check(f"в кэше есть {f}", f in cached["urls"])
        # «Подготовка»: проверяемый статус офлайн-копии (число файлов называет воркер).
        precache = re.findall(r'"\./([^"]+)"', open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read().split("const PRECACHE")[1].split("];")[0])
        offline_state = "(() => { const s = document.querySelector('.offline-check'); return s ? [s.dataset.state, s.querySelector('.offline-check__state').textContent] : null; })()"
        app.go("#/prepare", cold=True)
        b.wait_for("document.querySelector('.offline-check') && document.querySelector('.offline-check').dataset.state !== 'checking'", 10)
        state = b.js(offline_state)
        check(f"«Подготовка»: офлайн-копия готова — все {len(precache)} файлов версии {CACHE}",
              bool(state) and state[0] == "ready" and f"все {len(precache)} файлов версии {CACHE}" in state[1] and state[1].startswith("✓"), state)
        server.shutdown()
        server.server_close()
        time.sleep(0.3)
        app.go("#/passport", cold=True)
        check("без сети #/passport открывается", app.text(".view-title") == "Паспорт исследователя")
        app.go("#/place/yalong-bay-beach", cold=True)
        app.click(".passport-block button", "Отметить посещение")
        check("без сети отметка ставится и сохраняется", "yalong-bay-beach" in (app.storage("stg:passport") or {}).get("visits", {}))
        check("без сети сообщение о наклейке (контент паспорта из кэша)", "Первый штамп" in (app.text(".passport-block__status") or ""))
        app.go("#/passport", cold=True)
        check("без сети схема побережья рисуется", b.js("document.querySelectorAll('.passport .pp-badge').length") == 7)
        app.go("#/passport/zone/coast-yalong", cold=True)
        check("без сети экран части побережья открывается, место отмечено",
              b.js("!!document.querySelector('.pp-marker--visited[data-place=\"yalong-bay-beach\"]')"))
        app.go("#/passport/album", cold=True)
        check("без сети альбом открывается", b.js("document.querySelectorAll('.passport-album .passport-sticker').length") == 12)
        # Вечер прилёта без сети: памятка, адрес для таксиста, фразы и телефоны.
        b.js(f"localStorage.setItem('stg:trip', {json.dumps(json.dumps(dict(TRIP, home=HOME)))}); sessionStorage.setItem('__fakeNow', '2026,11,13,20,30'); true")
        app.go("#/", cold=True)
        check("без сети на «Сейчас» есть блок прилёта", b.js("document.querySelectorAll('.today-arrival a').length") == 3)
        app.go("#/info/first-evening", cold=True)
        check("без сети открывается «Первый вечер: по шагам»", app.text(".view-title") == "Первый вечер: по шагам"
              and b.js("document.querySelectorAll('.info-detail__points li').length") > 5)
        app.go("#/handy/taxi", cold=True)
        check("без сети адрес отеля показывается таксисту", app.text(".taxi__name") == HOME["addressZh"], app.text(".taxi__name"))
        app.go("#/handy", cold=True)
        check("без сети «Под рукой» показывает фразы и телефоны",
              b.js("document.querySelectorAll('a.phrase').length") == len(load("data/phrases.json"))
              and b.js("document.querySelectorAll('a.contact').length") == len(load("data/contacts.json")))
        app.go("#/prepare", cold=True)
        b.wait_for("document.querySelector('.offline-check') && document.querySelector('.offline-check').dataset.state !== 'checking'", 10)
        check("без сети «Подготовка» открывается, статус офлайн-копии по-прежнему «готово»", (b.js(offline_state) or [None])[0] == "ready", b.js(offline_state))
        app.go(f"#/place/{PLACES[0]['id']}", cold=True)
        app.click(".route-toggle")
        check("без сети карточка места с выбором маршрута открывается, ссылки Amap остаются внешними",
              b.js("document.querySelectorAll('.route-choice a[target=\"_blank\"]').length") == 2 and "интернет" in (app.text(".route-choice__hint") or ""))
        app.go("#/info", cold=True)
        check("без сети справка открывается по группам", b.js("document.querySelectorAll('.info-group__title').length") >= 3)
        check("без сети ошибок в консоли нет", not app.errors())
        # Неполный кэш не выдаётся за готовность: убираем один файл и проверяем снова.
        app.go("#/prepare", cold=True)
        b.wait_for("document.querySelector('.offline-check') && document.querySelector('.offline-check').dataset.state === 'ready'", 10)
        b.js(f"caches.open('sanya-guide-{CACHE}').then((c) => c.delete('./assets/icons/icon-512.png')).then(() => true)")
        app.click(".offline-check__again")
        b.wait_for("document.querySelector('.offline-check').dataset.state !== 'checking' && document.querySelector('.offline-check').dataset.state !== 'ready'", 10)
        state = b.js(offline_state)
        check("неполный кэш: статус «неполная», а не «готово»",
              state[0] == "partial" and f"{len(precache) - 1} из {len(precache)}" in state[1] and "✓" not in state[1], state)
    finally:
        app.close()
        try:
            server.shutdown()
        except Exception:  # noqa: BLE001
            pass


# ------------------------------------------------------------------ upgrade

def run_upgrade(port):
    SECTION[0] = "upgrade"
    print("\n[upgrade] установленная HEAD-версия → рабочая копия: данные не теряются")
    tmp = tempfile.mkdtemp(prefix="sanya-upgrade-")
    head_dir = os.path.join(tmp, "head")
    os.makedirs(head_dir)
    subprocess.run(f"git archive HEAD | tar -x -C '{head_dir}'", shell=True, cwd=ROOT, check=True)
    head_version = re.search(r'CACHE_VERSION = "(v\d+)"', open(os.path.join(head_dir, "sw.js"), encoding="utf-8").read()).group(1)
    root = os.path.join(tmp, "root")
    os.makedirs(root)
    link = os.path.join(root, "app")
    os.symlink(head_dir, link)
    server = serve(root, port)
    base = f"http://127.0.0.1:{port}/app/"
    b = Browser()
    b.add_init_script(FAKE_DATE)
    b.add_init_script(FIND)
    try:
        b.navigate(base + "index.html#/places")
        user = {
            "stg:trip": json.dumps(TRIP), "stg:installHintDismissed": "1",
            "stg:checklist": json.dumps({"visa-check": True}), "stg:saved": json.dumps(["luhuitou-park"]),
            "stg:myplan": json.dumps({"planId": None, "days": {"2026-11-19": {"placeIds": ["yalong-bay-beach"], "origin": "user"}}}),
            "stg:expenses": json.dumps({"v": 1, "items": [{"id": "exp-1", "date": "2026-11-19", "amount": 50, "currency": "CNY", "category": "food"}]}),
            "stg:passport": json.dumps({"v": 1, "visits": {"luhuitou-park": {"date": "2026-11-16", "at": "2026-11-16T02:00:00.000Z", "note": "Закат с горы"}}, "seen": {}}),
        }
        b.js(f"localStorage.clear(); sessionStorage.setItem('__fakeNow', '2026,11,19,10,0'); Object.entries({json.dumps(user)}).forEach(([k, v]) => localStorage.setItem(k, v)); true")
        b.navigate(base + "index.html#/places")
        check(f"старая версия ({head_version}) взяла страницу под контроль", b.wait_for("navigator.serviceWorker.controller !== null", 20))

        # Копия новой версии с неизвестным старой версии разделом: раздел
        # пропускается, известные импортируются.
        head_knows_passport = "stg:passport" in open(os.path.join(head_dir, "js/storage.js"), encoding="utf-8").read()
        new_copy = {"app": "sanya-travel-guide", "kind": "user-data-backup", "schemaVersion": 1, "exportedAt": "2026-11-19T10:00:00.000Z",
                    "appVersion": CACHE, "data": {"stg:saved": ["luhuitou-park", "egret-park"], "stg:future-section": {"x": 1}}}
        b.go(base, "#/data", cold=True)
        b.js(f"document.querySelector('#backup-text').value = {json.dumps(json.dumps(new_copy))}; true")
        b.js("window.__click('.backup-actions button', 'Проверить текст копии')")
        preview = b.js("document.querySelector('.backup-preview').textContent")
        check(f"{head_version}: неизвестный раздел копии — «неизвестных разделов пропущено: 1»", "неизвестных разделов пропущено: 1" in preview, preview)
        b.js("window.__click('.backup-preview button', 'Заменить мои данные')")
        b.wait_for("!!document.querySelector('.backup-message')")
        check(f"{head_version}: известные разделы импортированы", json.loads(b.js("localStorage.getItem('stg:saved')")) == ["luhuitou-park", "egret-park"])
        check(f"{head_version}: импорт без раздела паспорта не тронул паспорт",
              json.loads(b.js("localStorage.getItem('stg:passport')") or "{}").get("visits", {}).get("luhuitou-park", {}).get("note") == "Закат с горы")
        b.js("localStorage.removeItem('stg:import:backup'); localStorage.setItem('stg:saved', JSON.stringify(['luhuitou-park'])); true")
        if head_knows_passport:
            b.go(base, "#/place/luhuitou-park", cold=True)
            check(f"{head_version}: отметка с заметкой видна до обновления", "Закат с горы" in (b.js("(document.querySelector('.passport-block') || {}).textContent") or ""))

        before = b.js("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))")
        os.unlink(link)
        os.symlink(ROOT, link)
        b.js("navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)")
        appeared = b.wait_for("!!window.__byText('.pwa-bar button', 'Обновить')", 30)
        check("появилась плашка «Доступна новая версия»", appeared)
        b.js("window.__click('.pwa-bar button', 'Обновить')")
        time.sleep(2.5)
        b.wait_ready()
        version = b.js("""new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => resolve(e.data);
            navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]); setTimeout(() => resolve(null), 3000); })""")
        check(f"после «Обновить» работает {CACHE} (было {head_version})", version == CACHE, version)
        after = b.js("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))")
        check("обновление не изменило localStorage", after == before)
        b.go(base, "#/passport/zone/coast-dadonghai", cold=True)
        check("после обновления прежняя отметка видна на схеме части побережья",
              b.js("!!document.querySelector('.pp-marker--visited[data-place=\"luhuitou-park\"]')"))
        check("после обновления прежняя заметка видна в списке части", "Закат с горы" in (b.js("document.querySelector('.passport-zone-list').textContent") or ""))
        b.go(base, "#/place/yalong-bay-beach", cold=True)
        b.js("window.__click('.passport-block button', 'Отметить посещение')")
        passport = json.loads(b.js("localStorage.getItem('stg:passport')") or "{}")
        check("после обновления паспорт работает", "yalong-bay-beach" in passport.get("visits", {}))
        check("после обновления прежняя отметка и заметка на месте", passport.get("visits", {}).get("luhuitou-park", {}).get("note") == "Закат с горы")
        rest = json.loads(b.js("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().filter((k) => k !== 'stg:passport').map((k) => [k, localStorage.getItem(k)])))"))
        before_rest = {k: v for k, v in json.loads(before).items() if k != "stg:passport"}
        check("отметка в паспорте не тронула другие ключи", rest == before_rest)
    finally:
        b.close()
        server.shutdown()
        server.server_close()
        shutil.rmtree(tmp, ignore_errors=True)


# ------------------------------------------------------------------ ux

VISIBLE_ROWS = """(() => { const nav = document.querySelector('.bottom-nav').getBoundingClientRect().top;
    const rows = [...document.querySelectorAll('.places-results .info-card')].map((c) => c.getBoundingClientRect());
    return rows.filter((r) => r.top >= 0 && r.bottom <= nav).length; })()"""
TYPE_SEARCH = "((q) => { const i = document.querySelector('.search-bar__input'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })"
EDITOR_GEOMETRY = """(() => { const nav = document.querySelector('.bottom-nav').getBoundingClientRect().top;
    const t = document.querySelector('#passport-note-text').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.passport-note__buttons button')];
    const hit = btns.map((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === b || b.contains(el); });
    return { nav: Math.round(nav), top: Math.round(t.top), bottoms: btns.map((b) => Math.round(b.getBoundingClientRect().bottom)), hit,
             labels: btns.map((b) => b.textContent), actions: getComputedStyle(document.querySelector('.place-actions')).position }; })()"""


def run_ux(port):
    SECTION[0] = "ux"
    print("\n[ux] каталог, редактор заметки, возврат в контекст, маршрут Amap, паспорт и каталог, справка, адрес проживания")
    categories = CONFIG["categories"]
    beaches = [p for p in PLACES if p["category"] == "beach"]
    excursions = [e for e in load("data/excursions.json") if e["status"] == "verified"]
    info = [i for i in load("data/info.json") if i["status"] == "verified"]
    food = [f for f in load("data/food.json") if f["status"] == "verified" and f.get("addressZh") and f.get("location")]
    visit = {"date": "2026-11-18", "at": "2026-11-18T02:00:00.000Z"}

    # --- A1. Каталог: первые результаты на первом экране, фильтры на месте.
    for width, height, need in ((320, 568, 1), (375, 667, 2), (414, 896, 2)):
        app = App(port, width, height)
        b = app.b
        try:
            app.setup()
            for route, label in (("#/places", "каталог"), ("#/places?near=1", "каталог из сценария «Сейчас» (near=1)")):
                app.go(route, cold=True)
                rows = b.js(VISIBLE_ROWS)
                check(f"{width}×{height} {label}: на первом экране целиком видно строк результата ≥ {need}", rows >= need, rows)
                check(f"{width}px {label}: без переполнения, ошибок и мелких зон нажатия",
                      app.overflow() <= 0 and not app.errors() and not app.small_targets("#view"), app.small_targets("#view"))
            app.go("#/places", cold=True)
            tools = b.js("""(() => { const n = document.querySelector('.nearby__cta'), p = document.querySelector('.picker__cta');
                return n && p ? { sameRow: Math.abs(n.getBoundingClientRect().top - p.getBoundingClientRect().top) < 2,
                    names: [n.getAttribute('aria-label'), p.getAttribute('aria-label')], texts: [n.textContent, p.textContent] } : null; })()""")
            check(f"{width}px «Рядом со мной» и «Подобрать» стоят в одну строку, полные названия — в aria-label",
                  bool(tools) and tools["sameRow"] and tools["names"] == ["Показать места рядом со мной", "Подобрать по времени и интересу"]
                  and all(t.split(" ", 1)[1].lower() in n.lower() for t, n in zip(tools["texts"], tools["names"])), tools)
        finally:
            app.close()

    app = App(port)
    b = app.b
    try:
        app.setup()
        app.go("#/places", cold=True)
        check("каталог: заголовок «Места» остался в разметке, переключатель «Места» / «Еда» — две вкладки",
              app.text(".view-title") == "Места" and b.js("[...document.querySelectorAll('.mode-switch__tab')].map((t) => t.textContent)") == ["Места", "Еда"])
        chips = b.js("[...document.querySelectorAll('.chips .chip')].map((c) => c.textContent)")
        check("каталог: чипы всех категорий и флаговые фильтры на месте",
              all(c["name"] in chips for c in categories) and len(chips) > len(categories) and b.js("!!document.querySelector('.search-bar__input')"), chips)
        check("каталог: «Найдено N» по всем проверенным местам", app.text(".places-count") == f"Найдено {len(PLACES)}", app.text(".places-count"))
        check("каталог: расстояния от центра района названы приблизительными, есть ссылка «Уточнить» в настройки",
              "приблизительно" in (app.text(".places-scope") or "") and b.js("(document.querySelector('.places-meta__action') || {}).getAttribute && document.querySelector('.places-meta__action').getAttribute('href')") == "#/settings")
        b.js("document.querySelector('.chip[data-token=\"beach\"]').click(); true")
        check("каталог: чип «Пляжи» сужает список и пишет фильтр в адрес",
              app.text(".places-count") == f"Найдено {len(beaches)}" and b.js("location.hash") == "#/places?f=beach", [app.text(".places-count"), b.js("location.hash")])
        b.js("document.querySelector('.chip[data-token=\"beach\"]').click(); true")
        target = PLACES[7]
        b.js(f"{TYPE_SEARCH}({json.dumps(target['name']['ru'])})")
        check("каталог: поиск по названию находит место",
              b.js(f"!!document.querySelector('.places-results a[href=\"#/place/{target['id']}\"]')"))
        b.js(f"{TYPE_SEARCH}('zzzqqq-нет-такого')")
        check("каталог: поиск без результатов — понятное пустое состояние с «Очистить поиск»",
              "Ничего не найдено по запросу" in (app.text(".places-results .empty-state") or "") and b.js("!!window.__byText('.places-results button', 'Очистить поиск')"))
        app.click(".places-results button", "Очистить поиск")
        check("каталог: «Очистить поиск» возвращает весь список", app.text(".places-count") == f"Найдено {len(PLACES)}")
        app.click(".picker__cta")
        check("каталог: подборщик раскрывается формой, «Рядом со мной» остаётся доступной",
              b.js("!!document.querySelector('.picker__form') && !!document.querySelector('.nearby__cta')") and app.overflow() <= 0)
        app.click(".picker__cancel")

        app.go("#/places?near=1", cold=True)
        near_count = app.text(".places-count")
        check("near=1: строка результатов говорит о радиусе и предлагает «Показать все»",
              (app.text(".places-scope") or "").startswith("В радиусе") and app.text(".places-meta__action") == "Показать все" and near_count != f"Найдено {len(PLACES)}", [app.text(".places-scope"), near_count])
        h0 = b.js("history.length")
        app.click(".places-meta__action")
        check("«Показать все» снимает радиус без навигации",
              app.text(".places-count") == f"Найдено {len(PLACES)}" and b.js("location.hash") == "#/places" and b.js("history.length") == h0, [app.text(".places-count"), b.js("location.hash")])
        app.setup(trip=dict(TRIP, stay={"source": "spot", "spotId": "yalong-beach-front"}))
        app.go("#/places", cold=True)
        check("точка проживания известна: пояснения про центр района нет", b.js("!document.querySelector('.places-scope') && !document.querySelector('.places-meta__action')"))
        app.setup(trip={"start": "2026-11-13", "end": "2026-11-26", "area": None, "stay": None, "home": None})
        app.go("#/places", cold=True)
        check("район не выбран: приглашение выбрать район ведёт в настройки",
              app.text(".places-meta__action") == "Выберите район, чтобы видеть расстояние" and b.js("document.querySelector('.places-meta__action').getAttribute('href')") == "#/settings")

        # --- A3. Возврат туда, откуда пришли.
        exc = excursions[0]
        app.setup(extra={"stg:myplan": json.dumps({"planId": None, "days": {"2026-11-19": {"excursionIds": [exc["id"]], "origin": "user"}}})})
        app.go("#/", cold=True)
        h0 = b.js("history.length")
        b.js("document.querySelector('.today__link').click(); true")
        b.wait_ready()
        check("экскурсия с «Сейчас»: открылась карточка, выход подписан «← Назад»",
              b.js("location.hash") == f"#/excursion/{exc['id']}" and app.text(".place-detail__back") == "← Назад", [b.js("location.hash"), app.text(".place-detail__back")])
        app.click(".place-detail__back")
        b.wait_ready()
        check("экскурсия с «Сейчас»: «← Назад» возвращает на «Сейчас», история не растёт",
              b.js("location.hash") == "#/" and b.js("history.length") <= h0 + 1, [b.js("location.hash"), h0, b.js("history.length")])
        app.go("#/excursions?f=rain", cold=True)
        b.js("document.querySelector('.info-list a.info-card').click(); true")
        b.wait_ready()
        check("экскурсия из списка: выход подписан «← К экскурсиям»", app.text(".place-detail__back") == "← К экскурсиям")
        app.click(".place-detail__back")
        b.wait_ready()
        check("экскурсия из списка: возврат в список с его фильтром", b.js("location.hash") == "#/excursions?f=rain", b.js("location.hash"))
        app.go(f"#/excursion/{exc['id']}", cold=True)
        h0 = b.js("history.length")
        app.click(".place-detail__back")
        b.wait_ready()
        check("экскурсия по прямой ссылке: выход ведёт к списку без новой записи истории",
              b.js("location.hash") == "#/excursions" and b.js("history.length") == h0, [b.js("location.hash"), h0, b.js("history.length")])

        app.setup()
        app.go("#/", cold=True)
        first = b.js("(document.querySelector('.now-preview a.info-card') || { getAttribute: () => null }).getAttribute('href')")
        if first:
            b.js("document.querySelector('.now-preview a.info-card').click(); true")
            b.wait_ready()
            check("место из «Подходит сейчас»: выход «← Назад»", app.text(".place-detail__back") == "← Назад")
            app.click(".place-detail__back")
            b.wait_ready()
            check("место из «Подходит сейчас»: возврат на «Сейчас»", b.js("location.hash") == "#/", b.js("location.hash"))
        else:
            check("место из «Подходит сейчас»: в 10:00 есть хотя бы одно подходящее место", False, "блок пуст")
        app.go("#/now?f=easy", cold=True)
        b.js("document.querySelector('#view a.info-card').click(); true")
        b.wait_ready()
        app.click(".place-detail__back")
        b.wait_ready()
        check("место из «Что делать сейчас»: возврат на тот же экран с фильтром", b.js("location.hash") == "#/now?f=easy", b.js("location.hash"))
        app.go("#/places", cold=True)
        b.js(f"document.querySelector('a[href=\"#/place/{PLACES[3]['id']}\"]').click(); true")
        b.wait_ready()
        check("место из каталога: выход по-прежнему «← К местам»", app.text(".place-detail__back") == "← К местам")

        app.setup(now="2026,11,13,20,30")
        app.go("#/", cold=True)
        b.js("document.querySelector('.today-arrival a[href=\"#/info/first-evening\"]').click(); true")
        b.wait_ready()
        check("«Первый вечер» с «Сейчас»: выход «← Назад»", app.text(".place-detail__back") == "← Назад" and app.text(".info-detail__back") == "← Назад")
        app.click(".place-detail__back")
        b.wait_ready()
        check("«Первый вечер» с «Сейчас»: возврат на «Сейчас», а не в список справки", b.js("location.hash") == "#/", b.js("location.hash"))
        app.go("#/info", cold=True)
        b.js("document.querySelector('a[href=\"#/info/first-evening\"]').click(); true")
        b.wait_ready()
        check("«Первый вечер» из справки: выход «← К справке»", app.text(".place-detail__back") == "← К справке")
        app.click(".place-detail__back")
        b.wait_ready()
        check("«Первый вечер» из справки: возврат в справку", b.js("location.hash") == "#/info")
        app.go("#/info/first-evening", cold=True)
        app.click(".info-detail__back")
        b.wait_ready()
        check("карточка справки по прямой ссылке: выход ведёт к списку", b.js("location.hash") == "#/info")

        # --- D. «Как добраться»: режим маршрута выбирает пользователь.
        app.setup()
        app.go("#/places", cold=True)
        b.js("(async () => { window.A = await import('./js/logic/amap.js'); return true; })()")
        tricky = "Рынок №1, «第一市场» & Co / тест?"
        urls = b.js(f"""(() => {{ const loc = {{ lat: 18.240184, lng: 109.504561 }}; const name = {json.dumps(tricky)};
            return {{ modes: A.ROUTE_MODES.map((m) => m.id), car: A.buildAmapRouteUrl(loc, name, 'car'), walk: A.buildAmapRouteUrl(loc, name, 'walk'),
                     bad: A.buildAmapRouteUrl(loc, name, 'fly&x=1'), none: A.buildAmapRouteUrl(loc, name) }}; }})()""")

        def parsed(url):
            from urllib.parse import urlsplit, parse_qs
            parts = urlsplit(url)
            return parts.scheme + "://" + parts.netloc + parts.path, parse_qs(parts.query, keep_blank_values=True)

        check("Amap: поддерживаются два режима — на машине и пешком, в этом порядке", urls["modes"] == ["car", "walk"], urls["modes"])
        for mode in ("car", "walk"):
            base, query = parsed(urls[mode])
            check(f"Amap {mode}: документированный адрес, координаты «долгота,широта» и название целиком, mode={mode}, callnative=1",
                  base == "https://uri.amap.com/navigation" and query == {"to": [f"109.504561,18.240184,{tricky}"], "mode": [mode], "callnative": ["1"]}, urls[mode])
        check("Amap: неизвестный или пропущенный режим не попадает в адрес — берётся режим по умолчанию",
              parsed(urls["bad"])[1]["mode"] == ["car"] and parsed(urls["none"])[1]["mode"] == ["car"] and "fly" not in urls["bad"], [urls["bad"], urls["none"]])
        check("Amap: в адресе нет неэкранированных пробелов, иероглифов и «&» из названия",
              all(ord(ch) < 128 and ch != " " for ch in urls["car"]) and urls["car"].count("&") == 2, urls["car"])

        place = PLACES[0]
        app.go(f"#/place/{place['id']}", cold=True)
        before = b.js("""(() => { const t = document.querySelector('.route-toggle'); const p = document.querySelector('.route-choice');
            return { toggle: !!t, tag: t && t.tagName, expanded: t && t.getAttribute('aria-expanded'), hidden: p && p.hidden,
                     visibleLinks: [...document.querySelectorAll('.place-actions a[href*="uri.amap.com"]')].filter((a) => a.getClientRects().length).length,
                     first: document.querySelector('.place-actions .btn').textContent }; })()""")
        check("карточка места: «Как добраться» — кнопка выбора, прямого перехода в пеший маршрут больше нет",
              before == {"toggle": True, "tag": "BUTTON", "expanded": "false", "hidden": True, "visibleLinks": 0, "first": "Показать таксисту"}, before)
        app.click(".route-toggle")
        links = b.js("""[...document.querySelectorAll('.route-choice a')].map((a) => ({ text: a.textContent, href: a.getAttribute('href'), target: a.target, rel: a.rel,
            mode: a.dataset.mode, shown: a.getClientRects().length > 0, h: Math.round(a.getBoundingClientRect().height) }))""")
        # Ожидаемый адрес собран независимо от кода приложения (encodeURIComponent
        # оставляет без изменений только A–Z a–z 0–9 - _ . ! ~ * ' ( )).
        from urllib.parse import quote

        def js_num(x):
            return str(int(x)) if float(x).is_integer() else repr(float(x))

        expected = [f"https://uri.amap.com/navigation?to={js_num(place['location']['lng'])},{js_num(place['location']['lat'])},"
                    f"{quote(place['name']['ru'], safe=chr(45) + '_.!~*' + chr(39) + '()')}&mode={mode}&callnative=1" for mode in ("car", "walk")]
        check("карточка места: выбор режима — «На машине» и «Пешком», обе ссылки ведут в Amap со своим режимом",
              [l["href"] for l in links] == expected and [l["mode"] for l in links] == ["car", "walk"]
              and "машине" in links[0]["text"] and "Пешком" in links[1]["text"], links)
        check("карточка места: ссылки режима внешние (новая вкладка, noopener), видимые и не меньше 44 px",
              all(l["target"] == "_blank" and "noopener" in l["rel"] and l["shown"] and l["h"] >= 44 for l in links), links)
        check("карточка места: подпись честно говорит, что маршрут — в Amap и нужен интернет",
              "Amap" in (app.text(".route-choice__hint") or "") and "интернет" in (app.text(".route-choice__hint") or "")
              and b.js("document.querySelector('.route-toggle').getAttribute('aria-expanded')") == "true")
        for width, height in ((320, 568), (414, 896)):
            b.set_viewport(width, height)
            time.sleep(0.2)
            check(f"{width}px карточка с раскрытым выбором маршрута: без переполнения и мелких зон",
                  app.overflow() <= 0 and not app.small_targets(".place-actions"), app.small_targets(".place-actions"))
        b.set_viewport(375, 667)
        app.click(".route-toggle")
        check("карточка места: повторное нажатие сворачивает выбор", b.js("document.querySelector('.route-choice').hidden") is True)
        if food:
            item = food[0]
            app.go("#/places?mode=food", cold=True)
            toggle = b.js("(() => { const t = document.querySelector('.food-card__actions .route-toggle'); if (!t) return false; t.click(); return true; })()")
            hrefs = b.js("[...document.querySelectorAll('.food-card__actions .route-choice:not([hidden]) a')].map((a) => a.getAttribute('href'))")
            check("карточка еды: тот же выбор режима маршрута",
                  toggle and len(hrefs) == 2 and "mode=car" in hrefs[0] and "mode=walk" in hrefs[1] and app.overflow() <= 0 and not app.errors(), hrefs)

        # --- B. Паспорт: вход, поиск места, отметки в каталоге.
        shop = SHOPPING[0]
        reward = REWARD[0]
        target = REWARD[5]
        app.setup(extra={"stg:passport": json.dumps({"v": 1, "visits": {reward["id"]: visit, shop["id"]: visit}, "seen": {}})})
        app.go("#/places", cold=True)
        marked = b.js("[...document.querySelectorAll('.places-results .info-card')].filter((c) => c.querySelector('.info-card__visited')).map((c) => c.getAttribute('href').split('/').pop()).sort()")
        check("каталог: «✓ Отмечено в паспорте» стоит ровно у отмеченных мест, включая покупки",
              marked == sorted([reward["id"], shop["id"]]) and app.text(".info-card__visited") == "✓ Отмечено в паспорте", marked)
        app.go("#/passport", cold=True)
        stats = app.text(".passport-stat__value")
        check("паспорт: отмеченная покупка наград не даёт — в прогрессе одно место", stats == "1", stats)
        find = b.js("(() => { const a = document.querySelector('.passport-find'); return a ? [a.getAttribute('href'), a.textContent, Math.round(a.getBoundingClientRect().height)] : null; })()")
        check("паспорт: есть переход «Найти место по названию» в поиск каталога", bool(find) and find[0] == "#/places" and "Найти место" in find[1] and find[2] >= 44, find)
        check("паспорт: схема, семь частей побережья и вход в альбом на месте",
              b.js("document.querySelectorAll('.pp-badge').length") == 7 and b.js("document.querySelectorAll('.passport-part').length") == 7 and b.js("!!document.querySelector('.passport-album-link')"))
        app.click(".passport-find")
        b.wait_ready()
        check("из паспорта открылся каталог: есть «← К паспорту», курсор в поле поиска",
              b.js("location.hash") == "#/places" and app.text(".place-detail__back") == "← К паспорту" and b.js("document.activeElement === document.querySelector('.search-bar__input')"),
              [b.js("location.hash"), app.text(".place-detail__back")])
        b.js(f"{TYPE_SEARCH}({json.dumps(target['name']['ru'])})")
        b.js(f"document.querySelector('.places-results a[href=\"#/place/{target['id']}\"]').click(); true")
        b.wait_ready()
        check("поиск из паспорта привёл в карточку нужного места", app.text(".view-title") == target["name"]["ru"], app.text(".view-title"))
        app.click(".passport-block button", "Отметить посещение")
        app.click(".place-detail__back")
        b.wait_ready()
        check("после отметки строка места в каталоге сразу помечена, выход в паспорт остался",
              b.js(f"!!document.querySelector('a[href=\"#/place/{target['id']}\"] .info-card__visited')") and app.text(".place-detail__back") == "← К паспорту")
        app.click(".place-detail__back")
        b.wait_ready()
        check("«← К паспорту» возвращает в паспорт, новая отметка в счётчике, прежние на месте",
              b.js("location.hash") == "#/passport" and app.text(".passport-stat__value") == "2"
              and sorted((app.storage("stg:passport") or {}).get("visits", {})) == sorted([reward["id"], shop["id"], target["id"]]), app.text(".passport-stat__value"))
        app.go(f"#/place/{target['id']}", cold=True)
        app.click(".passport-block button", "Снять отметку")
        app.go("#/places", cold=True)
        check("после снятия отметки признак в каталоге исчезает",
              not b.js(f"!!document.querySelector('a[href=\"#/place/{target['id']}\"] .info-card__visited')"))
        app.setup()
        app.go("#/places", cold=True)
        check("пустой паспорт: в каталоге нет ни одной отметки и нет ошибок", b.js("document.querySelectorAll('.info-card__visited').length") == 0 and not app.errors())
        app.setup(extra={"stg:passport": '{"visits": [повреждено'})
        app.go("#/places", cold=True)
        app.errors()
        check("повреждённый stg:passport: каталог открывается, отметок нет, значение не перезаписано",
              app.text(".places-count") == f"Найдено {len(PLACES)}" and b.js("document.querySelectorAll('.info-card__visited').length") == 0
              and app.raw("stg:passport") == '{"visits": [повреждено')

        # --- C. Справка по группам, адрес проживания, внешние ссылки.
        app.setup()
        app.go("#/info", cold=True)
        shown = b.js("[...document.querySelectorAll('#view a.info-card')].map((a) => a.getAttribute('href'))")
        check(f"справка: все {len(info)} тем на экране, каждая один раз, «Под рукой» — первой",
              shown[0] == "#/handy" and sorted(shown[1:]) == sorted(f"#/info/{i['id']}" for i in info), shown[:3])
        titles = b.js("[...document.querySelectorAll('.info-group__title')].map((h) => h.textContent)")
        jumps = b.js("[...document.querySelectorAll('.handy__jump .chip')].map((c) => c.textContent)")
        check("справка: темы разбиты на несколько групп, быстрые переходы повторяют заголовки групп",
              3 <= len(titles) <= 6 and jumps == titles, [titles, jumps])
        sizes = b.js("[...document.querySelectorAll('.info-group__title')].map((h) => h.nextElementSibling.querySelectorAll('a').length)")
        check("справка: в каждой группе есть темы, ни одна группа не длиннее восьми", all(1 <= n <= 8 for n in sizes) and sum(sizes) == len(info), sizes)
        h0 = b.js("history.length")
        app.click(".handy__jump .chip", titles[-1])
        top = b.js("Math.round([...document.querySelectorAll('.info-group__title')].pop().getBoundingClientRect().top)")
        check("справка: быстрый переход прокручивает к группе, адрес и история не меняются",
              -2 <= top <= 400 and b.js("location.hash") == "#/info" and b.js("history.length") == h0, top)
        check("справка: «О приложении» объясняет, что работает без сети и что помечено стрелкой",
              "без интернета" in (app.text(".about__offline") or "") and "↗" in (app.text(".about__offline") or ""))
        app.go(f"#/info/{info[0]['id']}", cold=True)
        arrow = b.js("""(() => { const a = document.querySelector('.sources__list a[target="_blank"]'); return a ? getComputedStyle(a, '::after').content : null; })()""")
        check("внешняя ссылка-источник помечена стрелкой «↗»", arrow is None or "↗" in arrow, arrow)
        app.go(f"#/place/{PLACES[0]['id']}", cold=True)
        app.click(".route-toggle")
        check("кнопки (в том числе ссылки режима маршрута) стрелкой не помечаются",
              b.js("getComputedStyle(document.querySelector('.route-choice a'), '::after').content") in ("none", "normal"))

        for width, height in ((375, 667), (320, 568)):
            b.set_viewport(width, height)
            app.setup(now="2026,10,20,10,0")
            app.go("#/", cold=True)
            notice = b.js("(() => { const n = document.querySelector('.home-notice'); const a = n && n.querySelector('a'); return n ? [n.textContent, a && a.getAttribute('href'), a && Math.round(a.getBoundingClientRect().height)] : null; })()")
            check(f"{width}px до поездки без адреса: напоминание со ссылкой к полю адреса",
                  bool(notice) and "Адрес проживания" in notice[0] and notice[1] == "#/settings?section=home" and notice[2] >= 44, notice)
            check(f"{width}px до поездки без адреса: чек-лист и остальные блоки на месте, без переполнения и ошибок",
                  b.js("!!document.querySelector('.progress-block') && !!document.querySelector('.home-action')") and app.overflow() <= 0 and not app.errors())
            b.js("document.querySelector('.home-notice a').click(); true")
            b.wait_ready()
            time.sleep(0.3)
            field = b.js("(() => { const f = document.querySelector('#trip-home-address'); const r = f.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight, f.value]; })()")
            check(f"{width}px ссылка открывает настройки сразу на блоке адреса: поле на экране и пустое",
                  b.js("location.hash") == "#/settings?section=home" and 0 <= field[0] and field[1] <= field[2] and field[3] == "", field)
        b.set_viewport(375, 667)
        app.go("#/settings", cold=True)
        time.sleep(0.3)
        check("настройки без параметра открываются с начала экрана", b.js("window.scrollY") == 0)
        b.js(f"(() => {{ const f = document.querySelector('#trip-home-address'); f.value = {json.dumps(HOME['addressZh'])}; return true; }})()")
        app.click("#view button", "Готово")
        b.wait_ready()
        check("адрес сохранён существующей настройкой", ((app.storage("stg:trip") or {}).get("home") or {}).get("addressZh") == HOME["addressZh"], app.storage("stg:trip"))
        app.go("#/", cold=True)
        check("адрес указан: напоминания на «Сейчас» больше нет", b.js("!document.querySelector('.home-notice')"))
        app.go("#/handy", cold=True)
        check("«Под рукой»: адрес показан, «Изменить адрес» ведёт к блоку адреса",
              app.text(".handy-home__address") == HOME["addressZh"] and b.js("document.querySelector('.handy-home .home-link').getAttribute('href')") == "#/settings?section=home")
        app.setup(now="2026,11,12,9,0")
        app.go("#/", cold=True)
        check("за два дня до вылета: напоминание уступает место блоку прилёта, ссылка одна",
              b.js("!document.querySelector('.home-notice')") and b.js("document.querySelectorAll('#view a[href=\"#/settings?section=home\"]').length") == 1)
        app.setup(now="2026,11,19,10,0")
        app.go("#/handy", cold=True)
        check("«Под рукой» без адреса: понятная подсказка и ссылка к блоку адреса, адрес не выдуман",
              "Адрес не указан" in (app.text(".handy-home") or "") and b.js("document.querySelector('.handy-home__action').getAttribute('href')") == "#/settings?section=home"
              and not b.js("!!document.querySelector('.handy-home__address')"))
        app.go("#/handy/taxi", cold=True)
        check("экран адреса для таксиста без адреса: возврат в «Под рукой» без ошибки", b.js("location.hash") == "#/handy" and not app.errors())

        # --- E. Проверка офлайн-копии: правило «готово» и копия данных.
        b.js("(async () => { window.W = await import('./js/pwa.js'); return true; })()")
        table = b.js("""(() => { const s = (o) => W.offlineState(Object.assign({ supported: true, controlled: true, standalone: false, version: 'v1', total: 10, cached: 10 }, o));
            return [s({}), s({ cached: 9 }), s({ cached: 0 }), s({ total: 0, cached: 0 }), s({ controlled: false }), s({ supported: false }), W.offlineState(null), s({ total: 0, cached: 5 })]; })()""")
        check("офлайн-статус «готово» — только при полном кэше под управлением воркера",
              table == ["ready", "partial", "partial", "unknown", "not-ready", "unsupported", "unsupported", "unknown"], table)
        app.setup()
        app.go("#/prepare", cold=True)
        b.js("Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => null }); true")
        app.click(".offline-check__again")
        b.wait_for("document.querySelector('.offline-check').dataset.state !== 'checking'", 5)
        state = b.js("[document.querySelector('.offline-check').dataset.state, document.querySelector('.offline-check__state').textContent]")
        check("«Подготовка»: без управляющего воркера статус — «ещё не готова», слова «сохранено» нет",
              state[0] == "not-ready" and "ещё не готова" in state[1] and "✓" not in state[1], state)
        check("«Подготовка»: блок офлайн-проверки не ломает чек-лист, без переполнения и мелких зон",
              b.js("document.querySelectorAll('.phase').length") > 0 and app.overflow() <= 0 and not app.small_targets(".offline-check"), app.small_targets(".offline-check"))

        app.setup(extra={"stg:passport": json.dumps({"v": 1, "visits": {reward["id"]: dict(visit, note="Заметка для копии")}, "seen": {}}), "stg:saved": json.dumps([reward["id"]])})
        app.go("#/data", cold=True)
        b.js("""(() => { window.__downloads = []; const click = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push(this.download); return; } return click.call(this); }; return true; })()""")
        check("«Мои данные»: до скачивания сообщения о файле нет", b.js("document.querySelector('.backup-download-status').hidden") is True)
        app.click(".backup-actions button", "Скачать файл копии")
        b.wait_for("window.__downloads.length > 0", 5)
        time.sleep(0.2)
        status = b.js("(() => { const s = document.querySelector('.backup-download-status'); return [s.hidden, s.textContent, window.__downloads[0]]; })()")
        check("«Мои данные»: после «Скачать» видно имя файла и где его искать",
              status[0] is False and bool(status[2]) and status[2] in status[1] and "загрузках" in status[1], status)
        text = b.js("""(async () => { const B = await import('./js/logic/backup.js'); const S = (await import('./js/storage.js')).storage; return B.serializeBackup(B.buildBackup(S.readUserData())); })()""")
        b.js("localStorage.removeItem('stg:passport'); localStorage.removeItem('stg:saved'); true")
        app.go("#/data", cold=True)
        b.js(f"document.querySelector('#backup-text').value = {json.dumps(text)}; true")
        app.click(".backup-actions button", "Проверить текст копии")
        check("восстановление: сначала показывается состав копии, данные ещё не тронуты",
              b.js("!!document.querySelector('.backup-preview')") and app.raw("stg:passport") is None)
        app.click(".backup-preview button", "Заменить мои данные")
        b.wait_for("!!document.querySelector('.backup-message')")
        restored = app.storage("stg:passport") or {}
        check("экспорт → импорт возвращает отметку с заметкой и избранное",
              restored.get("visits", {}).get(reward["id"], {}).get("note") == "Заметка для копии" and app.storage("stg:saved") == [reward["id"]], restored)
        check("ошибок в консоли нет", not app.errors(), app.errors())
    finally:
        app.close()

    # --- Нижняя панель на 320 px: подпись активной вкладки не обрезается.
    app = App(port, 320, 568)
    b = app.b
    try:
        app.setup()
        cut = []
        for route in ("#/", "#/places", "#/excursions", "#/prepare", "#/info"):
            app.go(route, cold=True)
            label = b.js("(() => { const l = document.querySelector('.bottom-nav__item.is-active .bottom-nav__label'); return [l.textContent, l.scrollWidth, l.clientWidth]; })()")
            if label[1] > label[2]:
                cut.append(label)
        check("320px нижняя панель: подпись активной вкладки помещается целиком на всех пяти вкладках", not cut, cut)
    finally:
        app.close()

    # --- A2. Редактор заметки: поле и кнопки не под закреплённым блоком.
    note_place = REWARD[0]
    for width, height, label in ((320, 568, ""), (375, 667, ""), (414, 896, ""), (320, 330, " (экран сжат, как при открытой клавиатуре)"), (375, 340, " (экран сжат, как при открытой клавиатуре)")):
        app = App(port, width, height)
        b = app.b
        try:
            app.setup(extra={"stg:passport": json.dumps({"v": 1, "visits": {note_place["id"]: visit}, "seen": {}})})
            app.go(f"#/place/{note_place['id']}", cold=True)
            check(f"{width}×{height} до редактора действия карточки закреплены", b.js("getComputedStyle(document.querySelector('.place-actions')).position") == "sticky")
            app.click(".passport-block button", "Добавить заметку")
            time.sleep(0.3)
            g = b.js(EDITOR_GEOMETRY)
            check(f"{width}×{height}{label}: поле заметки и обе кнопки на экране, над нижней панелью",
                  g["top"] >= 0 and all(bottom <= g["nav"] for bottom in g["bottoms"]) and g["labels"] == ["Сохранить", "Отмена"], g)
            check(f"{width}×{height}{label}: «Сохранить» и «Отмена» ничем не перекрыты (нажатие попадает в кнопку)", all(g["hit"]), g)
            check(f"{width}×{height}{label}: закреплённые действия на время редактирования стоят в потоке, без переполнения",
                  g["actions"] == "static" and app.overflow() <= 0 and not app.small_targets(".passport-block"), g["actions"])
            b.js("(() => { const t = document.querySelector('#passport-note-text'); t.value = 'Пришли к девяти утра'; t.dispatchEvent(new Event('input')); return true; })()")
            app.click(".passport-note button", "Сохранить")
            check(f"{width}×{height}{label}: заметка сохраняется, действия карточки снова закреплены, «Показать таксисту» на месте",
                  (app.storage("stg:passport") or {})["visits"][note_place["id"]].get("note") == "Пришли к девяти утра"
                  and b.js("getComputedStyle(document.querySelector('.place-actions')).position") == "sticky"
                  and b.js("document.querySelector('.place-actions .btn').textContent") == "Показать таксисту")
            app.click(".passport-block button", "Изменить заметку")
            time.sleep(0.2)
            b.js("(() => { const t = document.querySelector('#passport-note-text'); t.value = 'черновик, который отменят'; return true; })()")
            g = b.js(EDITOR_GEOMETRY)
            app.click(".passport-note button", "Отмена")
            check(f"{width}×{height}{label}: «Отмена» доступна и не меняет заметку",
                  all(g["hit"]) and (app.storage("stg:passport") or {})["visits"][note_place["id"]].get("note") == "Пришли к девяти утра"
                  and b.js("getComputedStyle(document.querySelector('.place-actions')).position") == "sticky", g)
            check(f"{width}×{height}{label}: ошибок в консоли нет", not app.errors(), app.errors())
        finally:
            app.close()


# ------------------------------------------------------------------ main

def main():
    sections = sys.argv[1:] or ["static", "unit", "passport", "map", "layout", "regression", "travel", "ux", "offline", "upgrade"]
    port = 8650
    server = None
    if any(s in sections for s in ("unit", "passport", "map", "layout", "regression", "travel", "ux")):
        server = serve(ROOT, port)
    started = time.time()
    try:
        for name in sections:
            if name == "static":
                run_static()
            elif name == "unit":
                run_unit(port)
            elif name == "passport":
                run_passport(port)
            elif name == "map":
                run_map(port)
            elif name == "layout":
                run_layout(port)
            elif name == "regression":
                run_regression(port)
            elif name == "travel":
                run_travel(port)
            elif name == "ux":
                run_ux(port)
            elif name == "offline":
                run_offline(port + 1)
            elif name == "upgrade":
                run_upgrade(port + 2)
            else:
                print(f"неизвестный раздел {name}")
    finally:
        if server:
            server.shutdown()
    failed = [r for r in RESULTS if not r[2]]
    print(f"\nИтого: {len(RESULTS) - len(failed)} из {len(RESULTS)} проверок пройдено за {time.time() - started:.0f} с")
    by_section = {}
    for section, _, ok, _ in RESULTS:
        p, t = by_section.get(section, (0, 0))
        by_section[section] = (p + ok, t + 1)
    for section, (p, t) in by_section.items():
        print(f"  {section}: {p}/{t}")
    if failed:
        print("\nПровалено:")
        for section, name, _, detail in failed:
            print(f"  [{section}] {name} — {detail}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
