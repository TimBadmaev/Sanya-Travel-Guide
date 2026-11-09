#!/usr/bin/env python3
"""Build a small offline Sanya road/stream atlas from openly licensed OSM ways.
Uses Overpass *raw OSM data*, never OSMF raster/vector tile servers.
© OpenStreetMap contributors, ODbL https://www.openstreetmap.org/copyright
Bounded road data are simplified for navigation context, NOT for routing.
"""
from urllib.parse import urlencode
from urllib.request import urlopen,Request
from pathlib import Path
import json, math, time

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"data/sanya-roads.json"
# Four compact overlapping parts: central Sanya, Yalong Bay, Haitang, Tianya.
REGIONS=[
 ("city",(18.18,109.39,18.34,109.63)),
 ("yalong",(18.19,109.60,18.32,109.75)),
 ("haitang",(18.28,109.69,18.46,109.84)),
 ("tianya",(18.20,109.25,18.36,109.44)),
]
SERVERS=[
 "https://overpass.kumi.systems/api/interpreter",
 "https://overpass.private.coffee/api/interpreter",
 "https://overpass.nchc.org.tw/api/interpreter",
]
KINDS={"motorway":0,"trunk":0,"primary":1,"secondary":1,"tertiary":2,
       "unclassified":3,"residential":3,"living_street":3,"pedestrian":4,
       "service":4,"footway":5,"path":5,"steps":5,"cycleway":5}
def simplify(points,tolerance=0.00009):
    if len(points)<=2:return points
    a,b=points[0],points[-1]
    dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
    best=-1;index=0
    for i,(x,y) in enumerate(points[1:-1],1):
        if den:
            u=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/den))
            dist=(x-a[0]-u*dx)**2+(y-a[1]-u*dy)**2
        else:dist=(x-a[0])**2+(y-a[1])**2
        if dist>best:best=dist;index=i
    if best<=tolerance*tolerance:return[a,b]
    return simplify(points[:index+1],tolerance)[:-1]+simplify(points[index:],tolerance)

def fetch_region(label,bbox):
    bboxtext=",".join(str(p) for p in bbox)
    query="[out:json][timeout:130];(way[highway]("+bboxtext+");way[waterway]("+bboxtext+"););out geom;"
    errors=[]
    for host in SERVERS:
        try:
            print("Fetching raw OSM",label,"from",host,flush=True)
            req=Request(host,data=urlencode({"data":query}).encode(),
                headers={"User-Agent":"SanyaTravelGuide/34 (GitHub Actions; attribution ODbL)","Content-Type":"application/x-www-form-urlencoded"},method="POST")
            with urlopen(req,timeout=170) as response:
                result=json.loads(response.read(45_000_000))
            if "elements" not in result:raise ValueError("No elements")
            print(label,"source ways",len(result["elements"]),flush=True)
            return result["elements"]
        except Exception as e:
            errors.append(str(e));print("Source error:",e,flush=True)
    raise RuntimeError("Unable to obtain real OSM road data for "+label+": "+"; ".join(errors))

def main():
    items={};seen=set();counts={}
    for label,bbox in REGIONS:
        raw=fetch_region(label,bbox);count=0
        for w in raw:
            if w.get("type")!="way" or w.get("id") in seen:continue
            tags=w.get("tags") or {};h=tags.get("highway")
            water=tags.get("waterway") in ("river","canal","stream")
            if h not in KINDS and not water:continue
            geom=w.get("geometry") or []
            pts=[[round(g["lon"],6),round(g["lat"],6)] for g in geom if "lon" in g and "lat" in g]
            if len(pts)<2:continue
            pts=simplify(pts,0.000075 if h in ("footway","service","path") else 0.000045)
            if len(pts)<2:continue
            kind=6 if water else KINDS[h]
            name=(tags.get("name:en") or tags.get("name") or "")[:55]
            items[str(w["id"])]=[kind,pts,name];seen.add(w["id"]);count+=1
        counts[label]=count
    if len(items)<350:raise ValueError(f"Not enough authentic streets: {len(items)}")
    data={"version":1,"source":"© OpenStreetMap contributors (ODbL)",
          "sourceUrl":"https://www.openstreetmap.org/copyright",
          "note":"Simplified geospatial context, not a turn-by-turn router. Offline streets may be incomplete or out of date.",
          "areas":counts,
          "roads":list(items.values())}
    DEST.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("PASS roads",len(items),"bytes",DEST.stat().st_size,"by area",counts,flush=True)
    if DEST.stat().st_size>2_800_000:raise ValueError("Map file exceeds offline size target")

if __name__=="__main__":main()
