"""Generates the pixel-art Nightcade icons (16x16 grid, nearest-neighbour upscaled)."""
import math, sys
from PIL import Image
OUT = sys.argv[1]
def art():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    floor, edge, cream = (34, 48, 39, 255), (74, 69, 64, 255), (220, 201, 169, 255)
    for y in range(16):
        for x in range(16):
            corner = (x in (0, 15) and y in (0, 15))
            if corner: continue
            px[x, y] = edge if x in (0, 15) or y in (0, 15) else floor
    for y in range(1, 15):
        for x in range(1, 15):
            d1 = math.hypot(x - 7.2, y - 8.2); d2 = math.hypot(x - 9.8, y - 6.6)
            if d1 < 5.2 and d2 >= 4.4:
                px[x, y] = (199, 125, 43, 255) if d1 > 4.2 else (232, 160, 74, 255)
    for (x, y) in [(11, 3), (13, 7), (10, 11), (3, 2), (12, 12)]:
        px[x, y] = cream
    return im
a = art()
for s in (16, 32, 48, 128):
    a.resize((s, s), Image.NEAREST).save(f'{OUT}/icon-{s}.png')
