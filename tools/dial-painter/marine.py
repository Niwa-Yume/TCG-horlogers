"""Marine : mer en perspective et vaisseau sous voiles (pour « En mer, 1761 »)."""
import math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, Layer, fbm, smooth
from vedute import Group, lay, air, split, ramp_x, ramp_y, disc, LDIR


def sea(sc, rng, hz, v_far=0.82, v_near=0.5, amp=1.0, cx=408.0, focal=260.0, sun=None):
    """Houle en perspective : champ de hauteur (crêtes affûtées) projeté, éclairé,
    plus clair vers l'horizon ; éclats sous le soleil."""
    dy = np.maximum(YY - hz, 0) + 1.5
    Z = focal * 40.0 / dy
    X = (XX - cx) * Z / focal
    warp = (fbm(rng, 50, 3, aspect=5.0) - 0.5) * 2.2
    h = np.zeros((H, W), np.float32)
    for (kx, kz, a, sh) in ((0.07, 0.22, 1.0, 3.0), (-0.12, 0.31, 0.6, 2.5), (0.2, 0.45, 0.35, 2.0), (0.02, 0.9, 0.18, 1.5)):
        th = kx * X + kz * Z + warp * (1 + kz)
        h += a * ((np.sin(th) + 1) * 0.5) ** sh
    h /= 2.1
    fade = smooth(0, 90, dy)
    gy = np.gradient(h, axis=0)
    face = np.clip(-gy * dy * 0.5, -1, 1)
    base = v_far + (v_near - v_far) * smooth(0, H - hz, dy) ** 0.7
    v = base + amp * fade * (0.20 * h - 0.10 * face)
    m = (YY >= hz).astype(np.float32)
    flow = np.full((H, W), 0.0, np.float32) + 0.15 * (fbm(rng, 120, 2) - 0.5)
    sc.put(m, v, flow=flow, fw=0.9, ln=1.4)
    crest = smooth(0.62, 0.9, h) * fade
    sc.light(m * crest * (rng.r.random((H, W)) < 0.35), 0.5)
    if sun is not None:
        sx, sy = sun
        path = np.exp(-((XX - sx) / (30 + 0.35 * dy)) ** 2) * smooth(0, 40, dy) * (1 - smooth(200, 500, dy))
        gl = (rng.r.random((H, W)) < 0.03).astype(np.float32)
        gl = ndi.maximum_filter(gl, size=(1, 6))
        sc.light(m * path * gl * smooth(0.3, 0.7, h), 0.9)
    return h


def sunburst(sc, rng, sx, sy, hz, n=28, amp=0.035, r_sun=34, v_sun=0.99):
    """Soleil bas et rayons en éventail : alternance de valeurs, comme un placage en pointes."""
    ang = np.arctan2(YY - sy, XX - sx)
    k = np.floor((ang + math.pi) / (2 * math.pi) * n)
    alt = (k % 2) * 2 - 1
    r = np.sqrt((XX - sx) ** 2 + (YY - sy) ** 2)
    m = (YY < hz)
    v = sc.lum() + alt * amp * smooth(r_sun, r_sun + 50, r) * (1 - smooth(180, 620, r)) + 0.06 * (1 - smooth(r_sun, 260, r))
    sc.put(m.astype(np.float32), v)
    sm = disc(sx, sy, r_sun, 1.5)
    sc.put(sm * (YY < hz), v_sun)
    sc.light(sm * (YY < hz), 0.6)


def _rot(cx, cy, a):
    ca, sa = math.cos(a), math.sin(a)
    return lambda p: (cx + (p[0] - cx) * ca - (p[1] - cy) * sa, cy + (p[0] - cx) * sa + (p[1] - cy) * ca)


def _sail(G, T, xl, xr, yt, yb, belly, roach, d, lit=0.97, shade=0.62, seams=True, flip=False):
    """Voile carrée gonflée : bord de vergue droit, chute et bordure bombées, ombre vers l'aval."""
    pts = []
    n = 10
    for i in range(n + 1):
        t = i / n
        pts.append((xl + (xr - xl) * t, yt - 1.5 * math.sin(t * math.pi)))
    for i in range(1, n + 1):
        t = i / n
        pts.append((xr + belly * math.sin(t * math.pi), yt + (yb - yt) * t))
    for i in range(1, n + 1):
        t = i / n
        pts.append((xr - (xr - xl) * t, yb - roach * math.sin(t * math.pi)))
    for i in range(1, n):
        t = i / n
        pts.append((xl - belly * 0.6 * math.sin(t * math.pi), yb - (yb - yt) * t))
    m = lay(0.35).poly([T(p) for p in pts]).arr()
    xs = (XX - xl) / max(xr - xl, 1)
    if flip:
        xs = 1 - xs
    ys = (YY - yt) / max(yb - yt, 1)
    v = lit - (lit - shade) * (0.6 * np.clip(xs, 0, 1) ** 1.6 + 0.4 * np.clip(ys, 0, 1) ** 2)
    v = v - 0.08 * np.exp(-((np.clip(xs, 0, 1) - 0.72) / 0.12) ** 2) * (1 - np.clip(ys, 0, 1) * 0.5)
    G.put(m, air(v, d), flow=math.pi / 2, fw=0.6, ln=0.8)
    G.light(m * (xs < 0.35) * (ys < 0.6), 0.25)
    if seams:
        sl = lay(0.0)
        cols = max(3, int((xr - xl) / 9))
        for j in range(1, cols):
            x = xl + (xr - xl) * j / cols
            sl.line([T((x, yt + 2)), T((x + belly * 0.4 * math.sin(math.pi * j / cols), (yt + yb) / 2)), T((x, yb - roach * math.sin(math.pi * j / cols) - 1))], 0.5)
        G.ink(sl.arr() * m, 0.14)


def ship_under_sail(sc, rng, x0, wl, L, mh, d=0.1, heel=-0.04, h_sea=None):
    """Vaisseau de 50 canons sous voiles, cap à droite, gîte légère ; étrave à droite."""
    G = Group()
    T = _rot(x0 + L * 0.5, wl, heel)
    hh = L * 0.12
    sheer = [(x0 + L * 0.0, wl - hh * 2.0), (x0 + L * 0.09, wl - hh * 1.9), (x0 + L * 0.2, wl - hh * 1.45),
             (x0 + L * 0.55, wl - hh * 1.15), (x0 + L * 0.84, wl - hh * 1.28), (x0 + L * 0.96, wl - hh * 1.55)]
    keel = [(x0 + L * 1.01, wl - hh * 1.4), (x0 + L * 0.97, wl - hh * 0.3), (x0 + L * 0.9, wl + 4),
            (x0 + L * 0.1, wl + 4), (x0 + L * 0.03, wl - hh * 0.5)]
    hm = lay(0.35).poly([T(p) for p in sheer + keel]).arr()
    G.put(hm, ramp_y(wl - hh * 2, wl, air(0.40, d), air(0.2, d)), flow=0.0, fw=0.7, ln=1.2)
    for f0, f1, v in ((0.55, 0.68, 0.74), (0.98, 1.06, 0.66)):
        b = lay(0.25).poly([T(p) for p in [(x0 + L * 0.07, wl - hh * (f1 + 0.25)), (x0 + L * 0.55, wl - hh * f1), (x0 + L * 0.93, wl - hh * (f1 + 0.15)),
                                            (x0 + L * 0.93, wl - hh * (f0 + 0.12)), (x0 + L * 0.55, wl - hh * f0), (x0 + L * 0.07, wl - hh * (f0 + 0.25))]])
        G.put(b.arr() * hm, air(v, d))
    ports = lay(0.2)
    for row, yf in ((0, 0.86), (1, 1.28)):
        for k in range(12 if row == 0 else 10):
            px = x0 + L * (0.15 + k * (0.062 if row == 0 else 0.07))
            ports.poly([T(p) for p in [(px, wl - hh * yf), (px + L * 0.02, wl - hh * yf), (px + L * 0.02, wl - hh * (yf - 0.14)), (px, wl - hh * (yf - 0.14))]])
    G.put(ports.arr() * hm, air(0.16, d))
    st = lay(0.3).poly([T(p) for p in [(x0 - L * 0.01, wl - hh * 2.2), (x0 + L * 0.08, wl - hh * 2.05), (x0 + L * 0.08, wl - hh * 1.3), (x0 + L * 0.02, wl - hh * 1.0)]])
    G.put(st.arr(), air(0.62, d))
    # mâture et voiles
    mx = [x0 + L * 0.76, x0 + L * 0.5, x0 + L * 0.24]
    mhs = [mh * 0.92, mh, mh * 0.7]
    deck = [wl - hh * 1.25, wl - hh * 1.15, wl - hh * 1.5]
    spans = [0.9, 1.0, 0.66]
    yard_f = (0.30, 0.56, 0.78, 0.93)
    for i in range(3):
        top = deck[i] - mhs[i]
        G.put(lay(0.1).line([T((mx[i], deck[i])), T((mx[i], top))], 3.2 - i * 0.3).arr(), air(0.3, d))
        G.ink(lay(0.1).line([T((mx[i] + 0.8, deck[i])), T((mx[i] + 0.8, top))], 1.0).arr(), 0.4)
        ylen = [0.42, 0.34, 0.24, 0.15]
        ys = [deck[i] - mhs[i] * f for f in yard_f]
        for j in range(4):
            half = ylen[j] * L * spans[i] * 0.5
            G.put(lay(0.1).line([T((mx[i] - half, ys[j])), T((mx[i] + half, ys[j]))], 2.0).arr(), air(0.26, d))
        # voiles : basse voile, hunier, perroquet, cacatois (pas de basse voile au mât d'artimon)
        for j in range(4):
            if i == 2 and j == 0:
                continue
            half_t = ylen[j] * L * spans[i] * 0.5 * 0.96
            half_b = (ylen[j - 1] if j > 0 else ylen[0] * 1.02) * L * spans[i] * 0.5 * 0.98
            yt = ys[j] + 2
            yb = (ys[j - 1] - 3) if j > 0 else deck[i] - hh * 0.4
            hw = (half_t + half_b) / 2
            _sail(G, T, mx[i] - hw, mx[i] + hw, yt, yb, belly=hw * 0.12, roach=(yb - yt) * 0.12, d=d, lit=0.97, shade=0.6 - 0.04 * j)
        # haubans
        rig = lay(0.0)
        for side in (-1, 1):
            for k in range(5):
                bx = mx[i] + side * (6 + k * 4)
                rig.line([T((bx, deck[i] + hh * 0.35)), T((mx[i] + side * 2, ys[1] + 6))], 0.6)
        G.ink(rig.arr(), 0.4)
    # brigantine (voile aurique) à l'artimon
    gaff_y = deck[2] - mhs[2] * 0.36
    peak = (x0 - L * 0.01, gaff_y - L * 0.15)
    boom = (x0 - L * 0.06, deck[2] - hh * 0.35)
    sp = [(mx[2] - 2, gaff_y + 3), peak, boom, (mx[2] - 2, deck[2] - hh * 0.3)]
    sm = lay(0.4).poly([T(p) for p in sp]).arr()
    G.put(sm, air(0.93 - 0.3 * smooth(boom[0], mx[2], XX) ** 1.5, d), flow=math.pi / 2, fw=0.5, ln=0.8)
    G.put(lay(0.1).line([T((mx[2], gaff_y + 2)), T(peak)], 1.6).arr(), air(0.28, d))
    G.put(lay(0.1).line([T((mx[2], deck[2] - hh * 0.3)), T(boom)], 1.6).arr(), air(0.28, d))
    # beaupré, foc et clinfoc
    bow = (x0 + L * 0.99, wl - hh * 1.5)
    bsp = (bow[0] + L * 0.3, bow[1] - L * 0.12)
    G.put(lay(0.1).line([T(bow), T(bsp)], 2.6).arr(), air(0.28, d))
    for k, (f, top_f) in enumerate(((0.5, 0.5), (0.92, 0.66))):
        tip = (bow[0] + (bsp[0] - bow[0]) * f, bow[1] + (bsp[1] - bow[1]) * f)
        head = (mx[0] + 4, deck[0] - mhs[0] * top_f)
        mid = (tip[0] + (head[0] - tip[0]) * 0.62, tip[1] + (head[1] - tip[1]) * 0.62)
        clew = (mid[0] - L * 0.02, tip[1] + L * 0.01)
        belly = (tip[0] * 0.5 + clew[0] * 0.5 + 4, tip[1] * 0.5 + clew[1] * 0.5 + 6)
        luffm = (tip[0] * 0.5 + head[0] * 0.5 + 3, tip[1] * 0.5 + head[1] * 0.5 - 3)
        pts = [tip, luffm, head, clew, belly]
        jm = lay(0.4).poly([T(p) for p in pts]).arr()
        G.put(jm, air(0.94 - 0.26 * smooth(head[0], clew[0], XX), d), flow=-0.8, fw=0.5, ln=0.8)
    stays = lay(0.0)
    stays.line([T(bsp), T((mx[0], deck[0] - mhs[0] * 0.98))], 0.7)
    stays.line([T((mx[0], deck[0] - mhs[0] * 0.9)), T((mx[1], deck[1] - mhs[1] * 0.99))], 0.6)
    stays.line([T((mx[1], deck[1] - mhs[1] * 0.85)), T((mx[2], deck[2] - mhs[2] * 0.98))], 0.6)
    G.ink(stays.arr(), 0.5)
    # pavillon à la corne et flamme
    fx, fy = T(peak)
    pts = [(fx, fy)] + [(fx - 6 - t * 44, fy + 2 + 5 * math.sin(t * 5) + t * 8) for t in np.linspace(0, 1, 12)] + \
          [(fx - 6 - t * 44, fy + 22 + 5 * math.sin(t * 5 + 0.5) + t * 4) for t in np.linspace(1, 0, 12)] + [(fx, fy + 20)]
    G.put(lay(0.3).poly(pts).arr(), air(0.42 + 0.12 * np.sin((XX - fx) / 7.0), d))
    tx, ty = T((mx[1], deck[1] - mhs[1]))
    pp = [(tx - 2 - t * 70, ty + 3 + 4 * math.sin(t * 6) + t * 6 - 2.4 * (1 - t)) for t in np.linspace(0, 1, 16)]
    pp += [(tx - 2 - t * 70, ty + 3 + 4 * math.sin(t * 6) + t * 6 + 2.4 * (1 - t)) for t in np.linspace(1, 0, 16)]
    G.put(lay(0.2).poly(pp).arr(), air(0.4, d))
    # écume d'étrave et sillage
    foam = lay(0.6)
    bx, by = T((x0 + L * 0.95, wl))
    foam.poly([(bx - 40, by - 2), (bx + 10, by - 12), (bx + 34, by - 4), (bx + 60, by + 6), (bx - 30, by + 8)])
    foam.poly([(x0 - 70, wl + 2), (x0 + L * 0.2, wl - 1), (x0 + L * 0.25, wl + 6), (x0 - 90, wl + 10)])
    fm = ndi.gaussian_filter(foam.arr(), 1.2)
    G.put(fm, 0.95, flow=0.0, fw=0.8, ln=0.8)
    G.light(fm, 0.5)
    G.commit(sc)


def gull(sc, x, y, s=1.0, v=0.35):
    g = lay(0.0)
    g.line([(x - 9 * s, y - 2 * s), (x - 4 * s, y - 4 * s), (x, y)], 1.3 * s)
    g.line([(x, y), (x + 4 * s, y - 4.5 * s), (x + 10 * s, y - 2.5 * s)], 1.3 * s)
    sc.ink(g.arr(), 0.8)
