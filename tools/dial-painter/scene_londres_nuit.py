"""Cadran « Londres, 1762 » — Le quantième perpétuel (Cloisonné).

Nuit sur Fleet Street, où Thomas Mudge tient boutique : la flèche en pièce
montée de St Bride, les toits et leurs souches, le dôme de Saint-Paul au loin,
une pleine lune à visage — celle des phases de lune — et des étoiles d'or.
Émaux cloisonnés : chaque aplat est cerné d'un fil d'or. Lancer :
python3 scene_londres_nuit.py sortie.png
"""
import sys, math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import *
from painter import Scene, cloisonne, enamel
from vedute import lay, disc, _blob_into

out = sys.argv[1] if len(sys.argv) > 1 else 'londres_nuit.png'
rng = Rng(1762)

P = {
    'nuit0': '#0A1433', 'nuit1': '#112459', 'nuit2': '#1A3577', 'nuit3': '#28508F', 'halo': '#3C6AAA',
    'lune': '#F2E4B6', 'lune2': '#E1C98C', 'joue': '#E7B49A',
    'nuage': '#8EA6CF', 'nuage2': '#D9E3EF',
    'pierre': '#3A5486', 'pierre2': '#22355F',
    'toit': '#0B1027', 'mur0': '#141E3D', 'mur1': '#1B2850', 'mur2': '#101833',
    'feu': '#F2C14E', 'vitre': '#2C3C69', 'fumee': '#6A82B3',
    'eau0': '#0D2250', 'eau1': '#173672', 'reflet': '#E9D7A2',
}
sc = Scene(P['nuit2'])
gold = np.zeros((H, W), np.float32)
wires = np.zeros((H, W), np.float32)


def put(m, key):
    sc.put(np.clip(m, 0, 1), P[key])


# ciel en bandes ondulées
bands = [(0, 'nuit0'), (250, 'nuit1'), (470, 'nuit2'), (640, 'nuit3')]
for y0, key in bands:
    edge = y0 + 18 * np.sin(XX / 130.0 + y0 * 0.01) + 8 * np.sin(XX / 47.0 + y0)
    put((YY >= edge).astype(np.float32), key)

# lune à visage et son halo
MX, MY, MR = 560, 340, 112
put(disc(MX, MY, MR + 26, 1.0), 'halo')
put(disc(MX, MY, MR, 1.0), 'lune2')
put(disc(MX - 6, MY - 6, MR - 12, 1.0), 'lune')
for sx in (-1, 1):
    put(disc(MX + sx * 44, MY + 26, 15, 1.0), 'lune2')
face = lay(0.0)
for sx in (-1, 1):
    ex = MX + sx * 38
    face.line([(ex - 15, MY - 12), (ex - 6, MY - 7), (ex + 6, MY - 7), (ex + 15, MY - 12)], 1.4)   # paupière close
    for j in range(4):
        lx = ex - 9 + j * 6
        face.line([(lx, MY - 7.5), (lx - 1, MY - 3)], 0.9)                                         # cils
    face.line([(ex - 19, MY - 30), (ex - 4, MY - 37), (ex + 16, MY - 31)], 1.3)                    # sourcil
face.line([(MX + 2, MY - 14), (MX - 6, MY + 18), (MX + 8, MY + 22)], 1.4)            # nez
face.line([(MX - 30, MY + 44), (MX, MY + 58), (MX + 30, MY + 44)], 1.5)              # bouche
face.line([(MX - 12, MY + 66), (MX + 12, MY + 66)], 1.0)
wires = np.maximum(wires, face.arr())

# nuages stylisés : dessus festonné, base plate, volutes de fil
for (cx, cy, w, h) in ((392, 486, 250, 54), (700, 566, 190, 40)):
    m = np.zeros((H, W), np.float32)
    n = 5
    for k in range(n):
        t = k / (n - 1) * 2 - 1
        r = h * (0.62 - 0.22 * t * t)
        m = np.maximum(m, disc(cx + t * w * 0.42, cy - r * 0.7, r, 1.0) * (YY < cy))
    put(m, 'nuage')
    rim = m * (1 - ndi.shift(m, (9, 7), order=1))
    put(smooth(0.4, 0.6, rim), 'nuage2')
    vol = lay(0.0)
    for k in range(n - 1):
        t = (k + 0.5) / (n - 1) * 2 - 1
        x0, y0 = cx + t * w * 0.42, cy - h * 0.18
        pts = [(x0 + 9 * math.cos(a) * (1 - a / 11), y0 + 9 * math.sin(a) * (1 - a / 11)) for a in np.linspace(0, 9.5, 28)]
        vol.line(pts, 1.1)
    wires = np.maximum(wires, vol.arr())

# étoiles d'or (paillons), hors du nom en tête et de la lune
for k in range(46):
    x, y = rng.u(30, 790), rng.u(30, 620)
    if 190 < x < 630 and y < 175:
        continue
    if math.hypot(x - MX, y - MY) < MR + 40:
        continue
    s_ = rng.u(3, 8)
    pts = []
    n = 4 if rng.u() < 0.6 else 5
    for i in range(n * 2):
        a = i * math.pi / n - math.pi / 2
        r = s_ if i % 2 == 0 else s_ * 0.38
        pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    gold = np.maximum(gold, lay(0.0).poly(pts).arr())

# Saint-Paul au loin
G0 = 800
put(lay(0.3).rect(640, 700, 790, G0).arr(), 'mur2')
put(lay(0.3).rect(678, 650, 752, 702).arr(), 'pierre2')
dome = disc(715, 652, 38, 1.0) * (YY < 652)
put(dome, 'pierre2')
put(lay(0.2).rect(709, 586, 721, 616).arr(), 'pierre2')
cr = lay(0.0)
cr.line([(715, 586), (715, 566)], 2.0)
cr.line([(709, 574), (721, 574)], 2.0)
gold = np.maximum(gold, cr.arr())
gold = np.maximum(gold, disc(715, 590, 4, 0.8))

# St Bride, la pièce montée de Wren
bx = 236
put(lay(0.3).rect(bx - 30, 600, bx + 30, G0).arr(), 'pierre')
put(lay(0.3).rect(bx + 2, 600, bx + 30, G0).arr(), 'pierre2')
y = 600
wdt = 26
for k in range(5):
    hh = 34 - k * 4
    put(lay(0.3).rect(bx - wdt, y - hh, bx + wdt, y).arr(), 'pierre')
    put(lay(0.3).rect(bx + 2, y - hh, bx + wdt, y).arr(), 'pierre2')
    put(lay(0.3).poly([(bx - wdt * 0.5, y - 4), (bx - wdt * 0.5, y - hh + 8), (bx - wdt * 0.3, y - hh + 4), (bx - wdt * 0.1, y - hh + 8), (bx - wdt * 0.1, y - 4)]).arr(), 'nuit0')
    y -= hh
    wdt *= 0.8
put(lay(0.3).poly([(bx - wdt, y), (bx + wdt, y), (bx, y - 64)]).arr(), 'pierre')
put(lay(0.3).poly([(bx + 1, y), (bx + wdt, y), (bx + 1, y - 64)]).arr(), 'pierre2')
gold = np.maximum(gold, lay(0.0).line([(bx, y - 64), (bx, y - 84)], 2.0).arr())
gold = np.maximum(gold, disc(bx, y - 86, 4, 0.8))

# toits de Fleet Street : pignons, souches, fenêtres éclairées
x = -10
k = 0
while x < 830:
    w = rng.u(52, 84)
    if bx - 40 < x + w and x < bx + 40:
        x = bx + 40
        continue
    top = rng.u(660, 735)
    gable = rng.u() < 0.55
    key = ('mur0', 'mur1', 'mur2')[k % 3]
    if gable:
        put(lay(0.3).poly([(x, G0 + 40), (x, top), (x + w / 2, top - w * 0.45), (x + w, top), (x + w, G0 + 40)]).arr(), key)
        put(lay(0.3).poly([(x + w / 2, top - w * 0.45), (x + w, top), (x + w, top + 8), (x + w / 2, top - w * 0.45 + 8)]).arr(), 'toit')
    else:
        put(lay(0.3).rect(x, top, x + w, G0 + 40).arr(), key)
        put(lay(0.3).poly([(x - 2, top), (x + w + 2, top), (x + w - 10, top - 22), (x + 10, top - 22)]).arr(), 'toit')
    for c in range(rng.i(1, 3)):
        cx = x + rng.u(8, w - 16)
        ct = top - (w * 0.3 if gable else 22) - rng.u(8, 20)
        put(lay(0.3).rect(cx, ct, cx + 12, top - 4).arr(), 'mur1')
        put(lay(0.2).rect(cx + 2, ct - 7, cx + 5, ct).arr(), 'mur1')
        put(lay(0.2).rect(cx + 7, ct - 6, cx + 10, ct).arr(), 'mur1')

    for i in range(3):
        for j in range(max(1, int(w / 22))):
            wx = x + 10 + j * 22
            wy = top + 18 + i * 34
            if wy > G0 + 10:
                continue
            put(lay(0.2).rect(wx, wy, wx + 10, wy + 16).arr(), 'feu' if rng.u() < 0.35 else 'vitre')
    x += w
    k += 1

# la Tamise et le reflet de lune
water_edge = G0 + 40
for y0, key in ((water_edge, 'eau1'), (water_edge + 90, 'eau0'), (water_edge + 200, 'eau1'), (water_edge + 270, 'eau0')):
    edge = y0 + 6 * np.sin(XX / 60.0 + y0) + 3 * np.sin(XX / 17.0)
    put((YY >= edge).astype(np.float32), key)
for i in range(9):
    y = water_edge + 18 + i * 30 + rng.u(-4, 4)
    half = 58 - i * 4.5 + rng.u(-6, 6)
    x0 = MX - half + rng.u(-10, 10)
    L_ = half * 2
    put(lay(0.3).poly([(x0, y + 2), (x0 + L_ * 0.3, y - 3), (x0 + L_ * 0.75, y - 2.5), (x0 + L_, y + 1.5), (x0 + L_ * 0.7, y + 5), (x0 + L_ * 0.2, y + 5)]).arr(), 'reflet')
rw = lay(0.0)
for i in range(10):
    y = water_edge + 30 + i * 26
    for j in range(5):
        x0 = rng.u(20, 760)
        if abs(x0 + 40 - MX) < 90:
            continue
        rw.line([(x0 + t * 80, y + 4 * math.sin(t * 6.28 * 1.5)) for t in np.linspace(0, 1, 16)], 1.0)
wires = np.maximum(wires, rw.arr())
# bachot et sa lanterne
put(lay(0.3).poly([(150, 930), (176, 936), (262, 936), (292, 926), (276, 948), (164, 948)]).arr(), 'toit')
put(lay(0.2).rect(214, 892, 222, 932).arr(), 'mur1')
put(disc(218, 884, 9, 1.0), 'mur1')
put(lay(0.2).poly([(204, 870), (232, 870), (218, 860)]).arr(), 'toit')
put(lay(0.0).line([(232, 902), (252, 886)], 1.6).arr(), 'toit')
gold = np.maximum(gold, disc(256, 884, 5, 0.8))

img, lab = cloisonne(rng, sc.img, list(P.values()), gold_mask=gold, extra_wires=wires, wire=1.8)
vig = vignette_cushion(4, 46)
gnd = np.broadcast_to(hexrgb('#0A1433'), (H, W, 3))
img = gnd * (1 - vig[..., None]) + img * vig[..., None]
img = enamel(rng, img, 0.006)
save(img, out)
print('ok')
