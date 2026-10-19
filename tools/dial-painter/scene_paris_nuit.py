"""Cadran « Paris, 1795 » — Le spiral Breguet (Grisaille, blanc de Limoges sur émail noir).

Notre-Dame au clair de lune, vue de la Seine : la flèche a été déposée, les tours
veillent ; maisons de quai aux fenêtres éclairées, une barque et sa lanterne, le
chemin de lune sur l'eau. Lancer : python3 scene_paris_nuit.py sortie.png [--ref]
"""
import sys
import numpy as np
from scipy import ndimage as ndi
from wm_paint import *
from painter import Scene, paint, lut, enamel
import vedute
from vedute import *
from vedute import _blob_into
from paris import *

REF = '--ref' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')]
out = out[0] if out else 'paris_nuit.png'

rng = Rng(1795)
set_haze(0.62)
sc = Scene(0.55)
HZ = 652
MOON = (150, 250)

# ciel nocturne, halo de lune, nuages éclairés par en dessous
sky(sc, rng, HZ, top=0.46, bot=0.62, noise=0.02)
r = np.sqrt((XX - MOON[0]) ** 2 + (YY - MOON[1]) ** 2)
sc.put((YY < HZ).astype(np.float32), sc.lum() + 0.32 * np.exp(-(r / 150) ** 1.4) + 0.08 * np.exp(-(r / 420) ** 2))
cloud(sc, rng, 520, 300, 420, 70, d=0.2, top=0.82, under=0.5, tiers=2)
cloud(sc, rng, 300, 400, 300, 40, d=0.35, top=0.86, under=0.55)
cloud(sc, rng, 700, 520, 220, 30, d=0.5, top=0.8, under=0.56, tiers=1)
moon = disc(MOON[0], MOON[1], 30, 1.2)
sc.put(moon, 1.0)
sc.light(moon, 0.9)
mare = np.zeros((H, W), np.float32)
for (dx, dy, rx, ry) in ((-8, -6, 9, 7), (6, 4, 7, 6), (-2, 10, 6, 4), (10, -10, 5, 4)):
    _blob_into(mare, MOON[0] + dx, MOON[1] + dy, rx, ry, 1.0)
sc.put(moon * np.clip(mare, 0, 1) * 0.5, 0.86)

# l'île de la Cité : maisons à gauche et à droite, Notre-Dame au centre
G = Group()
quay_row(G, rng, -20, 175, HZ - 18, 60, 90, d=0.55, lit_windows=0.12)
quay_row(G, rng, 628, 840, HZ - 18, 70, 110, d=0.45, lit_windows=0.15)
G.commit(sc)
nd = Group()
notre_dame(nd, rng, 214, HZ - 16, u=3.3, d=0.32, lit=0.9, sh=0.6, roof=0.5)
nd.commit(sc)
qw = Group()
quay_wall(qw, rng, HZ - 18, HZ + 10, v=0.72, d=0.3)
# arbres du quai, sombres
tr = Group()
qw.commit(sc)
tr.commit(sc)

# la Seine : reflets, chemin de lune
rip = water(sc, rng, HZ + 10, 1000, v_far=0.56, v_near=0.36, k=0.5, fade=240, glints=0.0, blur=(2.0, 3.5), ramp=24)
path = np.exp(-((XX - MOON[0]) / np.maximum(18 + 0.08 * (YY - HZ), 1.0)) ** 2) * (YY > HZ + 14) * (1 - smooth(760, 1060, YY))
band = (fbm(rng, 10, 3, aspect=12.0) > 0.52).astype(np.float32)
mp = ndi.gaussian_filter(path * band, (0.6, 1.4))
sc.put(mp * 0.9, 0.95, flow=0.0, fw=0.95, ln=1.6)
sc.light(mp * smooth(0.4, 0.8, mp), 0.7)

# une barque amarrée et sa lanterne
bt = Group()
hull = lay(0.4).poly([(470, 882), (500, 886), (600, 886), (640, 876), (628, 896), (484, 896)])
bt.put(hull.arr(), ramp_y(876, 896, 0.4, 0.22), flow=0.0, fw=0.8)
bt.put(lay(0.3).line([(472, 883), (560, 887), (638, 877)], 1.4).arr(), 0.72)
figure(bt, rng, 586, 886, 52, 'homme', 0.0, coat=0.3)
bt.put(lay(0.1).line([(604, 852), (612, 836)], 1.0).arr(), 0.3)
lant = disc(613, 842, 4.2, 0.8)
bt.put(lant, 1.0)
bt.light(lant, 1.0)
bt.reflect(sc, 896, k=0.6, ripple=rip, amp=6, fade=60)
bt.commit(sc)
glow = np.exp(-(((XX - 613) ** 2 + (YY - 842) ** 2) / (2 * 26 ** 2)))
sc.put(glow * 0.6, sc.lum() + 0.25)
lg = np.exp(-((XX - 613) / 10) ** 2) * (YY > 898) * (1 - smooth(898, 990, YY)) * band
sc.light(ndi.gaussian_filter(lg, (0.6, 1.2)), 0.6)

# premier plan : parapet du quai de Montebello, réverbère à potence, deux promeneurs
fgq = Group()
par = lay(0.4).poly([(-10, 948), (120, 968), (330, 1010), (420, 1152), (-10, 1152)])
fgq.put(par.arr(), ramp_x(0, 400, 0.66, 0.46) - 0.08 * smooth(960, 1150, YY), flow=0.35, fw=0.7, ln=1.2)
top = lay(0.3).poly([(-10, 940), (120, 960), (334, 1002), (330, 1012), (120, 970), (-10, 950)])
fgq.put(top.arr(), 0.88, flow=0.2, fw=0.9, ln=1.5)
fgq.light(top.arr() * (XX < 200), 0.25)
post = lay(0.2)
post.line([(64, 948), (64, 770)], 4.0)
post.line([(64, 778), (98, 778)], 2.0)
post.line([(64, 800), (90, 779)], 1.4)
fgq.put(post.arr(), 0.22)
lan = lay(0.3).poly([(88, 786), (106, 786), (110, 806), (97, 816), (84, 806)])
fgq.put(lan.arr(), 0.98)
fgq.light(lan.arr(), 1.0)
fgq.put(lay(0.3).poly([(85, 786), (109, 786), (97, 776)]).arr(), 0.2)
for x, foot, h, kind, cv in ((190, 978, 70, 'homme', 0.26), (222, 984, 66, 'dame', 0.5)):
    figure(fgq, rng, x, foot, h, kind, 0.0, coat=cv)
fgq.commit(sc)
lg2 = np.exp(-(((XX - 97) ** 2 + (YY - 800) ** 2) / (2 * 46 ** 2)))
sc.put(lg2 * 0.55, sc.lum() + 0.3)
sc.light(np.exp(-(((XX - 97) ** 2 + (YY - 800) ** 2) / (2 * 9 ** 2))), 0.8)

# passage en valeurs de nuit (lumière de lune, ombres profondes)
L = sc.lum()
night = 0.03 + 0.8 * np.clip(L, 0, 1) ** 2.3
sc.img = np.repeat(night[..., None], 3, -1)

GRIS = [(0, '#0B0C10'), (0.3, '#3E3F43'), (0.65, '#A9A6A0'), (1.0, '#F7F4EC')]
if REF:
    save(lut(np.clip(sc.lum(), 0, 1), GRIS), out)
    print('ref ok')
    sys.exit()

C = paint(sc, rng, radii=(14, 7, 3.5, 1.8, 1.0), T=0.03, maxlen=10, start=0.12)
print('touches', paint.last_count)
L = C.mean(-1) * (1 - 0.7 * ndi.gaussian_filter(sc.pen, 0.35))
img = lut(np.clip(L, 0, 1), GRIS)
hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None]
img = img * (1 - hi) + hexrgb('#FFFFFF') * hi
vig = vignette_cushion(4, 46)
gnd = np.broadcast_to(hexrgb('#0B0C10'), (H, W, 3))
img = gnd * (1 - vig[..., None]) + img * vig[..., None]
img = enamel(rng, img, 0.012)
save(img, out)
print('ok')
