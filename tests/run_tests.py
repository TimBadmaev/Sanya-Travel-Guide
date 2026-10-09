# -*- coding: utf-8 -*-
"""Проверки Sanya Travel Guide: статические, логика в браузере, сценарии,
регрессия существующих экранов, офлайн и обновление Service Worker.

Запуск из корня проекта:  python3 -u tests/run_tests.py [раздел …]
Разделы: static unit passport regression offline upgrade (по умолчанию — все).
Нужен Google Chrome (путь — переменная CHROME). Node и сторонние пакеты не
нужны. В приложение и в публикацию каталог tests/ не входит.
"""

import json
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
    for f in ("js/logic/passport.js", "js/views/passport.js", "data/passport.json"):
        check(f"новый файл паспорта {f} в PRECACHE", f in precache)

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
            [...root.querySelectorAll('a, button, textarea, input')]).filter((el) => el.offsetParent !== null)
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
        app.click(".passport-note button", "Сохранить заметку")
        note = app.storage("stg:passport")["visits"][place].get("note", "")
        check("заметка сохранена и обрезана до 200 символов", len(note) == 200 and note.startswith("Вода тёплая."), len(note))
        check("заметка видна в блоке", (app.text(".passport-block__note") or "").startswith("Заметка: «Вода тёплая."))
        check("статус «Заметка сохранена.»", app.text(".passport-block__status") == "Заметка сохранена.")
        app.click(".passport-block button", "Изменить заметку")
        b.js("(() => { const t = document.querySelector('#passport-note-text'); t.value = 'Вода тёплая, закат в 17:40'; return true; })()")
        app.click(".passport-note button", "Сохранить заметку")
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
        check("«Первый штамп» получен", "Первый штамп" in earned, earned)
        check("наклеек показано 12 (11 + необязательная)", b.js("document.querySelectorAll('.passport-sticker').length") == 12)
        check("необязательная наклейка помечена", b.js("[...document.querySelectorAll('.passport-sticker')].some((li) => li.textContent.includes('Остров на горизонте') && li.textContent.includes('Необязательная'))"))
        hint_ids = b.js("[...document.querySelectorAll('.passport-sticker__hint')].map((a) => a.getAttribute('href').replace('#/place/', ''))")
        shop_ids = {p["id"] for p in SHOPPING}
        check("в подсказках нет покупок", hint_ids and not (set(hint_ids) & shop_ids), hint_ids)
        check("в подсказках нет уже отмеченных мест", not ({"yalong-bay-beach", "luhuitou-park"} & set(hint_ids)))
        check("подсказки — только у двух наклеек, ближайших к получению",
              b.js("[...document.querySelectorAll('.passport-sticker')].filter((li) => li.querySelector('.passport-sticker__hints')).length") == 2)
        parts = b.js("[...document.querySelectorAll('.passport-part')].map((li) => li.textContent)")
        check("части побережья: 7 строк, Ялонг Бэй — 1 из 6", len(parts) == 7 and "Ялонг Бэй1 из 6" in parts, parts)
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
        check("на Главной есть вход в паспорт", b.js("!!document.querySelector('a.home-link[href=\"#/passport\"]')"))
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
        check("appVersion копии — v16 (SW активен)", exported.get("appVersion") == "v16", exported.get("appVersion"))
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
        "#/passport",
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

        # Главная во всех состояниях: вход в паспорт ниже основного сценария.
        for label, now, trip, after_sel in (
            ("до поездки", "2026-11-01,10,0", TRIP, ".home-action"),
            ("в поездке", "2026-11-19,10,0", TRIP, ".home-scenarios"),
            ("после поездки", "2026-12-05,10,0", TRIP, ".home-scenarios"),
            ("без дат", "2026-11-19,10,0", {"start": None, "end": None, "area": None, "stay": None, "home": None}, ".home-scenarios"),
        ):
            now = now.replace("-", ",")
            app.setup(now=now, trip=trip)
            app.go("#/", cold=True)
            pos = b.js(f"""(() => {{ const link = document.querySelector('a[href="#/passport"]'); const main = document.querySelector({json.dumps(after_sel)});
                if (!link || !main) return null; return !!(main.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING); }})()""")
            check(f"Главная {label}: вход в паспорт есть и стоит ниже основного сценария", pos is True, pos)
            check(f"Главная {label}: нет переполнения и ошибок", app.overflow() <= 0 and not app.errors())
    finally:
        app.close()


# ------------------------------------------------------------------ offline

def run_offline(port):
    SECTION[0] = "offline"
    print("\n[offline] Service Worker v16, паспорт без сети")
    server = serve(ROOT, port)
    app = App(port)
    b = app.b
    try:
        app.setup()
        app.go("#/places", cold=True)
        ready = b.wait_for("navigator.serviceWorker && navigator.serviceWorker.controller !== null", 20)
        check("Service Worker взял страницу под контроль", ready)
        cached = b.js("""(async () => { const keys = await caches.keys(); const c = await caches.open('sanya-guide-v16');
            const urls = (await c.keys()).map((r) => new URL(r.url).pathname.replace(/^\\//, ''));
            return { keys, urls }; })()""")
        check("кэш называется sanya-guide-v16", "sanya-guide-v16" in cached["keys"], cached["keys"])
        for f in ("js/logic/passport.js", "js/views/passport.js", "data/passport.json"):
            check(f"в кэше есть {f}", f in cached["urls"])
        server.shutdown()
        server.server_close()
        time.sleep(0.3)
        app.go("#/passport", cold=True)
        check("без сети #/passport открывается", app.text(".view-title") == "Паспорт исследователя")
        app.go("#/place/yalong-bay-beach", cold=True)
        app.click(".passport-block button", "Отметить посещение")
        check("без сети отметка ставится и сохраняется", "yalong-bay-beach" in (app.storage("stg:passport") or {}).get("visits", {}))
        check("без сети сообщение о наклейке (контент паспорта из кэша)", "Первый штамп" in (app.text(".passport-block__status") or ""))
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
        }
        b.js(f"localStorage.clear(); sessionStorage.setItem('__fakeNow', '2026,11,19,10,0'); Object.entries({json.dumps(user)}).forEach(([k, v]) => localStorage.setItem(k, v)); true")
        b.navigate(base + "index.html#/places")
        check(f"старая версия ({head_version}) взяла страницу под контроль", b.wait_for("navigator.serviceWorker.controller !== null", 20))

        # Копия новой версии с паспортом в старом приложении: раздел пропускается.
        new_copy = {"app": "sanya-travel-guide", "kind": "user-data-backup", "schemaVersion": 1, "exportedAt": "2026-11-19T10:00:00.000Z",
                    "appVersion": "v16", "data": {"stg:saved": ["luhuitou-park", "egret-park"], "stg:passport": {"v": 1, "visits": {"egret-park": {"date": "2026-11-19"}}, "seen": {}}}}
        b.go(base, "#/data", cold=True)
        b.js(f"document.querySelector('#backup-text').value = {json.dumps(json.dumps(new_copy))}; true")
        b.js("window.__click('.backup-actions button', 'Проверить текст копии')")
        preview = b.js("document.querySelector('.backup-preview').textContent")
        check(f"{head_version}: копия с паспортом — «неизвестных разделов пропущено: 1»", "неизвестных разделов пропущено: 1" in preview, preview)
        b.js("window.__click('.backup-preview button', 'Заменить мои данные')")
        b.wait_for("!!document.querySelector('.backup-message')")
        check(f"{head_version}: известные разделы импортированы", json.loads(b.js("localStorage.getItem('stg:saved')")) == ["luhuitou-park", "egret-park"])
        b.js("localStorage.removeItem('stg:import:backup'); localStorage.setItem('stg:saved', JSON.stringify(['luhuitou-park'])); true")

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
        check(f"после «Обновить» работает v16 (было {head_version})", version == "v16", version)
        after = b.js("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])))")
        check("обновление не изменило localStorage", after == before)
        b.go(base, "#/place/yalong-bay-beach", cold=True)
        b.js("window.__click('.passport-block button', 'Отметить посещение')")
        passport = json.loads(b.js("localStorage.getItem('stg:passport')") or "{}")
        check("после обновления паспорт работает", "yalong-bay-beach" in passport.get("visits", {}))
        rest = json.loads(b.js("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().filter((k) => k !== 'stg:passport').map((k) => [k, localStorage.getItem(k)])))"))
        check("отметка в паспорте не тронула другие ключи", rest == json.loads(before))
    finally:
        b.close()
        server.shutdown()
        server.server_close()
        shutil.rmtree(tmp, ignore_errors=True)


# ------------------------------------------------------------------ main

def main():
    sections = sys.argv[1:] or ["static", "unit", "passport", "layout", "regression", "offline", "upgrade"]
    port = 8650
    server = None
    if any(s in sections for s in ("unit", "passport", "layout", "regression")):
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
            elif name == "layout":
                run_layout(port)
            elif name == "regression":
                run_regression(port)
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
