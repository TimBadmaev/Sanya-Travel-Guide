#!/usr/bin/env python3
"""Build a light, truthful offline map from OSM *features*, never map tiles.

A handful of small API bounding boxes covers the tourist neighborhoods.
Only complete closed ways become polygons; missing relation geometry is
not guessed. Attribution: © OpenStreetMap contributors, ODbL.
https://www.openstreetmap.org/copyright

This is a build-time operation. The app does not call the OSM API.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import json
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data/sanya-roads.json"
REGIONS = [
    ("yalong", (109.612, 18.213, 109.671, 18.252)),
    ("city", (109.472, 18.218, 109.533, 18.273)),
    ("dadonghai", (109.520, 18.211, 109.580, 18.264)),
    ("haitang", (109.704, 18.336, 109.766, 18.393)),
    ("tianya", (109.324, 18.265, 109.385, 18.325)),
]
KINDS = {
    "motorway": 0, "trunk": 0, "primary": 1, "secondary": 1,
    "tertiary": 2, "unclassified": 3, "residential": 3,
    "living_street": 3, "pedestrian": 4, "service": 4,
    "footway": 5, "path": 5, "steps": 5, "cycleway": 5,
}
# Painter's order (from back to front) is defined in the JS view.
# 0 residential, 1 commercial, 2 woodland, 3 park/grass,
# 4 beach, 5 water, 6 parking.
def land_kind(tags):
    if tags.get("natural") == "water" or tags.get("waterway") == "riverbank":
        return 5
    if tags.get("natural") == "beach":
        return 4
    if tags.get("natural") in ("wood", "wetland") or tags.get("landuse") == "forest":
        return 2
    if tags.get("leisure") in ("park", "garden") or tags.get("landuse") in ("grass", "meadow", "recreation_ground") or tags.get("natural") in ("grassland", "scrub"):
        return 3
    if tags.get("landuse") in ("retail", "commercial", "industrial"):
        return 1
    if tags.get("landuse") == "residential":
        return 0
    if tags.get("amenity") == "parking":
        return 6
    return None

def simplify(points, tol=0.00007):
    if len(points) <= 2:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    den = dx * dx + dy * dy
    best = 0
    idx = 0
    for i, (x, y) in enumerate(points[1:-1], 1):
        u = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / den)) if den else 0
        dis = (x - a[0] - u * dx) ** 2 + (y - a[1] - u * dy) ** 2
        if dis > best:
            best, idx = dis, i
    if best < tol * tol:
        return [a, b]
    return simplify(points[:idx + 1], tol)[:-1] + simplify(points[idx:], tol)

def polygon(points, tol):
    if len(points) < 4 or points[0] != points[-1]:
        return None
    # Do not create polygons from incomplete OSM geometries.
    p = simplify(points[:-1], tol)
    if len(p) < 3:
        return None
    p.append(p[0])
    return p

def main():
    extracted = {}
    land = {}
    buildings = {}
    coast = {}
    stats = {}
    for label, bbox in REGIONS:
        url = "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(map(str, bbox))
        print("GET OSM raw features", label, bbox, flush=True)
        req = Request(url, headers={"User-Agent": "SanyaTravelGuide/35 (github.com/TimBadmaev/Sanya-Travel-Guide)"})
        with urlopen(req, timeout=95) as response:
            data = response.read(45_000_000)
        if len(data) >= 45_000_000:
            raise RuntimeError("Raw OSM response exceeds limit")
        root = ET.fromstring(data)
        nodes = {}
        for n in root.iter("node"):
            if n.get("lon") and n.get("lat"):
                nodes[n.get("id")] = [round(float(n.get("lon")), 6), round(float(n.get("lat")), 6)]
        count = 0
        for way in root.iter("way"):
            way_id = way.get("id")
            tags = {t.get("k"): t.get("v") for t in way.findall("tag")}
            refs = [nd.get("ref") for nd in way.findall("nd")]
            if len(refs) < 2 or any(ref not in nodes for ref in refs):
                continue
            points = [nodes[ref] for ref in refs]
            h = tags.get("highway")
            waterway = tags.get("waterway") in ("stream", "river", "canal")
            name = (tags.get("name:en") or tags.get("name") or "")[:55]
            if (h in KINDS or waterway) and way_id not in extracted:
                kind = 6 if waterway else KINDS[h]
                tol = 0.00008 if h in ("service", "footway", "path") else 0.000045
                extracted[way_id] = [kind, simplify(points, tol), name]
                count += 1
            if tags.get("natural") == "coastline" and way_id not in coast:
                coast[way_id] = simplify(points, 0.000035)
            if way_id not in land:
                kind = land_kind(tags)
                if kind is not None:
                    shape = polygon(points, 0.000035)
                    if shape:
                        land[way_id] = [kind, shape]
            if tags.get("building") not in (None, "no") and way_id not in buildings:
                shape = polygon(points, 0.000018)
                if shape:
                    buildings[way_id] = shape
        stats[label] = count
        print("PASS", label, count, "roads", flush=True)

    if len(extracted) < 1200:
        raise ValueError("Insufficient authentic OSM roads: " + str(len(extracted)))
    # Buildings matter only at street zoom; a fixed upper bound protects
    # first-install data volume and canvas performance on older phones.
    building_shapes = list(buildings.values())[:4500]
    obj = {
        "version": 2,
        "source": "© OpenStreetMap contributors (ODbL)",
        "sourceUrl": "https://www.openstreetmap.org/copyright",
        "note": "Limited area extracts: incomplete polygons omitted. Not turn-by-turn navigation.",
        "areas": stats,
        "bounds": {key: list(bbox) for key, bbox in REGIONS},
        "roads": list(extracted.values()),
        "land": list(land.values()),
        "buildings": building_shapes,
        "coast": list(coast.values()),
    }
    def encode():
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    result = encode()
    while len(result.encode("utf-8")) > 2_500_000 and obj["buildings"]:
        obj["buildings"] = obj["buildings"][:len(obj["buildings"]) * 3 // 4]
        result = encode()
    if len(result.encode("utf-8")) > 3_000_000:
        raise RuntimeError("Offline vector map exceeded 3 MB")
    if not obj["land"] or not obj["buildings"]:
        raise RuntimeError("OSM polygons or buildings missing; check source, do not fake layers")
    DEST.write_text(result, encoding="utf-8")
    print("PASS", len(extracted), "roads,", len(obj["land"]), "areas,",
          len(obj["buildings"]), "buildings,", len(obj["coast"]), "coastlines,",
          DEST.stat().st_size, "bytes", flush=True)

if __name__ == "__main__":
    main()
