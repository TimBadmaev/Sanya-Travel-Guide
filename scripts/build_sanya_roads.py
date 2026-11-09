#!/usr/bin/env python3
"""Small, explicit OSM API bbox extracts near Sanya tourist neighborhoods.
Uses free ODbL raw OSM features (no proprietary map tiles). This is a
build-time one-shot download, not a live API or bulk tile prefetcher.
© OpenStreetMap contributors: https://www.openstreetmap.org/copyright
"""
from urllib.request import Request,urlopen
from pathlib import Path
import json,math,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"data/sanya-roads.json"
REGIONS=[
 ("yalong",(109.612,18.213,109.671,18.252)),
 ("city",(109.472,18.218,109.533,18.273)),
 ("dadonghai",(109.520,18.211,109.580,18.264)),
 ("haitang",(109.704,18.336,109.766,18.393)),
 ("tianya",(109.324,18.265,109.385,18.325)),
]
KINDS={"motorway":0,"trunk":0,"primary":1,"secondary":1,"tertiary":2,
       "unclassified":3,"residential":3,"living_street":3,"pedestrian":4,
       "service":4,"footway":5,"path":5,"steps":5,"cycleway":5}
def simplify(points,tol=0.00007):
    if len(points)<=2:return points
    a,b=points[0],points[-1];dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
    best=0;idx=0
    for i,(x,y) in enumerate(points[1:-1],1):
        u=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/den)) if den else 0
        dis=(x-a[0]-u*dx)**2+(y-a[1]-u*dy)**2
        if dis>best:best=dis;idx=i
    if best<tol*tol:return[a,b]
    return simplify(points[:idx+1],tol)[:-1]+simplify(points[idx:],tol)
def main():
    extracted={};stats={}
    for label,bbox in REGIONS:
        url="https://api.openstreetmap.org/api/0.6/map?bbox="+",".join(map(str,bbox))
        print("GET actual OSM features",label,bbox,flush=True)
        req=Request(url,headers={"User-Agent":"SanyaTravelGuide/34 (GitHub: TimBadmaev/Sanya-Travel-Guide)"})
        with urlopen(req,timeout=95) as response:
            data=response.read(45_000_000)
        print(label,"bytes",len(data),flush=True)
        if len(data)>=45_000_000:raise RuntimeError("Too many elements for API request")
        root=ET.fromstring(data)
        nodes={}
        for n in root.iter("node"):
            if n.get("lon") and n.get("lat"):nodes[n.get("id")]=[round(float(n.get("lon")),6),round(float(n.get("lat")),6)]
        count=0
        for way in root.iter("way"):
            id=way.get("id")
            if id in extracted:continue
            tags={t.get("k"):t.get("v") for t in way.findall("tag")}
            h=tags.get("highway");water=tags.get("waterway") in ("stream","river","canal")
            if h not in KINDS and not water:continue
            p=[nodes[n.get("ref")] for n in way.findall("nd") if n.get("ref") in nodes]
            if len(p)<2:continue
            p=simplify(p,0.00008 if h in ("service","footway","path") else 0.000045)
            kind=6 if water else KINDS[h]
            extracted[id]=[kind,p,(tags.get("name:en") or tags.get("name") or "")[:55]]
            count+=1
        stats[label]=count
        print("PASS",label,count,"ways",flush=True)
    if len(extracted)<300:raise ValueError("Insufficient authentic roads: "+str(len(extracted)))
    obj={"version":1,"source":"© OpenStreetMap contributors (ODbL)",
         "sourceUrl":"https://www.openstreetmap.org/copyright",
         "note":"Limited neighborhood extracts. Not connected routing graph, not navigation.",
         "areas":stats,"roads":list(extracted.values())}
    DEST.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("PASS total",len(extracted),"bytes",DEST.stat().st_size,flush=True)
    if DEST.stat().st_size>2_200_000:raise RuntimeError("Map is too large")

if __name__=="__main__":main()
