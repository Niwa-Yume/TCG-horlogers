"""Cadran « Paris, 1801 » — Le tourbillon (Grand Feu, miniature en couleurs).

Le quai de l'Horloge au soleil couchant, l'année du brevet du tourbillon
(7 messidor an IX) : la tour de l'Horloge et son cadran, les tours rondes de la
Conciergerie, le pont au Change, la Seine qui renvoie le ciel, un bateau-lavoir,
un passeur. La scène est construite lumière à gauche puis retournée : le
couchant est à l'ouest, à droite quand on regarde l'île depuis la rive droite.
Lancer : python3 scene_paris_soir.py sortie.png [--ref]
"""
import sys, math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import *
from painter import Scene, paint, lut, enamel, col3
from vedute import *
from vedute import _blob_into
from paris import quay_row, quay_wall

REF = '--ref' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')]
out = out[0] if out else 'paris_soir.png'
rng = Rng(1801)
HZ = 690
SUN = (112, 548)

STONE = [(0.0, '#241F2E'), (0.3, '#4F4A69'), (0.48, '#7F7489'), (0.62, '#B29486'), (0.78, '#DDB78E'), (0.9, '#F5D9AA'), (1.0, '#FFF0D2')]
SLATE = [(0.0, '#1E2030'), (0.35, '#3F4762'), (0.55, '#6B7491'), (0.75, '#A79AA8'), (1.0, '#E9CFC0')]


def colorize(G, stops, lim=None):
    c = G.color()[..., 0]
    G.P = lut(np.clip(c, 0, 1), stops) * G.A[..., None]


class Capture(Scene):
    def put(self, m, c, *a, **k):
        self.m = m
        super().put(m, c, *a, **k)


sc = Scene('#E9C9AE')
# ciel du couchant : bleu tendre en haut, pêche puis or vers l'horizon, halo du soleil
t = smooth(0, HZ, YY)
skyc = lut(t, [(0.0, '#7E9CC2'), (0.35, '#AFB9CF'), (0.62, '#E8C6B4'), (0.85, '#F6D4A6'), (1.0, '#FBE3B4')])
r = np.sqrt((XX - SUN[0]) ** 2 + ((YY - SUN[1]) * 1.3) ** 2)
glow = np.exp(-(r / 230) ** 1.5)
skyc = skyc * (1 - glow[..., None] * 0.7) + col3('#FFF2C8') * glow[..., None] * 0.7
sc.put((YY < HZ + 6).astype(np.float32), skyc, flow=-0.08, fw=0.7, ln=1.7)
# nuages éclairés par en dessous, rose et lavande
for (cx, cy, w, h, d) in ((560, 250, 420, 110, 0.15), (220, 330, 300, 60, 0.3), (640, 450, 280, 46, 0.45), (330, 470, 220, 30, 0.6)):
    cap = Capture(0.0)
    cloud(cap, rng, cx, cy, w, h, d=d, top=1.0, under=0.55, tiers=3 if h > 80 else 2)
    m = cap.m
    v = cap.img[..., 0] / np.maximum(m, 1e-4)
    side = np.clip((XX - SUN[0]) / 700, 0, 1)
    cc = lut(np.clip(v, 0, 1), [(0.0, '#6D6890'), (0.55, '#9D8EAE'), (0.75, '#E3A99A'), (0.9, '#F9CFA6'), (1.0, '#FFF0D0')])
    cc = cc * (1 - 0.25 * side[..., None]) + col3('#8C8AAE') * 0.25 * side[..., None]
    sc.put(m, cc, ln=1.1)
    sc.light(cap.hi * 0.6, 1.0)
sun = disc(SUN[0], SUN[1], 30, 1.5)
sc.put(sun, col3('#FFF6DA'))
sc.light(sun, 0.9)

# Place Dauphine et maisons vers le Pont-Neuf
houses = Group()
quay_row(houses, rng, -20, 196, HZ - 6, 70, 110, d=0.35, lit_windows=0.0)
colorize(houses, STONE)
houses.commit(sc)

# la Conciergerie
u = 4.1
X = lambda x: x
Y = lambda m: HZ - 6 - m * u
C = Group()
# grand corps gothique entre les tours, toit d'ardoise et lucarnes
C.put(lay(0.3).rect(196, Y(17), 560, Y(0)).arr(), ramp_x(196, 560, 0.86, 0.78), flow=math.pi / 2, fw=0.5, ln=0.6)
C.put(lay(0.3).poly([(194, Y(17)), (562, Y(17)), (552, Y(31)), (204, Y(31))]).arr(), ramp_y(Y(31), Y(17), 0.6, 0.46), flow=0.0, fw=0.6, ln=1.2)
win = lay(0.2)
for k in range(14):
    x = 214 + k * 25
    if 300 < x < 440:
        continue
    win.poly([(x, Y(4)), (x, Y(12)), (x + 4, Y(13.5)), (x + 8, Y(12)), (x + 8, Y(4))])
G_d = lay(0.25)
for k in range(5):
    x = 230 + k * 70
    G_d.poly([(x, Y(17)), (x, Y(23)), (x + 7, Y(27)), (x + 14, Y(23)), (x + 14, Y(17))])
C.put(win.arr(), 0.36)
C.put(G_d.arr(), split(0, 0.8, 0.8))
C.put(lay(0.3).rect(196, Y(0.5), 560, Y(-1.5)).arr(), 0.7)


def round_tower(G, cx, r, h, cone, crenel=False):
    m = lay(0.25).rect(cx - r, Y(h), cx + r, Y(0)).arr()
    nx = np.clip((XX - cx) / r, -1, 1)
    lam = np.clip(-nx * 0.75 + np.sqrt(np.clip(1 - nx * nx, 0, 1)) * 0.55, 0, 1)
    G.put(m, 0.42 + 0.5 * lam, flow=math.pi / 2, fw=0.7, ln=0.6)
    sl = lay(0.2)
    for k in range(3):
        sl.rect(cx - r * 0.3, Y(h * (0.3 + k * 0.22) + 3), cx - r * 0.1, Y(h * (0.3 + k * 0.22)))
    G.put(sl.arr(), 0.3)
    G.put(lay(0.25).rect(cx - r * 1.08, Y(h + 1), cx + r * 1.08, Y(h - 1)).arr(), 0.5 + 0.4 * lam)
    if crenel:
        cr = lay(0.2)
        for k in range(6):
            x0 = cx - r + k * r * 0.36
            cr.rect(x0, Y(h + 3), x0 + r * 0.2, Y(h + 1))
        G.put(cr.arr(), 0.5 + 0.4 * lam)
    rm = lay(0.3).poly([(cx - r * 1.1, Y(h + 1)), (cx, Y(h + 1 + cone)), (cx + r * 1.1, Y(h + 1))]).arr()
    G.put(rm, 0.34 + 0.32 * lam, flow=math.pi / 2, fw=0.5, ln=0.6)
    G.ink(lay(0.0).line([(cx, Y(h + 1 + cone)), (cx, Y(h + 4 + cone))], 1.0).arr(), 0.6)


round_tower(C, 220, 5.0 * u, 22, 9, crenel=True)        # Bonbec
round_tower(C, 330, 5.6 * u, 27, 13)                     # César
round_tower(C, 418, 5.6 * u, 27, 13)                     # Argent
colorize(C, STONE)
C.commit(sc)

# la tour de l'Horloge et son cadran
T = Group()
tx0, tx1 = 556, 616
T.put(lay(0.3).rect(tx0, Y(31), tx1, Y(0)).arr(), ramp_x(tx0, tx1, 0.9, 0.62), flow=math.pi / 2, fw=0.6, ln=0.6)
T.put(lay(0.25).rect(tx1, Y(30.5), tx1 + 14, Y(0)).arr(), 0.45)
T.put(lay(0.3).poly([(tx0 - 3, Y(31)), (tx1 + 14, Y(31)), ((tx0 + tx1 + 14) / 2 + 2, Y(48))]).arr(), ramp_x(tx0, tx1 + 14, 0.62, 0.36), flow=math.pi / 2, fw=0.5)
lan = lay(0.2)
lan.rect((tx0 + tx1) / 2 - 4, Y(52), (tx0 + tx1) / 2 + 8, Y(45))
T.put(lan.arr(), 0.5)
T.put(lay(0.2).poly([((tx0 + tx1) / 2 - 6, Y(52)), ((tx0 + tx1) / 2 + 10, Y(52)), ((tx0 + tx1) / 2 + 2, Y(58))]).arr(), 0.4)
tw = lay(0.2)
for k in range(2):
    tw.poly([(tx0 + 12 + k * 20, Y(22)), (tx0 + 12 + k * 20, Y(27)), (tx0 + 16 + k * 20, Y(28.5)), (tx0 + 20 + k * 20, Y(27)), (tx0 + 20 + k * 20, Y(22))])
T.put(tw.arr(), 0.3)
colorize(T, STONE)
# cadran : panneau bleu, cercle d'or, chiffres en traits
CX, CY = (tx0 + tx1) / 2, Y(14.5)
T.put(lay(0.2).rect(CX - 14, CY - 16, CX + 14, CY + 16).arr(), col3('#3A4F7E'))
T.put(disc(CX, CY, 11.5, 0.8), col3('#D9B060'))
T.put(disc(CX, CY, 9.6, 0.8), col3('#33508A'))
tk = lay(0.0)
for k in range(12):
    a = k / 12 * 2 * math.pi
    tk.line([(CX + math.sin(a) * 7, CY - math.cos(a) * 7), (CX + math.sin(a) * 9.2, CY - math.cos(a) * 9.2)], 0.8)
tk.line([(CX, CY), (CX + 3.5, CY - 4.5)], 1.1)
tk.line([(CX, CY), (CX - 1.5, CY + 6.5)], 0.9)
T.put(tk.arr(), col3('#F6D57C'))
T.light(disc(CX - 6, CY - 6, 3, 0.8), 0.5)
T.commit(sc)

# quai et sa muraille
Q = Group()
quay_wall(Q, rng, HZ - 6, HZ + 14, x0=-10, x1=614, v=0.74, d=0.15)
colorize(Q, STONE)
Q.commit(sc)

# la Seine : reflet coloré ondulé du ciel et des tours
dyw = YY - (HZ + 14)
m = (YY >= HZ + 14).astype(np.float32)
rip = fbm(rng, 10, 3, aspect=9.0) - 0.5
sy = np.clip((HZ + 14) - dyw * 1.05 - 1, 0, H - 1)
sx = np.clip(XX + rip * 22 * smooth(0, 120, dyw), 0, W - 1)
refl = np.stack([ndi.map_coordinates(sc.img[..., c], [sy, sx], order=1) for c in range(3)], -1)
refl = ndi.gaussian_filter(refl, (1.6, 3.2, 0))
base = lut(smooth(0, 460, dyw), [(0.0, '#B7A7A8'), (0.5, '#7E8DAA'), (1.0, '#4F6489')])
k = 0.62 * (1 - smooth(0, 300, dyw))
wc = base * (1 - k[..., None]) + refl * 0.88 * k[..., None]
bands = fbm(rng, 18, 3, aspect=14.0) - 0.5
wc = wc * (1 + bands[..., None] * 0.08)
sc.put(m, wc, flow=0.0, fw=0.96, ln=2.0)
spath = np.exp(-((XX - SUN[0]) / np.maximum(20 + 0.1 * dyw, 1.0)) ** 2) * m * (1 - smooth(120, 420, dyw))
gl = (fbm(rng, 8, 2, aspect=10.0) > 0.55).astype(np.float32)
sc.put(ndi.gaussian_filter(spath * gl, (0.5, 1.2)) * 0.85, col3('#FFE6B0'), flow=0.0, fw=0.95)
sc.light(ndi.gaussian_filter(spath * gl, (0.5, 1.2)), 0.6)

# pont au Change : il part de la tour et vient vers nous, arches de plus en plus grandes
B = Group()
x0b, x1b = 612, 860
Dt = lambda x: (HZ - 16) + (x - x0b) / (x1b - x0b) * (840 - (HZ - 16))      # dessous du parapet
Wl = lambda x: (HZ + 14) + (x - x0b) / (x1b - x0b) * (1010 - (HZ + 14))     # pied dans l'eau
xs = np.linspace(x0b, x1b, 24)
face = [(x, Dt(x)) for x in xs] + [(x, Wl(x)) for x in xs[::-1]]
B.put(lay(0.3).poly(face).arr(), ramp_x(x0b, x1b, 0.86, 0.72), flow=math.atan2(840 - HZ, x1b - x0b), fw=0.6, ln=1.0)
for (xa, xb) in ((626, 654), (668, 716), (734, 812)):
    pts = []
    for a in np.linspace(math.pi, 0, 18):
        xm = (xa + xb) / 2 + math.cos(a) * (xb - xa) / 2
        spring = Wl(xm) - (Wl(xm) - Dt(xm)) * 0.42
        rise = (Wl(xm) - Dt(xm)) * 0.42
        pts.append((xm, spring - math.sin(a) * rise))
    pts += [(xb, Wl(xb) + 2), (xa, Wl(xa) + 2)]
    B.put(lay(0.3).poly(pts).arr(), 0.26)
    vous = lay(0.0)
    vous.line(pts[:18], 1.2)
    B.ink(vous.arr(), 0.25)
colorize(B, STONE)
B.commit(sc)
for x, cv, kind in ((648, 0.34, 'homme'), (664, 0.82, 'dame'), (722, 0.3, 'homme')):
    F = Group()
    foot = Dt(x) - (Wl(x) - Dt(x)) * 0.05
    h_ = (Wl(x) - Dt(x)) * 1.05 + 12
    figure(F, rng, x, foot, h_, kind, 0.0, coat=cv)
    colorize(F, [(0.0, '#1D1A24'), (0.4, '#2E3E6E' if cv < 0.5 else '#8A3A3A'), (0.7, '#C9A27C'), (1.0, '#FBEBD3')])
    F.commit(sc)
BP = Group()
par = [(x, Dt(x) - (Wl(x) - Dt(x)) * 0.2 - 4) for x in xs] + [(x, Dt(x) + 1) for x in xs[::-1]]
BP.put(lay(0.3).poly(par).arr(), 0.93, flow=math.atan2(840 - HZ, x1b - x0b), fw=0.8, ln=1.4)
BP.light(lay(0.2).poly([(x, Dt(x) - (Wl(x) - Dt(x)) * 0.2 - 4) for x in xs] + [(x, Dt(x) - (Wl(x) - Dt(x)) * 0.17 - 3) for x in xs[::-1]]).arr(), 0.5)
colorize(BP, STONE)
BP.commit(sc)
# martinets du soir
bd = lay(0.0)
for (bx_, by_, s_) in ((140, 380, 1.3), (176, 352, 1.0), (206, 398, 0.9), (98, 410, 0.8), (250, 366, 0.7)):
    bd.line([(bx_ - 9 * s_, by_ - 3 * s_), (bx_ - 3 * s_, by_ - 1 * s_), (bx_, by_ + 2 * s_), (bx_ + 3 * s_, by_ - 1 * s_), (bx_ + 9 * s_, by_ - 3 * s_)], 1.3 * s_)
sc.ink(bd.arr(), 0.7)

# bateau-lavoir amarré et passeur
L_ = Group()
L_.put(lay(0.4).poly([(120, 760), (330, 760), (342, 748), (346, 772), (116, 774)]).arr(), 0.3, flow=0.0, fw=0.8)
L_.put(lay(0.3).rect(140, 722, 320, 758).arr(), ramp_x(140, 320, 0.8, 0.62))
L_.put(lay(0.3).poly([(130, 724), (330, 724), (318, 708), (142, 708)]).arr(), 0.52)
pl = lay(0.2)
for k in range(9):
    pl.rect(146 + k * 20, 726, 150 + k * 20, 758)
L_.put(pl.arr(), 0.4)
for x in (190, 236, 282):
    figure(L_, rng, x, 760, 34, 'dame', 0.0, seated=True, coat=0.86)
colorize(L_, [(0.0, '#221C24'), (0.3, '#4A3B3E'), (0.6, '#9C7A62'), (0.8, '#D9B48C'), (1.0, '#FBEAD0')])
L_.reflect(sc, 774, k=0.55, ripple=rip, amp=8, fade=70)
L_.commit(sc)
P_ = Group()
P_.put(lay(0.4).poly([(380, 868), (408, 874), (500, 874), (530, 862), (516, 886), (394, 886)]).arr(), ramp_y(862, 886, 0.42, 0.22), flow=0.0, fw=0.8)
P_.put(lay(0.3).line([(382, 869), (460, 875), (528, 863)], 1.4).arr(), 0.8)
figure(P_, rng, 420, 874, 60, 'rameur', 0.0, coat=0.36)
figure(P_, rng, 462, 874, 58, 'homme', 0.0, seated=True, coat=0.3)
figure(P_, rng, 492, 874, 56, 'dame', 0.0, seated=True, coat=0.82)
P_.ink(lay(0.0).line([(424, 846), (370, 896)], 1.4).arr(), 0.8)
colorize(P_, [(0.0, '#1C1822'), (0.3, '#2F3F70'), (0.55, '#8E3B34'), (0.8, '#E2C29A'), (1.0, '#FFF2DC')])
P_.reflect(sc, 886, k=0.55, ripple=rip, amp=7, fade=50)
P_.commit(sc)

# retournement : le couchant passe à l'ouest, à droite
sc.img = sc.img[:, ::-1].copy()
sc.flow = (-sc.flow[:, ::-1]).copy()
sc.fw = sc.fw[:, ::-1].copy()
sc.lenm = sc.lenm[:, ::-1].copy()
sc.pen = sc.pen[:, ::-1].copy()
sc.hi = sc.hi[:, ::-1].copy()

if REF:
    save(np.clip(sc.img, 0, 1), out)
    print('ref ok')
    sys.exit()

C_ = paint(sc, rng, radii=(14, 7, 3.5, 1.8, 1.0), T=0.035, maxlen=10)
print('touches', paint.last_count)
pen = ndi.gaussian_filter(sc.pen, 0.35)[..., None]
img = C_ * (1 - pen * 0.75) + col3('#2A1E18') * pen * 0.75
hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None]
img = img * (1 - hi * 0.7) + col3('#FFF8E8') * hi * 0.7
vig = vignette_cushion(4, 46)
gnd = np.broadcast_to(col3('#F3E9D6'), (H, W, 3))
img = gnd * (1 - vig[..., None]) + img * vig[..., None]
img = enamel(rng, img, 0.01)
save(np.clip(img, 0, 1), out)
print('ok')
