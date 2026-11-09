#!/usr/bin/env python3
"""Make a *real* georeferenced, natural-color island atlas, without fake terrain.

Source: Natural Earth I (NE1_LR_LC_SR), satellite-derived land-cover
with shaded relief, public-domain. Only a 2.9x2.57-degree crop is published
to the PWA; no huge global image is bundled or downloaded by clients.
Projection: equirectangular WGS84. Precisely aligned with island-atlas.js.
https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-1/
"""
from pathlib import Path
from urllib.request import Request, urlopen
import tempfile
import zipfile

from PIL import Image, ImageEnhance, ImageStat

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"assets/maps/hainan-relief.webp"
GEO=(108.4,111.3,17.95,20.52)
SOURCES=[
 "https://naturalearth.s3.amazonaws.com/10m_raster/NE1_LR_LC_SR.zip",
 "https://naciscdn.org/naturalearth/10m/raster/NE1_LR_LC_SR.zip",
]

def build():
 with tempfile.TemporaryDirectory() as folder:
  folder=Path(folder)
  archive=folder/"naturalearth.zip"
  failures=[]
  for url in SOURCES:
   try:
    print("GET Natural Earth I actual land cover",url,flush=True)
    req=Request(url,headers={"User-Agent":"SanyaTravelGuide/38 (github.com/TimBadmaev/Sanya-Travel-Guide)"})
    with urlopen(req,timeout=110) as response,archive.open("wb") as out:
     total=0
     while True:
      part=response.read(1024*1024)
      if not part:break
      total+=len(part)
      if total>165_000_000:raise RuntimeError("Unexpectedly large natural-colour raster")
      out.write(part)
    if total<25_000_000:raise RuntimeError("Natural Earth raster archive too small")
    break
   except Exception as exc:
    failures.append(str(exc))
    archive.unlink(missing_ok=True)
  else:raise RuntimeError("Authentic source unavailable: "+"; ".join(failures))
  Image.MAX_IMAGE_PIXELS=225_000_000
  with zipfile.ZipFile(archive) as z:
   names=[n for n in z.namelist() if n.lower().endswith((".tif",".tiff"))]
   if not names:raise RuntimeError("Source archive lacks TIFF")
   path=z.extract(names[0],folder)
  with Image.open(path) as src:
   w,h=src.size
   assert w>=14000 and h>=7500 and abs(w/h-2)<.03,("Unexpected natural-earth projection",w,h)
   west,east,south,north=GEO
   bounds=(round((west+180)/360*w),round((90-north)/180*h),
     round((east+180)/360*w),round((90-south)/180*h))
   crop=src.crop(bounds).convert("RGB")
  if ImageStat.Stat(crop).stddev[0]<3:raise RuntimeError("Raster crop is not genuine terrain")
  # The source already contains actual land cover; no fabricated color
  # elevation ramp. Only modest exposure/contrast, avoiding cartoon greens.
  crop=ImageEnhance.Color(crop).enhance(1.13)
  crop=ImageEnhance.Contrast(crop).enhance(1.09)
  crop=ImageEnhance.Sharpness(crop).enhance(1.13)
  output=crop.resize((960,740),resample=Image.Resampling.LANCZOS)
  DEST.parent.mkdir(parents=True,exist_ok=True)
  output.save(DEST,format="WEBP",quality=85,method=6)
  size=DEST.stat().st_size
  print("Hainan natural colour WGS84",size,"bytes",flush=True)
  if not 12_000<=size<=350_000:raise RuntimeError("Unexpected final atlas size")

if __name__=="__main__":
 build()
