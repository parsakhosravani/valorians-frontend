import json, math, sys
from PIL import Image, ImageDraw
N=400; SS=4  # supersample for clean coasts
LON0, LAT0 = float(sys.argv[1]), float(sys.argv[2])   # what the map's centre tile shows
TPD = 400/32.0              # tiles per degree of latitude
KX = TPD*math.cos(math.radians(60))   # tiles per degree of longitude
def to_px(lon, lat):
    x = (lon-LON0)*KX + N/2
    y = (LAT0-lat)*TPD + N/2
    return (x*SS, y*SS)
def draw(path, img, val):
    d=ImageDraw.Draw(img)
    for f in json.load(open(path))['features']:
        g=f['geometry']; polys = g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
        for poly in polys:
            ring=poly[0]
            xs=[p[0] for p in ring]; ys=[p[1] for p in ring]
            if max(xs) < LON0-40 or min(xs) > LON0+40 or max(ys) < LAT0-22 or min(ys) > LAT0+22: continue
            d.polygon([to_px(*p) for p in ring], fill=val)
            for hole in poly[1:]: d.polygon([to_px(*p) for p in hole], fill=0 if val==255 else 0)
land=Image.new('L',(N*SS,N*SS),0); draw('ne_10m_land.geojson',land,255); draw('ne_10m_minor_islands.geojson',land,255)
lakes=Image.new('L',(N*SS,N*SS),0); draw('ne_10m_lakes.geojson',lakes,255)
land=land.resize((N,N),Image.BOX); lakes=lakes.resize((N,N),Image.BOX)
import numpy as np
L=np.array(land)>127; K=(np.array(lakes)>140)&L
grid=np.where(~L,0,np.where(K,2,1)).astype(np.uint8)
np.save('grid.npy',grid)
print('sea share',(grid==0).mean(),'lake share',(grid==2).mean())
c=grid[200,200]; print('centre',c)
near=grid[185:215,185:215]; print('near sea',(near==0).sum(),'near lake',(near==2).sum())
img=np.stack([np.where(grid==0,40,np.where(grid==2,90,200)),np.where(grid==0,80,np.where(grid==2,140,190)),np.where(grid==0,140,np.where(grid==2,200,140))],-1).astype(np.uint8)
im=Image.fromarray(img); d=ImageDraw.Draw(im); d.rectangle((185,185,215,215),outline=(255,0,0)); im.save('preview.png')
