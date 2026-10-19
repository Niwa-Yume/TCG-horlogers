"""Éléments de vedute (vue de ville peinte) pour les cadrans WristMasters.

Chaque élément est modelé en valeurs (1 = clair, 0 = sombre) avec une lumière
venant du haut à gauche et une perspective atmosphérique : plus c'est loin,
plus c'est clair et doux. Le pinceau (painter.paint) repeint ensuite le tout.
"""
import math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, Layer, fbm, smooth, hexrgb
from painter import col3, current_material

HAZE = 0.9
LDIR = np.array([-0.55, -0.62, 0.56])  # lumière : haut gauche, un peu de face
LDIR = LDIR / np.linalg.norm(LDIR)


def air(v, d, haze=None):
    """Perspective atmosphérique : rapproche la valeur du voile à mesure que d (0..1) augmente."""
    haze = HAZE if haze is None else haze
    return haze + (v - haze) * (1 - 0.85 * d)


def set_haze(h):
    global HAZE
    HAZE = h


def lay(w=0.45, seed=None):
    return Layer(wob=w, seed=seed)


def split(x, v_lit, v_sh, soft=1.5):
    """Lumière à gauche de x, ombre à droite."""
    return v_lit + (v_sh - v_lit) * smooth(x - soft, x + soft, XX)


def ramp_x(x0, x1, v0, v1):
    return v0 + (v1 - v0) * np.clip((XX - x0) / max(x1 - x0, 1e-3), 0, 1)


def ramp_y(y0, y1, v0, v1):
    return v0 + (v1 - v0) * np.clip((YY - y0) / max(y1 - y0, 1e-3), 0, 1)


def disc_into(out, cx, cy, r, soft=1.0, wob=None, rng=None):
    """Comme disc, mais fusionné (max) dans out, sans allouer d'image entière."""
    R = r * 1.3 + soft + 2
    x0, x1 = int(max(0, cx - R)), int(min(W, cx + R + 1))
    y0, y1 = int(max(0, cy - R)), int(min(H, cy + R + 1))
    if x1 <= x0 or y1 <= y0:
        return out
    yy, xx = YY[y0:y1, x0:x1] - cy, XX[y0:y1, x0:x1] - cx
    d = np.sqrt(xx * xx + yy * yy)
    rr = r
    if wob is not None:
        th = np.arctan2(yy, xx)
        ph = rng.u(0, 6.28, 3)
        rr = r * (1 + wob * (0.55 * np.sin(3 * th + ph[0]) + 0.3 * np.sin(5 * th + ph[1]) + 0.2 * np.sin(9 * th + ph[2])))
    np.maximum(out[y0:y1, x0:x1], np.clip((rr - d) / max(soft, 1e-3) + 0.5, 0, 1), out=out[y0:y1, x0:x1])
    return out


def dab_into(M, V, cx, cy, r, v, soft=1.0, wob=None, rng=None):
    """Touche ronde de valeur v composée par-dessus (M, V), dans sa boîte."""
    R = r * 1.3 + soft + 2
    x0, x1 = int(max(0, cx - R)), int(min(W, cx + R + 1))
    y0, y1 = int(max(0, cy - R)), int(min(H, cy + R + 1))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = YY[y0:y1, x0:x1] - cy, XX[y0:y1, x0:x1] - cx
    d = np.sqrt(xx * xx + yy * yy)
    rr = r
    if wob is not None:
        th = np.arctan2(yy, xx)
        ph = rng.u(0, 6.28, 3)
        rr = r * (1 + wob * (0.55 * np.sin(3 * th + ph[0]) + 0.3 * np.sin(5 * th + ph[1]) + 0.2 * np.sin(9 * th + ph[2])))
    m = np.clip((rr - d) / max(soft, 1e-3) + 0.5, 0, 1)
    V[y0:y1, x0:x1] = V[y0:y1, x0:x1] * (1 - m) + v * m
    np.maximum(M[y0:y1, x0:x1], m, out=M[y0:y1, x0:x1])


def disc(cx, cy, r, soft=1.0, wob=None, rng=None):
    """Disque antialiasé (avec contour irrégulier optionnel), calculé dans sa boîte."""
    out = np.zeros((H, W), np.float32)
    R = r * 1.3 + soft + 2
    x0, x1 = int(max(0, cx - R)), int(min(W, cx + R + 1))
    y0, y1 = int(max(0, cy - R)), int(min(H, cy + R + 1))
    if x1 <= x0 or y1 <= y0:
        return out
    yy, xx = YY[y0:y1, x0:x1] - cy, XX[y0:y1, x0:x1] - cx
    d = np.sqrt(xx * xx + yy * yy)
    rr = r
    if wob is not None:
        th = np.arctan2(yy, xx)
        ph = rng.u(0, 6.28, 3)
        rr = r * (1 + wob * (0.55 * np.sin(3 * th + ph[0]) + 0.3 * np.sin(5 * th + ph[1]) + 0.2 * np.sin(9 * th + ph[2])))
    out[y0:y1, x0:x1] = np.clip((rr - d) / max(soft, 1e-3) + 0.5, 0, 1)
    return out


class Group:
    """Calque intermédiaire : on y compose un objet (navire, arbre…), on peut le
    refléter dans l'eau, puis on le pose sur la scène."""

    def __init__(self):
        self.P = np.zeros((H, W, 3), np.float32)
        self.A = np.zeros((H, W), np.float32)
        self.flow = np.zeros((H, W), np.float32)
        self.fw = np.zeros((H, W), np.float32)
        self.ln = np.ones((H, W), np.float32)
        self.pen = np.zeros((H, W), np.float32)
        self.hi = np.zeros((H, W), np.float32)
        self.mat = np.zeros((H, W), np.uint8)

    def put(self, m, v, flow=None, fw=0.85, ln=None):
        m = np.clip(m, 0, 1)
        c = v if not isinstance(v, str) else hexrgb(v)
        c = np.asarray(c, np.float32)
        if c.ndim == 0:
            c = np.full(3, float(c), np.float32)
        c = c[None, None, :] if c.ndim == 1 else (c[..., None] if c.ndim == 2 else c)
        self.P = self.P * (1 - m[..., None]) + c * m[..., None]
        self.A = self.A * (1 - m) + m
        sel = m > 0.5
        if current_material():
            self.mat[sel] = current_material()
        if flow is not None:
            self.flow[sel] = np.broadcast_to(np.asarray(flow, np.float32), (H, W))[sel]
            self.fw[sel] = np.broadcast_to(np.asarray(fw, np.float32), (H, W))[sel]
        if ln is not None:
            self.ln[sel] = np.broadcast_to(np.asarray(ln, np.float32), (H, W))[sel]
        # ce qui est peint par-dessus recouvre la plume et les rehauts dessous
        self.pen *= (1 - m)
        self.hi *= (1 - m)

    def ink(self, m, a=1.0):
        self.pen = 1 - (1 - self.pen) * (1 - np.clip(m * a, 0, 1))

    def light(self, m, a=1.0):
        self.hi = np.maximum(self.hi, np.clip(m * a, 0, 1))

    def color(self):
        return self.P / np.maximum(self.A, 1e-5)[..., None]

    def commit(self, sc):
        a = self.A
        sc.put(a, self.color())
        sel = a > 0.5
        if hasattr(sc, 'mat'):
            sc.mat[sel & (self.mat > 0)] = self.mat[sel & (self.mat > 0)]
        sc.flow[sel] = self.flow[sel]
        sc.fw[sel] = self.fw[sel]
        sc.lenm[sel] = self.ln[sel]
        sc.pen = sc.pen * (1 - a) + self.pen
        sc.hi = sc.hi * (1 - a) + self.hi

    def reflect(self, sc, wl, k=0.5, ripple=None, amp=8.0, darken=0.82, fade=150.0, stretch=1.0, blur=(1.2, 2.2)):
        """Reflet dans l'eau sous la ligne de flottaison wl : miroir, ondulé, assombri, estompé."""
        below = (YY > wl).astype(np.float32)
        sy = wl - (YY - wl) / stretch
        sx = XX + (ripple * amp if ripple is not None else 0)
        sy = np.clip(sy, 0, H - 1)
        sx = np.clip(sx, 0, W - 1)
        A = ndi.map_coordinates(self.A, [sy, sx], order=1)
        col = self.color()
        C = np.stack([ndi.map_coordinates(col[..., c], [sy, sx], order=1) for c in range(3)], -1)
        A = ndi.gaussian_filter(A, blur) * below * k * (1 - smooth(0, fade, YY - wl))
        C = ndi.gaussian_filter(C, (blur[0], blur[1], 0))
        sc.put(A, C * darken + (1 - darken) * 0.25, flow=0.0, fw=0.95, ln=1.6)


# ───────────────────────────── ciel ─────────────────────────────

def sky(sc, rng, hz, top=0.78, bot=0.94, noise=0.035):
    t = smooth(-80, hz, YY) ** 0.9
    v = top + (bot - top) * t
    v = v + (fbm(rng, 220, 4, aspect=2.6) - 0.5) * noise
    m = (YY < hz + 6).astype(np.float32)
    sc.put(m, v, flow=-0.10 + 0.3 * (fbm(rng, 300, 2) - 0.5), fw=0.7, ln=1.7)


def _blob_into(D, cx, cy, sx, sy, a=1.0, Dmax=None):
    R = 3.2
    x0, x1 = int(max(0, cx - R * sx)), int(min(W, cx + R * sx + 1))
    y0, y1 = int(max(0, cy - R * sy)), int(min(H, cy + R * sy + 1))
    if x1 <= x0 or y1 <= y0:
        return
    xx = (XX[y0:y1, x0:x1] - cx) / sx
    yy = (YY[y0:y1, x0:x1] - cy) / sy
    g = a * np.exp(-0.5 * (xx * xx + yy * yy))
    D[y0:y1, x0:x1] += g
    if Dmax is not None:
        # dôme du bourrelet : hauteur proportionnelle à sa taille
        np.maximum(Dmax[y0:y1, x0:x1], np.sqrt(np.clip(1 - (xx * xx + yy * yy) / 4.0, 0, 1)) * sy, out=Dmax[y0:y1, x0:x1])


def cloud(sc, rng, cx, cy, w, h, d=0.3, top=0.985, under=0.80, n=None, tiers=2, flat=True, wisp=0.35, hi=0.5, **kw):
    """Cumulus peint : une couronne de bourrelets le long d'un profil en arche (sommet
    festonné), un corps plus large dessous, base plate et grise. Chaque bourrelet est
    un dôme : la lumière en haut à gauche creuse les plis entre eux."""
    yb = cy + h * 0.5
    n = n or int(8 + w / 22)
    D = np.zeros((H, W), np.float32)
    Dm = np.zeros((H, W), np.float32)
    prof = lambda t: max(0.0, 1 - abs(t) ** 1.6) ** 0.8
    # corps
    for i in range(max(3, n // 3)):
        t = rng.u(-0.8, 0.8)
        R = h * rng.u(0.35, 0.5) * (0.6 + 0.4 * prof(t))
        _blob_into(D, cx + t * w * 0.45, yb - R * 0.55, R / 2 * 1.3, R / 2, 1.0, Dm)
    # couronne festonnée
    for tier in range(tiers):
        k = n if tier == 0 else int(n * 0.6)
        for i in range(k):
            t = (i + rng.u(-0.35, 0.35)) / max(k - 1, 1) * 2 - 1
            t *= (1.0 - 0.25 * tier)
            yc = yb - h * prof(t) * (1.0 - 0.18 * tier)
            R = h * rng.u(0.14, 0.26) * (0.55 + 0.45 * prof(t)) * (1 - 0.2 * tier)
            _blob_into(D, cx + t * w * 0.5, yc + R * 0.55, R / 2 * rng.u(1.0, 1.25), R / 2, 1.0, Dm)
    N = fbm(rng, max(8.0, h * 0.16), 4)
    m = smooth(0.0, max(3.0, h * 0.05), Dm - N * h * 0.10 * wisp / 0.35)
    if flat:
        m = m * (1 - smooth(yb - 8, yb + 5, YY))
    ht = ndi.gaussian_filter(Dm, max(2.0, h * 0.035))
    gy, gx = np.gradient(ht)
    nx, ny, nz = -gx, -gy, np.ones_like(ht)
    nn = np.sqrt(nx * nx + ny * ny + nz * nz)
    lam = np.clip((nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2]) / nn, 0, 1)
    low = smooth(yb - h * 0.7, yb, YY)
    v = under + (top - under) * (0.05 + 0.95 * lam ** 1.5) * (1 - 0.55 * low)
    v = air(v, d, 0.95)
    sc.put(m, v, ln=1.1)
    sc.light(m * smooth(0.8, 0.95, lam) * (1 - low), hi)


def hills(sc, rng, hz, amp, v=0.80, d=0.85, x0=0, x1=W):
    xs = np.arange(W, dtype=np.float32)
    prof = np.zeros(W, np.float32)
    for k, a in ((1, 1.0), (2.3, 0.45), (5.1, 0.2), (11, 0.08)):
        ph = rng.u(0, 6.28)
        prof += a * np.sin(xs / W * math.pi * k + ph)
    prof = (prof - prof.min()) / (prof.max() - prof.min() + 1e-6)
    top = hz - amp * (0.35 + 0.65 * prof)
    m = smooth(-1.5, 1.5, YY - top[None, :]) * (YY < hz + 4) * ((XX >= x0) & (XX <= x1))
    sc.put(m.astype(np.float32), air(v + 0.03 * (fbm(rng, 60, 3) - 0.5), d), flow=0.0, fw=0.5, ln=1.4)


# ─────────────────────────── architecture ───────────────────────────

def house(G, rng, x, base, w, h, d=0.5, style=None, side=0.0, lit=None, win=True):
    """Maison géorgienne : façade éclairée, flanc à l'ombre, toit, souches, fenêtres."""
    style = style or rng.r.choice(['parapet', 'gable', 'hip', 'parapet'])
    vf = air(lit if lit is not None else rng.u(0.80, 0.90), d)
    vs = air(rng.u(0.55, 0.64), d)
    vr = air(rng.u(0.50, 0.62), d)
    top = base - h
    if side > 0:
        sw = side * w
        s = lay(0.3).poly([(x + w, top), (x + w + sw, top + sw * 0.12), (x + w + sw, base), (x + w, base)])
        G.put(s.arr(), vs, flow=math.pi / 2, fw=0.6, ln=0.6)
    if style == 'gable':
        f = lay(0.3).poly([(x, base), (x, top), (x + w * 0.5, top - w * 0.42), (x + w, top), (x + w, base)])
    else:
        f = lay(0.3).rect(x, top, x + w, base)
    G.put(f.arr(), ramp_x(x, x + w, vf, vf - 0.05), flow=math.pi / 2, fw=0.5, ln=0.6)
    if style == 'parapet':
        rh = w * rng.u(0.18, 0.3)
        r = lay(0.3).poly([(x + 1, top), (x + w * 0.22, top - rh), (x + w * 0.78, top - rh), (x + w - 1, top)])
        G.put(r.arr(), ramp_x(x, x + w, vr + 0.08, vr - 0.05))
        cor = lay(0.2).line([(x - 0.5, top + 1.2), (x + w + 0.5, top + 1.2)], 1.0)
        G.ink(cor.arr(), 0.35 * (1 - d * 0.6))
    elif style == 'hip':
        rh = w * rng.u(0.25, 0.4)
        r = lay(0.3).poly([(x - 1, top), (x + w * 0.28, top - rh), (x + w * 0.72, top - rh), (x + w + 1, top)])
        G.put(r.arr(), ramp_x(x, x + w, vr + 0.1, vr - 0.06))
    else:
        r = lay(0.3).poly([(x + w * 0.5, top - w * 0.42), (x + w * 0.5 + w * 0.3, top - w * 0.42 + 2), (x + w + w * 0.3, top + 2), (x + w, top)])
        G.put(r.arr(), vr - 0.06)
    for k in range(rng.i(1, 3)):
        cx = x + w * rng.u(0.15, 0.85)
        ch = rng.u(5, 10) * (1 - d * 0.3)
        cw = rng.u(3, 5)
        yb = top - (w * 0.2 if style != 'gable' else 0)
        c = lay(0.2).rect(cx, yb - ch, cx + cw, yb + 2)
        G.put(c.arr(), split(cx + cw * 0.45, air(0.66, d), air(0.46, d), 0.6))
    if win and h > 14:
        wl = lay(0.25)
        rows = max(1, int((h - 6) / 11))
        cols = max(1, int(w / 8.5))
        ww, wh = 2.4 + 0.6 * (1 - d), 4.0 + 1.2 * (1 - d)
        for i in range(rows):
            for j in range(cols):
                if rng.u() < 0.12:
                    continue
                wx = x + (j + 0.5) * w / cols - ww / 2
                wy = top + 5 + i * (h - 8) / rows
                wl.rect(wx, wy, wx + ww, wy + wh)
        G.put(wl.arr(), air(rng.u(0.36, 0.48), d))


def city_row(G, rng, x0, x1, base, hmin, hmax, wmin, wmax, d, side=0.12, skip=None):
    x = x0
    while x < x1:
        w = rng.u(wmin, wmax)
        h = rng.u(hmin, hmax)
        if skip and skip[0] < x + w and x < skip[1]:
            x = skip[1]
            continue
        house(G, rng, x, base + rng.u(-1, 1.5), w, h, d=d, side=side * rng.u(0.3, 1.0))
        x += w * (1 + side * 0.6) + rng.u(-1.5, 2)


def spire(G, x, base, s=1.0, kind='needle', d=0.5, th=40):
    """Clochers des églises de Wren : flèche, pièce montée (St Bride), lanterne (St Mary-le-Bow)."""
    tw = 7 * s
    top = base - th * s
    t = lay(0.25).rect(x - tw, top, x + tw, base)
    G.put(t.arr(), split(x + tw * 0.15, air(0.84, d), air(0.62, d)), flow=math.pi / 2, fw=0.6, ln=0.6)
    for k in range(int(th / 14)):
        o = lay(0.2).rect(x - tw * 0.35, top + 5 * s + k * 14 * s, x + tw * 0.15, top + 11 * s + k * 14 * s)
        G.put(o.arr(), air(0.42, d))
    if kind == 'needle':
        n = lay(0.25).poly([(x - tw * 0.85, top), (x + tw * 0.85, top), (x, top - 58 * s)])
        G.put(n.arr(), split(x, air(0.78, d), air(0.55, d)))
        G.ink(lay(0.1).line([(x, top - 58 * s), (x, top - 66 * s)], 0.9).arr(), 0.5)
    elif kind == 'tiered':
        y = top
        wdt = tw * 0.9
        for k in range(4):
            hh = (11 - k * 1.5) * s
            o = lay(0.2).rect(x - wdt, y - hh, x + wdt, y)
            G.put(o.arr(), split(x + wdt * 0.1, air(0.86, d), air(0.6, d)))
            for a in (-0.5, 0.15):
                op = lay(0.15).rect(x + a * wdt, y - hh * 0.8, x + (a + 0.22) * wdt, y - hh * 0.2)
                G.put(op.arr(), air(0.45, d))
            y -= hh
            wdt *= 0.78
        n = lay(0.2).poly([(x - wdt, y), (x + wdt, y), (x, y - 18 * s)])
        G.put(n.arr(), split(x, air(0.8, d), air(0.58, d)))
    elif kind == 'lantern':
        y = top
        b = lay(0.2).rect(x - tw * 0.8, y - 14 * s, x + tw * 0.8, y)
        G.put(b.arr(), split(x, air(0.86, d), air(0.6, d)))
        for k in range(3):
            c = lay(0.15).rect(x - tw * 0.6 + k * tw * 0.5, y - 12 * s, x - tw * 0.6 + k * tw * 0.5 + 1.4 * s, y - 2 * s)
            G.put(c.arr(), air(0.42, d))
        y -= 14 * s
        r = lay(0.2).ellipse(x, y - 4 * s, tw * 0.6, 6 * s)
        G.put(r.arr(), split(x, air(0.84, d), air(0.6, d)))
        n = lay(0.2).poly([(x - tw * 0.4, y - 6 * s), (x + tw * 0.4, y - 6 * s), (x, y - 30 * s)])
        G.put(n.arr(), split(x, air(0.8, d), air(0.56, d)))
    elif kind == 'cupola':
        c = lay(0.25).ellipse(x, top, tw * 0.95, tw * 0.9)
        G.put(c.arr() * (YY < top + 1), split(x - tw * 0.2, air(0.72, d), air(0.48, d)))
        G.ink(lay(0.1).line([(x, top - tw * 0.9), (x, top - tw * 0.9 - 9 * s)], 0.9).arr(), 0.5)


def st_paul(G, rng, cx, base, s=1.0, d=0.45):
    """Saint-Paul vu du fleuve (élévation sud) : nef à deux ordres, tours de l'ouest,
    péristyle, galerie de pierre, dôme de plomb à côtes, lanterne, boule et croix."""
    u = s
    bx0, bx1 = cx - 128 * u, cx + 100 * u
    bt = base - 62 * u
    stone_l, stone_s = 0.88, 0.66
    # corps de bâtiment
    body = lay(0.25).rect(bx0, bt, bx1, base)
    G.put(body.arr(), ramp_x(bx0, bx1, air(stone_l, d), air(stone_l - 0.08, d)), flow=math.pi / 2, fw=0.5, ln=0.6)
    # balustrade du toit, corniche et cordon
    G.ink(lay(0.2).line([(bx0, bt + 2), (bx1, bt + 2)], 1.1).arr(), 0.4)
    G.ink(lay(0.2).line([(bx0, bt + 30 * u), (bx1, bt + 30 * u)], 0.9).arr(), 0.32)
    # pilastres et baies des deux ordres
    win = lay(0.2)
    n = int((bx1 - bx0) / (13 * u))
    for k in range(n):
        x = bx0 + (k + 0.5) * (bx1 - bx0) / n
        if abs(x - cx) < 26 * u:
            continue
        win.rect(x - 2 * u, bt + 9 * u, x + 2 * u, bt + 24 * u)
        win.rect(x - 2.2 * u, bt + 37 * u, x + 2.2 * u, bt + 55 * u)
    G.put(win.arr(), air(0.44, d))
    pil = lay(0.15)
    for k in range(n + 1):
        x = bx0 + k * (bx1 - bx0) / n
        pil.rect(x - 1.2 * u, bt + 4 * u, x + 1.2 * u, base - 2 * u)
    G.put(pil.arr(), air(0.93, d))
    # soubassement à refends : plus sombre, joints horizontaux
    rus = lay(0.2).rect(bx0, bt + 31 * u, bx1, base)
    G.put(rus.arr() * 0.55, ramp_x(bx0, bx1, air(0.8, d), air(0.7, d)))
    jo = lay(0.1)
    for k in range(5):
        yy = bt + 35 * u + k * 5.5 * u
        jo.line([(bx0, yy), (cx - 26 * u, yy)], 0.6)
        jo.line([(cx + 26 * u, yy), (bx1, yy)], 0.6)
    G.ink(jo.arr(), 0.18)
    # portique sud demi-circulaire
    por = lay(0.25).rect(cx - 24 * u, base - 50 * u, cx + 24 * u, base)
    G.put(por.arr(), ramp_x(cx - 24 * u, cx + 24 * u, air(0.9, d), air(0.62, d)))
    cols = lay(0.15)
    for k in range(7):
        x = cx - 20 * u + k * 6.5 * u
        cols.rect(x, base - 44 * u, x + 1.6 * u, base - 4 * u)
    G.put(cols.arr(), air(0.48, d))
    ped = lay(0.25).poly([(cx - 26 * u, base - 50 * u), (cx, base - 62 * u), (cx + 26 * u, base - 50 * u)])
    G.put(ped.arr(), air(0.82, d))
    # tours de l'ouest (deux, la seconde en retrait)
    for k, (tx, dd) in enumerate(((bx0 + 26 * u, d + 0.06), (bx0 + 10 * u, d))):
        tw = 12.5 * u
        t1 = lay(0.25).rect(tx - tw, base - 118 * u, tx + tw, bt + 2)
        G.put(t1.arr(), split(tx + tw * 0.25, air(0.88, dd), air(0.6, dd)), flow=math.pi / 2, fw=0.5, ln=0.6)
        op = lay(0.15)
        for j in range(3):
            op.rect(tx - tw * 0.55 + j * tw * 0.45, base - 112 * u, tx - tw * 0.55 + j * tw * 0.45 + 2.6 * u, base - 88 * u)
        G.put(op.arr(), air(0.4, dd))
        cap = lay(0.25).poly([(tx - tw * 0.9, base - 118 * u), (tx - tw * 0.5, base - 132 * u), (tx, base - 152 * u),
                              (tx + tw * 0.5, base - 132 * u), (tx + tw * 0.9, base - 118 * u)])
        G.put(cap.arr(), split(tx, air(0.76, dd), air(0.5, dd)))
        G.ink(lay(0.1).line([(tx, base - 152 * u), (tx, base - 162 * u)], 1.0).arr(), 0.5)
    # péristyle
    pw = 52 * u
    py0, py1 = bt - 2 * u, bt - 58 * u
    peri = lay(0.25).rect(cx - pw, py1, cx + pw, py0)
    G.put(peri.arr(), ramp_x(cx - pw, cx + pw, air(0.6, d), air(0.46, d)), flow=math.pi / 2, fw=0.6, ln=0.5)
    colm = lay(0.12)
    ncol = 11
    for k in range(ncol):
        a = -math.pi / 2 + (k + 0.5) / ncol * math.pi
        x = cx + math.sin(a) * pw * 0.97
        wcol = 4.6 * u * math.cos(a) + 1.0
        colm.rect(x - wcol / 2, py1 + 6 * u, x + wcol / 2, py0 - 3 * u)
    G.put(colm.arr(), ramp_x(cx - pw, cx + pw, air(0.95, d), air(0.7, d)))
    ent = lay(0.2)
    ent.rect(cx - pw - 2 * u, py1, cx + pw + 2 * u, py1 + 6 * u)
    ent.rect(cx - pw - 3 * u, py0 - 3 * u, cx + pw + 3 * u, py0 + 1)
    G.put(ent.arr(), ramp_x(cx - pw, cx + pw, air(0.92, d), air(0.66, d)))
    # galerie de pierre (attique)
    aw = 42 * u
    at = lay(0.25).rect(cx - aw, py1 - 16 * u, cx + aw, py1)
    G.put(at.arr(), ramp_x(cx - aw, cx + aw, air(0.9, d), air(0.62, d)))
    aw2 = lay(0.15)
    for k in range(9):
        x = cx - aw + (k + 0.5) * 2 * aw / 9
        aw2.rect(x - 1.5 * u, py1 - 12 * u, x + 1.5 * u, py1 - 5 * u)
    G.put(aw2.arr(), air(0.5, d))
    # dôme : plomb, modelé sphérique, côtes
    dr = 40 * u
    dy0 = py1 - 16 * u
    dh = 50 * u
    dome = lay(0.2).ellipse(cx, dy0, dr, dh)
    dm = dome.arr() * (YY < dy0 + 0.5)
    nx = np.clip((XX - cx) / dr, -1, 1)
    ny = np.clip((YY - dy0) / dh, -1, 0)
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    lam = np.clip(nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2], 0, 1)
    G.put(dm, air(0.40 + 0.42 * lam, d), ln=0.7)
    ribs = lay(0.15)
    for k in range(-5, 6):
        a = k / 6.0
        pts = []
        for j in range(13):
            phi = j / 12 * math.pi / 2
            pts.append((cx + dr * a * math.cos(phi) * 0.985, dy0 - dh * math.sin(phi)))
        ribs.line(pts, 0.9)
    G.put(ribs.arr() * dm, air(0.82, d))
    G.light(ribs.arr() * dm * (XX < cx - 4), 0.25)
    # lanterne, boule et croix
    lt = lay(0.2).rect(cx - 7 * u, dy0 - dh - 30 * u, cx + 7 * u, dy0 - dh + 3 * u)
    G.put(lt.arr(), split(cx + 1.5 * u, air(0.88, d), air(0.58, d)))
    lc = lay(0.15)
    for k in range(3):
        lc.rect(cx - 5 * u + k * 4 * u, dy0 - dh - 24 * u, cx - 3.6 * u + k * 4 * u, dy0 - dh - 6 * u)
    G.put(lc.arr(), air(0.42, d))
    lcap = lay(0.2).ellipse(cx, dy0 - dh - 30 * u, 7.5 * u, 6 * u)
    G.put(lcap.arr() * (YY < dy0 - dh - 30 * u + 0.5), split(cx, air(0.7, d), air(0.46, d)))
    G.put(disc(cx, dy0 - dh - 40 * u, 2.6 * u, 0.8), air(0.55, d))
    cr = lay(0.1)
    cr.line([(cx, dy0 - dh - 42 * u), (cx, dy0 - dh - 54 * u)], 1.3)
    cr.line([(cx - 3.5 * u, dy0 - dh - 50 * u), (cx + 3.5 * u, dy0 - dh - 50 * u)], 1.2)
    G.ink(cr.arr(), 0.6)
    G.light(disc(cx - 0.8 * u, dy0 - dh - 41 * u, 0.9 * u, 0.6), 0.6)
    return dy0 - dh - 54 * u


# ───────────────────────────── eau ─────────────────────────────

def water(sc, rng, y0, y1, v_far=0.86, v_near=0.72, k=0.62, fade=260.0, glints=0.5, blur=(0.8, 2.6), ramp=16):
    """Fleuve : dégradé, reflet ondulé de tout ce qui est au-dessus, risées et éclats."""
    dy = YY - y0
    m = (YY >= y0).astype(np.float32)
    base = v_far + (v_near - v_far) * smooth(0, y1 - y0, dy)
    rip = fbm(rng, 10, 3, aspect=9.0) - 0.5
    src = sc.lum()
    sy = np.clip(y0 - dy * 1.05 - 1, 0, H - 1)
    sx = np.clip(XX + rip * ramp * smooth(0, 120, dy), 0, W - 1)
    r = ndi.map_coordinates(src, [sy, sx], order=1)
    r = ndi.gaussian_filter(r, blur)
    kf = k * (1 - smooth(0, fade, dy))
    v = base * (1 - kf) + (r * 0.9 + 0.04) * kf
    bands = fbm(rng, 18, 3, aspect=14.0) - 0.5
    v = v + bands * 0.05 * smooth(0, 60, dy)
    sc.put(m, v, flow=0.0, fw=0.96, ln=2.0)
    gl = (rng.r.random((H, W)) < 0.0012 * glints).astype(np.float32)
    gl = np.maximum(ndi.maximum_filter(gl, size=(1, 5)), ndi.maximum_filter(gl * (rng.r.random((H, W)) < 0.4), size=(1, 13)))
    gl = ndi.gaussian_filter(gl, (0.4, 1.6)) * 2.0
    sc.light(gl * m * smooth(0.0, 0.2, bands) * smooth(0, 40, dy), 0.8)
    return rip


# ───────────────────────────── navires ─────────────────────────────

def ship(sc, rng, x0, wl, Lh, mh, d=0.2, rip=None, flag=True):
    """Trois-mâts de la Compagnie des Indes au mouillage, étrave à droite."""
    G = Group()
    hh = Lh * 0.11
    sheer = [(x0 + Lh * 0.02, wl - hh * 2.0), (x0 + Lh * 0.10, wl - hh * 1.85), (x0 + Lh * 0.22, wl - hh * 1.42),
             (x0 + Lh * 0.55, wl - hh * 1.12), (x0 + Lh * 0.82, wl - hh * 1.22), (x0 + Lh * 0.95, wl - hh * 1.5)]
    keel = [(x0 + Lh * 1.0, wl - hh * 1.35), (x0 + Lh * 0.96, wl - hh * 0.4), (x0 + Lh * 0.9, wl + 1),
            (x0 + Lh * 0.12, wl + 1), (x0 + Lh * 0.05, wl - hh * 0.6)]
    hull = lay(0.35).poly(sheer + keel)
    hm = hull.arr()
    G.put(hm, ramp_y(wl - hh * 2, wl, air(0.42, d), air(0.24, d)), flow=0.0, fw=0.7, ln=1.2)
    # préceintes claires et batterie
    for f0, f1, v in ((0.62, 0.74, 0.78), (0.94, 1.02, 0.7)):
        b = lay(0.25).poly([(x0 + Lh * 0.08, wl - hh * (f1 + 0.25)), (x0 + Lh * 0.55, wl - hh * f1), (x0 + Lh * 0.92, wl - hh * (f1 + 0.12)),
                            (x0 + Lh * 0.92, wl - hh * (f0 + 0.1)), (x0 + Lh * 0.55, wl - hh * f0), (x0 + Lh * 0.08, wl - hh * (f0 + 0.25))])
        G.put(b.arr() * hm, air(v, d))
    ports = lay(0.2)
    for k in range(11):
        px = x0 + Lh * (0.16 + k * 0.068)
        sag = math.sin((k / 10) * math.pi) * hh * 0.08
        ports.rect(px, wl - hh * 0.98 + sag, px + Lh * 0.022, wl - hh * 0.80 + sag)
    G.put(ports.arr() * hm, air(0.2, d))
    # château arrière, galerie et fenêtres de poupe
    st = lay(0.3).poly([(x0 + Lh * 0.0, wl - hh * 2.15), (x0 + Lh * 0.09, wl - hh * 2.0), (x0 + Lh * 0.09, wl - hh * 1.3), (x0 + Lh * 0.03, wl - hh * 1.1)])
    G.put(st.arr(), air(0.6, d))
    sw = lay(0.15)
    for k in range(3):
        sw.rect(x0 + Lh * (0.018 + k * 0.024), wl - hh * 1.9, x0 + Lh * (0.03 + k * 0.024), wl - hh * 1.55)
    G.put(sw.arr(), air(0.3, d))
    # mâts, hunes, vergues, voiles ferlées ; huniers largués qui sèchent
    mx = [x0 + Lh * 0.80, x0 + Lh * 0.52, x0 + Lh * 0.25]
    mhs = [mh * 0.9, mh, mh * 0.72]
    deck = [wl - hh * 1.2, wl - hh * 1.12, wl - hh * 1.45]
    spans = [0.85, 1.0, 0.68]
    for i in range(3):
        top = deck[i] - mhs[i]
        mast = lay(0.1)
        mast.line([(mx[i], deck[i]), (mx[i], top)], 2.8 - i * 0.2)
        G.put(mast.arr(), air(0.32, d))
        G.ink(lay(0.1).line([(mx[i] + 0.6, deck[i]), (mx[i] + 0.6, top)], 1.0).arr(), 0.35)
        for f in (0.44, 0.74):
            yy = deck[i] - mhs[i] * f
            tp = lay(0.1).rect(mx[i] - 6, yy - 1.5, mx[i] + 6, yy + 1.5)
            G.put(tp.arr(), air(0.25, d))
        yards = [(0.30, 0.40), (0.58, 0.31), (0.83, 0.20)]
        for j, (f, sp) in enumerate(yards):
            yy = deck[i] - mhs[i] * f
            half = sp * Lh * spans[i] * 0.5
            yl = lay(0.15).line([(mx[i] - half, yy + 1), (mx[i] + half, yy - 1)], 1.8)
            G.put(yl.arr(), air(0.28, d))
            G.ink(lay(0.1).line([(mx[i] - half, yy + 0.6), (mx[i] + half, yy - 1.4)], 1.0).arr(), 0.55)
            if j == 1 and i == 1:
                # hunier largué : toile pendante entre deux vergues, plis verticaux
                yb = yy + (deck[i] - mhs[i] * yards[0][0] - yy) * 0.62
                hb = (yy - yb)
                sail = lay(0.6).poly([(mx[i] - half * 0.96, yy + 2), (mx[i] + half * 0.96, yy), (mx[i] + half * 1.1, yb - hb * 0.1),
                                      (mx[i] + half * 0.3, yb + 4), (mx[i] - half * 0.4, yb + 3), (mx[i] - half * 1.08, yb - hb * 0.08)])
                sm = sail.arr()
                folds = 0.5 + 0.5 * np.sin((XX - mx[i]) / (half * 0.22) + 0.6 * np.sin(YY / 18.0))
                vs = 0.9 - 0.12 * folds - 0.08 * smooth(mx[i] - half, mx[i] + half, XX) - 0.06 * smooth(yy, yb, YY)
                G.put(sm, air(vs, d), flow=math.pi / 2, fw=0.55, ln=0.7)
                G.light(sm * (folds < 0.25) * (XX < mx[i]), 0.35)
            else:
                furl = lay(0.3).ellipse(mx[i], yy + 3, half * 0.92, 2.6)
                fm = furl.arr()
                G.put(fm, ramp_y(yy, yy + 6, air(0.92, d), air(0.66, d)))
        # haubans : éventail vers les porte-haubans
        rig = lay(0.0)
        for side in (-1, 1):
            for k in range(6):
                bx = mx[i] + side * (7 + k * 3.4)
                rig.line([(bx, deck[i] + hh * 0.3), (mx[i] + side * 2, deck[i] - mhs[i] * 0.44)], 0.6)
            for k in range(3):
                bx = mx[i] + side * (5 + k * 2.4)
                rig.line([(bx, deck[i] - mhs[i] * 0.44), (mx[i] + side * 1, deck[i] - mhs[i] * 0.74)], 0.5)
        G.ink(rig.arr(), 0.5)
    # beaupré, étais, drisses
    bow = (x0 + Lh * 0.99, wl - hh * 1.45)
    bsp = (bow[0] + Lh * 0.26, bow[1] - Lh * 0.13)
    bs = lay(0.1).line([bow, bsp], 2.2)
    G.put(bs.arr(), air(0.3, d))
    st2 = lay(0.0)
    st2.line([bsp, (mx[0], deck[0] - mhs[0] * 0.95)], 0.7)
    st2.line([(bow[0] + Lh * 0.12, bow[1] - Lh * 0.06), (mx[0], deck[0] - mhs[0] * 0.72)], 0.6)
    st2.line([(mx[0], deck[0] - mhs[0] * 0.7), (mx[1], deck[1] - mhs[1] * 0.98)], 0.6)
    st2.line([(mx[1], deck[1] - mhs[1] * 0.68), (mx[2], deck[2] - mhs[2] * 0.95)], 0.6)
    st2.line([(x0 + 4, wl - hh * 2.1), (mx[2], deck[2] - mhs[2] * 0.9)], 0.6)
    G.ink(st2.arr(), 0.55)
    if flag:
        fx, fy = x0 + Lh * 0.01, wl - hh * 2.1
        G.put(lay(0.1).line([(fx, fy), (fx - 2, fy - 34)], 1.3).arr(), air(0.3, d))
        pts = []
        for k in range(12):
            t = k / 11
            pts.append((fx - 2 - t * 40, fy - 33 + 4 * math.sin(t * 5) + t * 6))
        for k in range(11, -1, -1):
            t = k / 11
            pts.append((fx - 2 - t * 40, fy - 17 + 4 * math.sin(t * 5 + 0.5) + t * 3))
        fm = lay(0.3).poly(pts).arr()
        G.put(fm, air(0.42 + 0.12 * np.sin((XX - fx) / 7.0), d))
        # flamme au grand mât
        top = deck[1] - mhs[1]
        pp = [(mx[1] - 2 - t * 46, top + 3 + 3 * math.sin(t * 6) + t * 7 - 2.2 * (1 - t)) for t in np.linspace(0, 1, 14)]
        pp += [(mx[1] - 2 - t * 46, top + 3 + 3 * math.sin(t * 6) + t * 7 + 2.2 * (1 - t)) for t in np.linspace(1, 0, 14)]
        G.put(lay(0.2).poly(pp).arr(), air(0.4, d))
    G.reflect(sc, wl, k=0.6, ripple=rip, amp=10, darken=0.85, fade=mh * 0.8)
    G.commit(sc)


def barge(sc, rng, x0, wl, Lh, mh, d=0.3, rip=None, flip=1):
    """Gabare de la Tamise à livarde : grande voile sombre, coque basse."""
    G = Group()
    hull = lay(0.4).poly([(x0, wl - 9), (x0 + Lh, wl - 12), (x0 + Lh * 0.94, wl + 2), (x0 + Lh * 0.06, wl + 2)])
    G.put(hull.arr(), air(0.3, d), flow=0.0, fw=0.7)
    mx = x0 + Lh * (0.42 if flip > 0 else 0.58)
    G.put(lay(0.1).line([(mx, wl - 10), (mx + 1.5 * flip, wl - mh)], 2.0).arr(), air(0.3, d))
    sp = [(mx + 2 * flip, wl - 16), (mx + 2 * flip, wl - mh + 6), (mx + Lh * 0.62 * flip, wl - mh * 0.98), (mx + Lh * 0.5 * flip, wl - 18)]
    sm = lay(0.5).poly(sp).arr()
    t = np.clip((XX - mx) * flip / (Lh * 0.6), 0, 1)
    G.put(sm, air(0.5 - 0.14 * t + 0.06 * np.sin(YY / 9.0), d), flow=math.pi / 2 - 0.3 * flip, fw=0.6, ln=0.8)
    G.ink(lay(0.0).line([(mx + 2 * flip, wl - 14), (mx + Lh * 0.62 * flip, wl - mh * 0.98)], 1.1).arr(), 0.5)
    jib = lay(0.5).poly([(mx - 3 * flip, wl - mh * 0.8), (mx - 3 * flip, wl - 14), (mx - Lh * 0.36 * flip, wl - 13)])
    G.put(jib.arr(), air(0.82, d))
    G.reflect(sc, wl, k=0.55, ripple=rip, amp=7, fade=mh * 0.7)
    G.commit(sc)


def wherry(sc, rng, x0, wl, Lh, d=0.1, rip=None, people=(('rameur', 0.42), ('dame', 0.7))):
    """Bachot de passeur : coque effilée, rameur, passagers."""
    G = Group()
    hull = lay(0.4).poly([(x0, wl - 7), (x0 + Lh * 0.5, wl - 4), (x0 + Lh, wl - 8), (x0 + Lh * 0.9, wl + 1), (x0 + Lh * 0.1, wl + 1)])
    G.put(hull.arr(), ramp_y(wl - 8, wl, air(0.38, d), air(0.24, d)), flow=0.0, fw=0.8)
    G.put(lay(0.3).line([(x0 + 2, wl - 6.5), (x0 + Lh * 0.5, wl - 3.5), (x0 + Lh - 2, wl - 7.5)], 1.2).arr(), air(0.8, d))
    for kind, f in people:
        h = Lh * (0.32 if kind == 'rameur' else 0.36)
        fx = x0 + Lh * f
        if kind == 'rameur':
            figure(G, rng, fx, wl - 5, h, 'rameur', d)
            oar = lay(0.0)
            oar.line([(fx + 1, wl - h * 0.55), (fx - Lh * 0.42, wl + 7)], 1.1)
            oar.line([(fx + 3, wl - h * 0.55), (fx + Lh * 0.34, wl + 9)], 1.1)
            G.ink(oar.arr(), 0.7)
        else:
            figure(G, rng, fx, wl - 5, h, kind, d, seated=True)
    G.reflect(sc, wl, k=0.55, ripple=rip, amp=6, fade=30)
    G.commit(sc)


# ───────────────────────────── personnages ─────────────────────────────

def figure(G, rng, x, foot, h, kind='homme', d=0.0, seated=False, coat=None, facing=1, cast=None):
    """Petits personnages du milieu du XVIIIe siècle, lumière à gauche.
    kind : homme (tricorne, habit à basques, canne), dame (robe à paniers, bergère,
    ombrelle), enfant (cerceau), rameur."""
    f = facing
    dk = lambda v: air(v, d)
    wob = 0.35 if h > 40 else 0.2
    P = lambda pts: lay(wob).poly(pts).arr()
    if kind in ('homme', 'enfant', 'rameur'):
        cv = coat if coat is not None else rng.u(0.3, 0.5)
        hd = h * 0.064
        hy = foot - h * 0.865
        sh_y, wa_y, hem_y = foot - h * 0.79, foot - h * 0.55, foot - h * (0.27 if not seated else 0.08)
        if not seated:
            # bas blancs, culotte, souliers
            for sx in (-1, 1):
                G.put(P([(x + sx * h * 0.045 - h * 0.022, hem_y), (x + sx * h * 0.045 + h * 0.022, hem_y),
                         (x + sx * h * 0.05 + h * 0.016, foot - 2), (x + sx * h * 0.05 - h * 0.016, foot - 2)]),
                      dk(0.9 if sx < 0 else 0.74))
                G.put(disc(x + sx * h * 0.055 + f * h * 0.012, foot - 1.2, h * 0.026, 0.6), dk(0.16))
            G.put(P([(x - h * 0.085, hem_y - h * 0.04), (x + h * 0.085, hem_y - h * 0.04), (x + h * 0.08, hem_y + h * 0.02), (x - h * 0.08, hem_y + h * 0.02)]), dk(cv + 0.16))
        # habit : épaules étroites, taille marquée, basques évasées
        body = [(x - h * 0.10, sh_y), (x + h * 0.10, sh_y), (x + h * 0.085, wa_y), (x + h * 0.16, hem_y),
                (x + h * 0.02, hem_y + h * 0.015), (x - h * 0.02, hem_y + h * 0.015), (x - h * 0.16, hem_y), (x - h * 0.085, wa_y)]
        G.put(P(body), split(x - h * 0.02, dk(cv + 0.14), dk(cv - 0.1), h * 0.05))
        # gilet clair et jabot
        G.put(P([(x - h * 0.03, sh_y + h * 0.01), (x + h * 0.035, sh_y + h * 0.01), (x + h * 0.03, wa_y + h * 0.08), (x - h * 0.025, wa_y + h * 0.08)]), dk(min(0.92, cv + 0.42)))
        G.light(P([(x - h * 0.015, sh_y), (x + h * 0.012, sh_y), (x + h * 0.004, sh_y + h * 0.07)]), 0.5)
        # bras
        if kind == 'rameur':
            G.put(lay(0.2).line([(x, sh_y + h * 0.04), (x + f * h * 0.2, sh_y + h * 0.18)], h * 0.05).arr(), dk(cv - 0.04))
        else:
            G.put(lay(0.25).line([(x - h * 0.1, sh_y + h * 0.03), (x - h * 0.125, wa_y + h * 0.02)], h * 0.048).arr(), dk(cv + 0.06))
            G.put(lay(0.25).line([(x + h * 0.1, sh_y + h * 0.03), (x + h * 0.13, wa_y + h * 0.06)], h * 0.048).arr(), dk(cv - 0.12))
            G.put(disc(x + h * 0.135, wa_y + h * 0.08, h * 0.022, 0.6), dk(0.8))
            if kind == 'homme':
                G.ink(lay(0.1).line([(x + h * 0.14, wa_y + h * 0.07), (x + h * 0.2, foot)], max(0.8, h * 0.012)).arr(), 0.7)
        # tête, perruque poudrée, catogan
        G.put(disc(x + f * hd * 0.15, hy, hd, 0.6), split(x, dk(0.9), dk(0.68), hd * 0.4))
        G.put(disc(x - f * hd * 0.6, hy + hd * 0.1, hd * 0.6, 0.6), dk(0.96))
        G.put(lay(0.1).line([(x - f * hd * 0.9, hy + hd * 0.5), (x - f * hd * 1.2, hy + hd * 1.6)], hd * 0.45).arr(), dk(0.2))
        # tricorne (ou bonnet du rameur)
        if kind == 'rameur':
            G.put(disc(x, hy - hd * 0.65, hd * 0.75, 0.6) * (YY < hy - hd * 0.3), dk(0.3))
        else:
            G.put(P([(x - hd * 1.9, hy - hd * 0.55), (x + hd * 1.9, hy - hd * 0.55), (x + hd * 1.1, hy - hd * 1.45),
                     (x, hy - hd * 1.15), (x - hd * 1.2, hy - hd * 1.5)]), split(x - hd, dk(0.3), dk(0.12), hd * 0.6))
        if kind == 'enfant':
            G.ink(_ring(x + f * h * 0.32, foot - h * 0.21, h * 0.2, max(0.8, h * 0.02)), 0.75)
            G.ink(lay(0.1).line([(x + h * 0.13, wa_y + h * 0.07), (x + f * h * 0.3, foot - h * 0.3)], 0.8).arr(), 0.7)
    elif kind == 'dame':
        dv = coat if coat is not None else rng.u(0.74, 0.9)
        hd = h * 0.06
        hy = foot - h * 0.875
        sh_y, wa_y, hip_y = foot - h * 0.80, foot - h * 0.6, foot - h * 0.53
        if seated:
            foot = foot + h * 0.1
        hw = h * 0.22
        skirt = [(x - h * 0.06, wa_y), (x + h * 0.06, wa_y), (x + hw * 0.9, hip_y - h * 0.02), (x + hw, hip_y + h * 0.04),
                 (x + hw * 0.98, foot - h * 0.02), (x + hw * 1.04, foot), (x - hw * 1.04, foot), (x - hw * 0.98, foot - h * 0.02),
                 (x - hw, hip_y + h * 0.04), (x - hw * 0.9, hip_y - h * 0.02)]
        sm = P(skirt)
        folds = 0.5 + 0.5 * np.sin((XX - x) / max(1.0, h * 0.035) + 0.4 * np.sin(YY / max(1.0, h * 0.08)))
        sv = split(x - hw * 0.15, dk(dv), dk(dv - 0.24), hw * 0.55) - 0.07 * folds * smooth(hip_y, foot, YY)
        G.put(sm, sv)
        G.light(sm * (XX < x - hw * 0.35) * (folds < 0.3) * (YY > hip_y), 0.3)
        # tablier ou pièce d'estomac
        G.put(P([(x - h * 0.045, wa_y + h * 0.02), (x + h * 0.045, wa_y + h * 0.02), (x + h * 0.09, foot - h * 0.08), (x - h * 0.09, foot - h * 0.08)]), dk(min(0.96, dv + 0.08)))
        # corsage pointu
        G.put(P([(x - h * 0.085, sh_y), (x + h * 0.085, sh_y), (x + h * 0.055, wa_y), (x, wa_y + h * 0.05), (x - h * 0.055, wa_y)]),
              split(x, dk(dv - 0.04), dk(dv - 0.28), h * 0.03))
        G.put(P([(x - h * 0.09, sh_y + h * 0.005), (x + h * 0.09, sh_y + h * 0.005), (x, sh_y + h * 0.075)]), dk(0.97))
        G.light(P([(x - h * 0.08, sh_y + h * 0.005), (x, sh_y + h * 0.005), (x - h * 0.02, sh_y + h * 0.05)]), 0.5)
        # bras et engageantes de dentelle
        G.put(lay(0.25).line([(x - h * 0.085, sh_y + h * 0.02), (x - h * 0.11, wa_y - h * 0.01)], h * 0.042).arr(), dk(dv - 0.02))
        G.put(disc(x - h * 0.115, wa_y, h * 0.03, 0.6), dk(0.97))
        G.put(lay(0.25).line([(x + h * 0.085, sh_y + h * 0.02), (x + h * 0.12, wa_y - h * 0.03)], h * 0.042).arr(), dk(dv - 0.22))
        G.put(disc(x + h * 0.125, wa_y - h * 0.02, h * 0.03, 0.6), dk(0.86))
        # tête, chignon poudré, bergère
        G.put(disc(x, hy, hd, 0.6), split(x, dk(0.92), dk(0.7), hd * 0.4))
        G.put(disc(x - f * hd * 0.3, hy - hd * 0.4, hd * 0.75, 0.6) * (YY < hy - hd * 0.1), dk(0.95))
        if not seated and rng.u() < 0.55:
            G.put(lay(0.2).ellipse(x, hy - hd * 0.95, hd * 2.6, hd * 0.42).arr(), split(x, dk(0.86), dk(0.6), hd))
            G.put(disc(x, hy - hd * 1.15, hd * 0.65, 0.6) * (YY < hy - hd * 0.95), dk(0.8))
        elif not seated:
            # ombrelle tenue dans la main droite
            hx, hyy = x + h * 0.125, wa_y - h * 0.03
            tx, ty = x + h * 0.02, foot - h * 1.1
            G.ink(lay(0.0).line([(hx, hyy), (tx, ty + h * 0.02)], max(0.8, h * 0.011)).arr(), 0.75)
            cw, ch = h * 0.26, h * 0.12
            can = [(tx + math.cos(a) * cw, ty + ch * 0.6 + math.sin(a) * ch) for a in np.linspace(math.pi, 2 * math.pi, 16)]
            can += [(tx + cw * 0.8, ty + ch * 0.75), (tx + cw * 0.4, ty + ch * 0.62), (tx, ty + ch * 0.75), (tx - cw * 0.4, ty + ch * 0.62), (tx - cw * 0.8, ty + ch * 0.75)]
            G.put(P(can), split(tx - cw * 0.2, dk(0.74), dk(0.42), cw * 0.5))
            G.ink(lay(0.0).line([(tx, ty - ch * 0.45), (tx, ty - ch * 0.75)], 0.9).arr(), 0.7)


def _ring(cx, cy, r, w=0.9):
    return np.clip(1 - np.abs(np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2) - r) / (w * 0.6), 0, 1)


def cast_shadow(sc, x, foot, h, length=1.0, a=0.2, angle=0.06):
    """Ombre portée courte et douce (soleil haut à gauche : l'ombre part à droite)."""
    L = h * 0.42 * length
    m = disc(0, 0, 1)  # placeholder vide
    m = np.zeros((H, W), np.float32)
    _blob_into(m, x + L * 0.55, foot + 1 + L * angle, L * 0.55, max(1.5, h * 0.035), 1.0)
    _blob_into(m, x + h * 0.02, foot, h * 0.12, max(1.2, h * 0.025), 0.8)
    m = np.clip(m, 0, 1)
    v = sc.lum() * (1 - a)
    sc.put(m * 0.9, v)


# ─────────────────────────── terrasse ───────────────────────────

def balustrade(sc, rng, hz, line0, line1, x_start=0, x_end=W, s0=17.0, pier_every=9, d0=0.0, lamps=(), lamp_h=120):
    """Balustrade de pierre en perspective. line = (y à gauche, y à droite) du sol."""
    gy = lambda x: line0 + (line1 - line0) * (x / W)
    scale = lambda x: (gy(x) - hz) / (gy(0) - hz)
    hb = lambda x: 0.135 * (gy(x) - hz)
    # plinthe, main courante
    pl, pt, rl, rt = lay(0.25), lay(0.25), lay(0.25), lay(0.25)
    xs = np.linspace(x_start, x_end, 40)
    def band(f0, f1):
        top = [(x, gy(x) - hb(x) * f1) for x in xs]
        bot = [(x, gy(x) - hb(x) * f0) for x in xs[::-1]]
        return top + bot
    G = Group()
    x = x_start + 2
    k = 0
    lamp_xs = []
    while x < x_end:
        sc_ = scale(x)
        if k % pier_every == 0:
            pw = s0 * 1.25 * sc_
            g = gy(x)
            hp = hb(x) * 1.06
            pier = lay(0.25).rect(x - pw * 0.5, g - hp, x + pw * 0.5, g)
            G.put(pier.arr(), ramp_x(x - pw * 0.5, x + pw * 0.5, 0.93, 0.76), flow=math.pi / 2, fw=0.4, ln=0.6)
            sidew = pw * 0.25
            sd = lay(0.25).poly([(x + pw * 0.5, g - hp), (x + pw * 0.5 + sidew, g - hp - sidew * 0.2), (x + pw * 0.5 + sidew, g - sidew * 0.2), (x + pw * 0.5, g)])
            G.put(sd.arr(), 0.56)
            cap = lay(0.25).rect(x - pw * 0.62, g - hp - hb(x) * 0.1, x + pw * 0.62, g - hp)
            G.put(cap.arr(), 0.95)
            G.light(cap.arr() * (YY < g - hp - hb(x) * 0.06), 0.4)
            lamp_xs.append((x, g - hp - hb(x) * 0.1, sc_))
            x += pw * 0.85
        else:
            bw = s0 * 0.42 * sc_
            g = gy(x)
            yb, yt = g - hb(x) * 0.16, g - hb(x) * 0.84
            prof = [(0.0, 0.62), (0.08, 0.62), (0.12, 0.5), (0.22, 0.9), (0.38, 1.0), (0.55, 0.62), (0.72, 0.36), (0.8, 0.5), (0.88, 0.38), (0.94, 0.62), (1.0, 0.62)]
            left = [(x - bw * p, yb - (yb - yt) * t) for t, p in prof]
            right = [(x + bw * p, yb - (yb - yt) * t) for t, p in prof[::-1]]
            bal = lay(0.15).poly(left + right)
            bm = bal.arr()
            G.put(bm, ramp_x(x - bw * 0.7, x + bw * 0.9, 0.95, 0.52), flow=math.pi / 2, fw=0.5, ln=0.5)
            G.light(bm * (XX < x - bw * 0.35), 0.3)
        x += s0 * sc_
        k += 1
    # main courante et plinthe par-dessus
    rail = lay(0.2).poly(band(0.84, 1.0))
    G.put(rail.arr(), ramp_y(gy(0) - hb(0), gy(0) - hb(0) * 0.84, 0.97, 0.78), flow=math.atan2(line1 - line0, W), fw=0.8, ln=1.6)
    rtop = lay(0.2).poly(band(0.97, 1.03))
    G.put(rtop.arr(), 0.98)
    G.light(rtop.arr(), 0.45)
    G.ink(lay(0.1).line([(xx, gy(xx) - hb(xx) * 0.84) for xx in xs], 0.9).arr(), 0.35)
    plin = lay(0.2).poly(band(0.0, 0.16))
    G.put(plin.arr(), 0.8, flow=math.atan2(line1 - line0, W), fw=0.8, ln=1.6)
    G.ink(lay(0.1).line([(xx, gy(xx) - hb(xx) * 0.16) for xx in xs], 0.9).arr(), 0.3)
    G.commit(sc)
    for i in lamps:
        if i < len(lamp_xs):
            lx, ly, s_ = lamp_xs[i]
            lamp(sc, lx, ly, lamp_h * s_)
    return gy, hb


def lamp(sc, x, base, h):
    """Réverbère à huile sur fût de fer : lanterne vitrée, couronne, crosse."""
    G = Group()
    post = lay(0.1)
    post.line([(x, base), (x, base - h * 0.78)], max(1.4, h * 0.035))
    G.put(post.arr(), 0.22)
    G.put(lay(0.1).rect(x - h * 0.05, base - h * 0.08, x + h * 0.05, base).arr(), 0.3)
    gl = lay(0.25).poly([(x - h * 0.09, base - h * 0.78), (x + h * 0.09, base - h * 0.78), (x + h * 0.12, base - h * 0.95), (x - h * 0.12, base - h * 0.95)])
    G.put(gl.arr(), split(x, 0.9, 0.7, h * 0.03))
    G.light(gl.arr() * (XX < x), 0.5)
    cr = lay(0.25).poly([(x - h * 0.14, base - h * 0.95), (x + h * 0.14, base - h * 0.95), (x, base - h * 1.06)])
    G.put(cr.arr(), 0.25)
    G.ink(lay(0.1).line([(x - h * 0.09, base - h * 0.78), (x - h * 0.12, base - h * 0.95)], 0.8).arr(), 0.6)
    G.ink(lay(0.1).line([(x + h * 0.09, base - h * 0.78), (x + h * 0.12, base - h * 0.95)], 0.8).arr(), 0.6)
    G.ink(lay(0.1).line([(x, base - h * 1.06), (x, base - h * 1.12)], 1.0).arr(), 0.7)
    G.commit(sc)


# ───────────────────────────── arbre ─────────────────────────────

def tree(sc, rng, x, base, h, w, v_lit=0.72, v_dark=0.24, trunk=True, env=None, density=1.0):
    """Arbre en repoussoir peint par touffes : chaque touffe est un amas de touches,
    éclairé en haut à gauche ; trouées de ciel sur les bords ; branches dans les trouées."""
    G = Group()
    cy0 = base - h * 0.66
    if trunk:
        tp = []
        n = 24
        for i in range(n + 1):
            t = i / n
            tp.append((x - w * (0.05 - 0.026 * t + 0.045 * (1 - t) ** 6) + math.sin(t * 4.2) * w * 0.035 + t * w * 0.05, base - h * 0.62 * t))
        for i in range(n, -1, -1):
            t = i / n
            tp.append((x + w * (0.055 - 0.028 * t + 0.05 * (1 - t) ** 6) + math.sin(t * 4.2) * w * 0.035 + t * w * 0.05, base - h * 0.62 * t))
        tm = lay(0.6).poly(tp).arr()
        G.put(tm, split(x - w * 0.02, 0.48, 0.22, w * 0.03), flow=math.pi / 2, fw=0.8, ln=0.8)
        bark = lay(0.3)
        for k in range(7):
            bx = x + rng.u(-0.03, 0.03) * w
            by = base - rng.u(0.05, 0.55) * h
            bark.line([(bx, by), (bx + rng.u(-1, 1), by - rng.u(10, 26))], 0.8)
        G.ink(bark.arr() * tm, 0.3)
        limbs = lay(0.5)
        for a, L, wd in ((-2.2, 0.36, 0.028), (-1.2, 0.32, 0.024), (-2.7, 0.3, 0.02), (-0.7, 0.26, 0.018), (-1.7, 0.4, 0.026)):
            p0 = (x + rng.u(-0.01, 0.01) * w, base - h * 0.55)
            p1 = (p0[0] + math.cos(a) * L * w * 1.2, p0[1] + math.sin(a) * L * h * 0.7)
            pm = ((p0[0] + p1[0]) / 2 + rng.u(-6, 6), (p0[1] + p1[1]) / 2 + rng.u(-6, 6))
            limbs.line([p0, pm, p1], wd * w)
        G.put(limbs.arr(), 0.28)
    # enveloppe du houppier
    if env is None:
        env = [(x, cy0, w * 0.5, h * 0.32)]
    clumps = []
    for (ex, ey, erx, ery) in env:
        nc = int((10 + erx * ery / 1500) * density)
        for _ in range(nc):
            a = rng.u(0, 2 * math.pi)
            r = rng.u(0, 1) ** 0.55
            cx = ex + math.cos(a) * r * erx
            cy = ey + math.sin(a) * r * ery
            rr = rng.u(0.16, 0.3) * min(erx, ery) * 0.9 + 10
            clumps.append((cx, cy, rr, ex, ey, erx, ery))
    # du fond vers l'avant : les touffes du bas et du centre d'abord (plus sombres)
    clumps.sort(key=lambda c: (-(c[1] - c[4]) / c[6]) + 0.4 * abs(c[0] - c[3]) / c[5])
    for cx, cy, rr, ex, ey, erx, ery in clumps:
        M = np.zeros((H, W), np.float32)
        V = np.zeros((H, W), np.float32)
        nd = int(18 + rr * 1.1)
        depth = float(np.clip(0.5 + 0.5 * (cy - ey) / ery, 0, 1) * 0.5 + 0.5 * np.clip(1 - abs(cx - ex) / erx, 0, 1) * 0.6)
        for _ in range(nd):
            a = rng.u(0, 2 * math.pi)
            r = rng.u(0, 1) ** 0.7 * rr
            dx, dy = math.cos(a) * r * 1.1, math.sin(a) * r * 0.85
            nx, ny = dx / rr, dy / rr
            nz = math.sqrt(max(0.05, 1 - 0.6 * (nx * nx + ny * ny)))
            lam = max(0.0, nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2])
            v = v_dark + (v_lit - v_dark) * lam ** 1.4 * (1 - 0.55 * depth) + rng.n(0.035)
            dab_into(M, V, cx + dx, cy + dy, rng.u(0.14, 0.3) * rr, v, soft=1.0, wob=0.25, rng=rng)
            if lam > 0.85 and depth < 0.5 and rng.u() < 0.5:
                G.light(disc(cx + dx, cy + dy, rr * 0.08, 0.8), 0.25)
        G.put(M, V, fw=0.0, ln=0.4)
    G.commit(sc)
