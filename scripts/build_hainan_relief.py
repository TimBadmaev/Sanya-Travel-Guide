#!/usr/bin/env python3
"""Build a small, truthful shaded-relief illustration of Hainan for the offline atlas.

Source: Natural Earth 10m grayscale shaded relief (SR_LR), public domain.
The full world TIFF is a temporary build input only. Its WGS84 plate carrée
extent is -180..180, +90..-90; crop matches the geographic view in
js/views/island-atlas.js. The final WebP is decorative terrain only, not DEM.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import tempfile
import zipfile

from PIL import Image, ImageOps, ImageStat

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/"assets/maps/hainan-relief.webp"
GEO=(108.4, 111.3, 17.95, 20.52)
SOURCES=[
  "https://naturalearth.s3.amazonaws.com/10m_raster/SR_LR.zip",
  "https://naciscdn.org/naturalearth/10m/raster/SR_LR.zip",
  "https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/raster/SR_LR.zip",
]

def build():
    with tempfile.TemporaryDirectory() as temp:
        temp=Path(temp)
        archive=temp/"relief.zip"
        failures=[]
        for url in SOURCES:
            try:
                print("Fetching public-domain Natural Earth relief from",url,flush=True)
                with urlopen(Request(url,headers={"User-Agent":"SanyaGuideMapBuild/1.0"}),timeout=80) as response,archive.open("wb") as out:
                    while True:
                        buf=response.read(1024*1024)
                        if not buf:break
                        out.write(buf)
                if archive.stat().st_size < 5000000:
                    raise ValueError("Unexpectedly small raster archive")
                break
            except Exception as exc:
                failures.append(f"{url}: {exc}")
                archive.unlink(missing_ok=True)
        else:
            raise RuntimeError("Cannot download the authorized source: "+"; ".join(failures))
        Image.MAX_IMAGE_PIXELS=220000000
        with zipfile.ZipFile(archive) as z:
            tif=[n for n in z.namelist() if n.lower().endswith((".tif",".tiff"))]
            if not tif:raise RuntimeError("No GeoTIFF in Natural Earth archive")
            path=z.extract(tif[0],temp)
        with Image.open(path) as src:
            w,h=src.size
            print("Source raster",w,"x",h,flush=True)
            assert w>=10000 and h>=5000 and abs(w/h-2)<.02,"Unexpected world projection"
            west,east,south,north=GEO
            bounds=(round((west+180)/360*w),round((90-north)/180*h),
                    round((east+180)/360*w),round((90-south)/180*h))
            cropped=src.crop(bounds).convert("L")
        if ImageStat.Stat(cropped).stddev[0]<2:
            raise RuntimeError("Hainan relief crop has no terrain variation")
        cropped=ImageOps.autocontrast(cropped,cutoff=(1,1))
        colored=ImageOps.colorize(cropped,
            black="#1d4146",mid="#397669",white="#a6bb8b")
        colored=colored.resize((960,740),resample=Image.Resampling.BICUBIC)
        DEST.parent.mkdir(parents=True,exist_ok=True)
        colored.save(DEST,format="WEBP",quality=82,method=6)
        print("Created",DEST,"bytes",DEST.stat().st_size,flush=True)
        assert 5000<=DEST.stat().st_size<250000,"Unexpectedly large or empty WebP"

if __name__=="__main__":
    build()
