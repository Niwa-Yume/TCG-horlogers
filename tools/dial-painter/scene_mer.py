"""Cadran « En mer, 1761 » — Le chronomètre de marine (Marqueterie).

Le HMS Deptford fait voile vers la Jamaïque avec la H4 de Harrison à bord :
soleil bas en éventail de placage, houle, terre lointaine, un second navire du
convoi, des goélands. Rendu en marqueterie de huit essences, ombrage au sable.
Lancer : python3 scene_mer.py sortie.png [--ref]
"""
import sys
import numpy as np
from scipy import ndimage as ndi
from wm_paint import *
from painter import Scene, marquetry, lut, enamel
from vedute import *
from marine import *

REF = '--ref' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')]
out = out[0] if out else 'mer.png'

rng = Rng(1761)
sc = Scene(0.9)
HZ = 742

sky(sc, rng, HZ, top=0.62, bot=0.9, noise=0.0)
SUN = (676, HZ - 58)
sunburst(sc, rng, SUN[0], SUN[1], HZ, n=36, amp=0.0, r_sun=36, v_sun=0.99)
cloud(sc, rng, 610, 270, 400, 130, d=0.1, top=0.98, under=0.64, tiers=3)
cloud(sc, rng, 150, 210, 300, 70, d=0.25, top=0.97, under=0.7, tiers=2)
cloud(sc, rng, 540, 560, 240, 40, d=0.5, top=0.96, under=0.76)
# terre lointaine : les Blue Mountains
hills(sc, rng, HZ + 1, 40, v=0.66, d=0.55, x0=0, x1=330)
h = sea(sc, rng, HZ, v_far=0.84, v_near=0.5, amp=0.9, sun=(676, HZ - 58))
# un second vaisseau du convoi, au loin
ship_under_sail(sc, rng, 120, 905, 390, 500, d=0.0, heel=-0.05)
for x, y, s_ in ((610, 470, 1.4), (660, 430, 1.0), (560, 520, 0.8), (700, 505, 0.7)):
    gull(sc, x, y, s_)
# vagues de premier plan devant la coque
crest_y = 912 + 7 * np.sin(XX / 38.0) + 4 * np.sin(XX / 11.0 + 1)
fg = ((YY > crest_y) & (YY < crest_y + 26)).astype(np.float32) * smooth(80, 140, XX) * (1 - smooth(560, 640, XX))
sc.put(ndi.gaussian_filter(fg, 1.2), 0.5 + 0.16 * smooth(crest_y + 18, crest_y, YY), flow=0.0, fw=0.9)
sc.light(ndi.gaussian_filter(((YY > crest_y) & (YY < crest_y + 3)).astype(np.float32), 0.8) * fg, 0.6)

if REF:
    img = lut(np.clip(sc.lum(), 0, 1), [(0, '#2B2119'), (0.5, '#8C7B66'), (1.0, '#F3ECDC')])
    save(img, out)
    print('ref ok')
    sys.exit()

# rayons du soleil : pointes de placage, fil rayonnant, une coupe entre chaque
ang = np.arctan2(YY - SUN[1], XX - SUN[0])
r = np.sqrt((XX - SUN[0]) ** 2 + (YY - SUN[1]) ** 2)
NR = 36
ph = (ang + np.pi) / (2 * np.pi) * NR
ray_zone = (YY < HZ) & (r > 40) & (sc.lum() > 0.0)
sky_only = ray_zone & (np.abs(sc.img[..., 0] - sc.img[..., 1]) < 1) & (sc.fw > 0.5) & (sc.lenm > 1.5)
wedge_cut = (np.abs(ph - np.round(ph)) * 2 * np.pi / NR * r < 0.8) & sky_only & (r < 560)
L = sc.lum().copy()
alt = (np.floor(ph) % 2) * 2 - 1
L = np.where(sky_only & (r < 560), L + alt * 0.06 * (1 - smooth(380, 560, r)), L)
wedge = np.where(sky_only & (r < 560), np.floor(ph).astype(np.int32) + 1, 0)
calm = ndi.gaussian_filter(((YY > HZ + 4) & (sc.fw > 0.85)).astype(np.float32), 3) * 0.85
img, q = marquetry(rng, L, sc.flow, pen=sc.pen, cuts=wedge_cut.astype(np.float32), flow_over=(sky_only * (r < 560), ang), split=wedge, calm=calm)
hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None] * 0.35
img = img * (1 - hi) + hexrgb('#F6EEDC') * hi
vig = vignette_cushion(4, 46)
gnd = np.broadcast_to(hexrgb('#C99D66'), (H, W, 3))
img = gnd * (1 - vig[..., None]) + img * vig[..., None]
# vernis : très léger voile chaud et lustre
img = img * 0.97 + hexrgb('#5A3A18') * 0.03
img = enamel(rng, img, 0.006)
save(img, out)
print('ok')
