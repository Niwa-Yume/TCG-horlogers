"""Cadran « Londres, vers 1755 » — L'échappement à ancre.

Vue de la Tamise depuis une terrasse à balustres : la City sous le dôme de
Saint-Paul et les flèches de Wren, un trois-mâts de la Compagnie des Indes au
mouillage, une gabare, des bachots, des promeneurs. Aquatinte sépia sur émail.
Lancer : python3 scene_londres2.py sortie.png [--ref]
"""
import sys
import numpy as np
from scipy import ndimage as ndi
from wm_paint import *
from painter import Scene, paint, lut, aquatint, enamel
from vedute import *
from vedute import _blob_into

REF = '--ref' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')]
out = out[0] if out else 'londres.png'

rng = Rng(1755)
sc = Scene(0.93)
HZ = 640

# ciel et nuages
sky(sc, rng, HZ, top=0.70, bot=0.95)
cloud(sc, rng, 560, 290, 480, 170, d=0.15, top=1.0, under=0.72, tiers=3)
cloud(sc, rng, 230, 225, 340, 90, d=0.3, top=1.0, under=0.78, tiers=2)
cloud(sc, rng, 720, 470, 280, 54, d=0.55, top=0.99, under=0.85)
cloud(sc, rng, 330, 525, 240, 34, d=0.7, top=0.98, under=0.88, tiers=1)

# collines du nord, très loin
hills(sc, rng, HZ - 18, 30, v=0.82, d=0.9)

# la City : rangées lointaines, clochers, Saint-Paul, rangée de la rive
far = Group()
city_row(far, rng, 0, W, HZ - 26, 14, 26, 12, 22, d=0.8, side=0.1)
far.commit(sc)
spires = Group()
for x, k, s_, th, d_ in [(78, 'needle', 0.8, 40, 0.75), (190, 'tiered', 1.0, 44, 0.6), (262, 'cupola', 0.9, 36, 0.72),
                          (612, 'lantern', 1.0, 46, 0.62), (690, 'needle', 0.75, 34, 0.78), (760, 'tiered', 0.8, 40, 0.72)]:
    spire(spires, x, HZ - 20, s_, k, d_, th)
spires.commit(sc)
sp = Group()
st_paul(sp, rng, 420, HZ - 14, 1.0, d=0.45)
sp.commit(sc)
near = Group()
city_row(near, rng, 0, W, HZ - 2, 20, 38, 22, 42, d=0.55, side=0.14, skip=(250, 560))
city_row(near, rng, 250, 560, HZ - 2, 10, 16, 18, 30, d=0.55, side=0.1)
near.commit(sc)
# quais : pieux et grues
wh = Group()
pil = lay(0.3)
for k in range(70):
    x = rng.u(0, W)
    pil.rect(x, HZ - 6, x + rng.u(1.2, 2.4), HZ + 3)
wh.put(pil.arr(), 0.5)
wh.put(lay(0.3).rect(0, HZ - 3, W, HZ + 2).arr(), air(0.62, 0.5), flow=0.0, fw=0.9, ln=1.6)
for cx in (120, 590):
    cr = lay(0.1)
    cr.line([(cx, HZ - 2), (cx, HZ - 34)], 2.0)
    cr.line([(cx, HZ - 32), (cx + 24, HZ - 40)], 1.6)
    wh.put(cr.arr(), air(0.42, 0.5))
    wh.ink(lay(0.0).line([(cx + 23, HZ - 40), (cx + 23, HZ - 18)], 0.6).arr(), 0.4)
wh.commit(sc)

# le fleuve
rip = water(sc, rng, HZ + 2, 870, v_far=0.86, v_near=0.70, k=0.62, fade=240)

# embarcations, du fond vers l'avant
barge(sc, rng, 690, HZ + 30, 54, 50, d=0.5, rip=rip, flip=-1)
wherry(sc, rng, 300, HZ + 40, 44, d=0.45, rip=rip)
barge(sc, rng, 210, 732, 92, 128, d=0.25, rip=rip, flip=1)
ship(sc, rng, 470, 784, 268, 300, d=0.18, rip=rip)
wherry(sc, rng, 330, 818, 86, d=0.05, rip=rip, people=(('rameur', 0.36), ('homme', 0.6), ('dame', 0.78)))

# terrasse : sol, balustrade, réverbères
G0 = 918
G1 = 864
ground = (YY > (G0 + (G1 - G0) * XX / W) - 4).astype(np.float32)
pv = 0.9 - 0.05 * smooth(900, 1150, YY) + (fbm(rng, 70, 3, aspect=3.0) - 0.5) * 0.04
sc.put(ndi.gaussian_filter(ground, 0.8), pv, flow=-0.06, fw=0.6, ln=1.4)
gy, hb = balustrade(sc, rng, HZ, G0, G1, s0=18.0, pier_every=10, lamps=(1, 3), lamp_h=78)
# ombre portée de la balustrade (soleil à gauche, un peu de face)
sh = (YY > gy(XX)) & (YY < gy(XX) + 22 - 8 * XX / W)
sc.put(ndi.gaussian_filter(sh.astype(np.float32), 3.0) * 0.6, sc.lum() * 0.84)

# promeneurs
people = [
    (238, 976, 90, 'homme', 0.32), (281, 980, 86, 'dame', 0.86),
    (520, 948, 68, 'homme', 0.46), (551, 946, 66, 'dame', 0.76), (636, 934, 42, 'enfant', 0.5),
    (730, 924, 56, 'homme', 0.4), (404, 960, 62, 'dame', 0.66),
]
for x, foot, h, kind, cv in people:
    cast_shadow(sc, x, foot, h, length=1.0, a=0.22)
for x, foot, h, kind, cv in sorted(people, key=lambda p: p[1]):
    G = Group()
    figure(G, rng, x, foot, h, kind, 0.0, coat=cv)
    G.commit(sc)

# arbre en repoussoir à gauche
# ombre portée du feuillage sur les dalles, en taches
dap = np.zeros((H, W), np.float32)
for k in range(26):
    bx, by = rng.u(-40, 300), rng.u(1000, 1150)
    _blob_into(dap, bx, by, rng.u(20, 60), rng.u(5, 12), 1.0)
dap = smooth(0.45, 0.8, dap + (fbm(rng, 14, 3) - 0.5) * 0.4) * (1 - smooth(120, 330, XX))
sc.put(dap * 0.7, sc.lum() * 0.88)
tree(sc, rng, 50, 984, 860, 240, v_lit=0.74, v_dark=0.26,
     env=[(40, 290, 140, 190), (130, 170, 90, 90), (10, 520, 100, 130), (150, 400, 70, 80), (60, 90, 90, 60)], density=1.5)

if REF:
    L = sc.lum()
    img = lut(np.clip(L, 0, 1), [(0, '#2B2119'), (0.5, '#8C7B66'), (0.85, '#D9CEB8'), (1.0, '#F3ECDC')])
    save(img, out)
    print('ref ok')
    sys.exit()

C = paint(sc, rng, radii=(16, 8, 4, 2, 1.1), T=0.032, maxlen=10)
print('touches', paint.last_count)
L = C.mean(-1)
L = L * (1 - 0.82 * ndi.gaussian_filter(sc.pen, 0.35))
L = aquatint(rng, np.clip(L, 0, 1), amount=0.03, scale=0.7)
img = lut(np.clip(L, 0, 1), [(0, '#2B2119'), (0.5, '#8C7B66'), (0.85, '#D9CEB8'), (1.0, '#F1E9D8')])
hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None]
img = img * (1 - hi) + hexrgb('#FCF9F2') * hi
vig = vignette_cushion(4, 46, top_band=None, bottom_band=None)
gnd = np.broadcast_to(hexrgb('#EFE7D6'), (H, W, 3))
img = gnd * (1 - vig[..., None]) + img * vig[..., None]
img = enamel(rng, img, 0.01)
save(img, out)
print('ok')
