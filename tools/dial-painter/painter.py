"""WristMasters — peinture à touches multi-échelles.

Principe (d'après Hertzmann, « Painterly Rendering with Curved Brush Strokes
of Multiple Sizes », 1998) : on modèle d'abord une image de référence plan par
plan (valeurs, lumière, perspective atmosphérique), puis on la repeint avec des
touches de pinceau, de la plus large à la plus fine. Chaque passe ne retouche
que là où la toile s'écarte encore du modèle : les grandes masses restent
larges et souples, les détails reçoivent des touches fines. Suivent la plume
(traits fins), les rehauts et la texture du support (émail, aquatinte).

Pas d'IA, pas d'image source : tout est calculé.
"""
import math
from contextlib import contextmanager
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, Layer, fbm, smooth, hexrgb


def col3(c):
    if isinstance(c, str):
        return hexrgb(c)
    c = np.asarray(c, np.float32)
    return np.full(3, float(c), np.float32) if c.ndim == 0 else c


# ───────────────────────────── matières ─────────────────────────────
# Chaque pixel de la scène garde la matière qui l'a peint en dernier : c'est ce qui permet
# de rendre une même planche en couleurs (Cloisonné, Grand Feu) à partir d'un modelé en valeurs.
MATERIALS = ['vide', 'ciel', 'nuage', 'lumiere', 'eau', 'pierre', 'toit', 'bois', 'toile',
             'feuillage', 'sol', 'neige', 'montagne', 'figure', 'metal', 'vitre', 'brique']
MAT = {name: i for i, name in enumerate(MATERIALS)}
_CURRENT = [0]


@contextmanager
def material(name):
    """Tout ce qui est peint dans ce bloc est marqué de cette matière."""
    _CURRENT.append(MAT[name])
    try:
        yield
    finally:
        _CURRENT.pop()


def current_material():
    return _CURRENT[-1]


class Scene:
    """Image de référence (1 = clair) + champs qui guident le pinceau."""

    def __init__(self, ground=1.0):
        self.img = np.broadcast_to(col3(ground), (H, W, 3)).astype(np.float32).copy()
        self.flow = np.zeros((H, W), np.float32)      # orientation imposée (rad)
        self.fw = np.zeros((H, W), np.float32)        # poids de l'orientation imposée
        self.lenm = np.ones((H, W), np.float32)       # longueur relative des touches
        self.pen = np.zeros((H, W), np.float32)       # plume : couverture 0..1
        self.hi = np.zeros((H, W), np.float32)        # rehauts : 0..1
        self.mat = np.zeros((H, W), np.uint8)         # matière (MATERIALS)

    def put(self, m, c, flow=None, fw=0.85, ln=None):
        """Peint la couleur ou la carte c à travers le masque m (0..1), par-dessus."""
        if isinstance(c, str):
            c = hexrgb(c)
        c = np.asarray(c, np.float32)
        if c.ndim == 0:
            c = np.full(3, float(c), np.float32)
        if c.ndim == 1:
            c = c[None, None, :]
        elif c.ndim == 2:
            c = c[..., None]
        mm = np.clip(m, 0, 1)[..., None]
        self.img = self.img * (1 - mm) + c * mm
        # ce qui est peint par-dessus recouvre la plume et les rehauts dessous
        self.pen *= (1 - mm[..., 0])
        self.hi *= (1 - mm[..., 0])
        sel = m > 0.5
        if current_material():
            self.mat[sel] = current_material()
        if flow is not None:
            self.flow[sel] = np.broadcast_to(np.asarray(flow, np.float32), (H, W))[sel]
            self.fw[sel] = np.broadcast_to(np.asarray(fw, np.float32), (H, W))[sel]
        if ln is not None:
            self.lenm[sel] = np.broadcast_to(np.asarray(ln, np.float32), (H, W))[sel]

    def ink(self, m, a=1.0):
        self.pen = 1 - (1 - self.pen) * (1 - np.clip(m * a, 0, 1))

    def light(self, m, a=1.0):
        self.hi = np.maximum(self.hi, np.clip(m * a, 0, 1))

    def lum(self):
        return self.img.mean(-1)


def _orient(ref_l, Rs, flow, fw, dflt):
    """Champ d'orientation des touches : tangente aux contours (tenseur de structure),
    à défaut l'orientation imposée par la scène, à défaut un geste par défaut."""
    gy = ndi.sobel(ref_l, 0) / 8.0
    gx = ndi.sobel(ref_l, 1) / 8.0
    s = max(1.0, Rs * 0.8)
    j11 = ndi.gaussian_filter(gx * gx, s)
    j12 = ndi.gaussian_filter(gx * gy, s)
    j22 = ndi.gaussian_filter(gy * gy, s)
    # angle doublé du gradient dominant ; la tangente est à +90°, soit 2θ + π
    c2 = -(j11 - j22)
    s2 = -(2 * j12)
    strength = np.sqrt(c2 * c2 + s2 * s2)
    wi = strength / (strength + 2.5e-5)
    n = strength + 1e-12
    c2, s2 = c2 / n, s2 / n
    dc, ds = np.cos(2 * dflt), np.sin(2 * dflt)
    c2 = wi * c2 + (1 - wi) * dc
    s2 = wi * s2 + (1 - wi) * ds
    fc, fs = np.cos(2 * flow), np.sin(2 * flow)
    c2 = (1 - fw) * c2 + fw * fc
    s2 = (1 - fw) * s2 + fw * fs
    th = 0.5 * np.arctan2(s2, c2)
    return np.cos(th).astype(np.float32), np.sin(th).astype(np.float32)


def paint(scene, rng, radii=(18, 9, 4.5, 2.2, 1.1), T=0.045, S=2, fsig=0.5, fc=0.6,
          maxlen=9, minlen=2, alpha=(0.92, 0.9, 0.88, 0.85, 0.85), vj=0.012, bristle=True,
          start=None, dflt_angle=0.62):
    """Repeint scene.img en touches. Renvoie l'image (H, W, 3)."""
    ref0 = ndi.zoom(scene.img, (S, S, 1), order=1)
    H2, W2 = ref0.shape[:2]
    flow = ndi.zoom(scene.flow, S, order=0)
    fw = ndi.zoom(scene.fw, S, order=0)
    lenm = ndi.zoom(scene.lenm, S, order=0)
    dn = fbm(rng, 90 * S, 3, h=H2, w=W2)
    dflt = (dflt_angle + 0.9 * (dn - 0.5)).astype(np.float32)
    if start is None:
        start = ndi.gaussian_filter(scene.img, (40, 40, 0)).mean((0, 1))
    canvas = Image.new('RGB', (W2, H2), tuple(int(255 * float(x)) for x in col3(start)))
    draw = ImageDraw.Draw(canvas, 'RGBA')
    nstrokes = 0
    for li, R in enumerate(radii):
        Rs = R * S
        ref = ndi.gaussian_filter(ref0, (fsig * Rs, fsig * Rs, 0))
        refl = ref.mean(-1)
        dx, dy = _orient(refl, Rs, flow, fw, dflt)
        C = np.asarray(canvas, np.float32) / 255.0
        D = np.sqrt(((C - ref) ** 2).sum(-1))
        g = max(2, int(round(Rs)))
        gh, gw = H2 // g, W2 // g
        Dc = D[:gh * g, :gw * g].reshape(gh, g, gw, g).transpose(0, 2, 1, 3).reshape(gh, gw, g * g)
        mean = Dc.mean(-1)
        am = Dc.argmax(-1)
        cells = np.argwhere(mean > T)
        rng.r.shuffle(cells)
        strokes = []
        a = alpha[min(li, len(alpha) - 1)]
        for i, j in cells:
            k = am[i, j]
            y = i * g + k // g
            x = j * g + k % g
            col = ref[y, x] + rng.r.normal(0, vj)
            pts = [(float(x), float(y))]
            cx, cy = float(x), float(y)
            px, py = 0.0, 0.0
            L = int(maxlen * lenm[y, x])
            for n in range(L):
                ix, iy = int(cx), int(cy)
                if n > minlen:
                    rc = ref[iy, ix]
                    if D[iy, ix] < math.sqrt(float(((rc - col) ** 2).sum())):
                        break
                ux, uy = float(dx[iy, ix]), float(dy[iy, ix])
                if n == 0:
                    if rng.r.random() < 0.5:
                        ux, uy = -ux, -uy
                else:
                    if ux * px + uy * py < 0:
                        ux, uy = -ux, -uy
                    ux, uy = fc * ux + (1 - fc) * px, fc * uy + (1 - fc) * py
                    nn = math.hypot(ux, uy) or 1.0
                    ux, uy = ux / nn, uy / nn
                cx += Rs * ux
                cy += Rs * uy
                if not (0 <= cx < W2 - 1 and 0 <= cy < H2 - 1):
                    break
                pts.append((cx, cy))
                px, py = ux, uy
            strokes.append((pts, col))
        order = rng.r.permutation(len(strokes))
        wd = max(1, int(round(2 * Rs * 0.92)))
        for o in order:
            pts, col = strokes[o]
            c = tuple(int(255 * min(1.0, max(0.0, float(v)))) for v in col)
            fill = c + (int(255 * a),)
            if len(pts) == 1:
                x, y = pts[0]
                draw.ellipse([x - wd / 2, y - wd / 2, x + wd / 2, y + wd / 2], fill=fill)
                continue
            draw.line(pts, fill=fill, width=wd, joint='curve')
            for (x, y) in (pts[0], pts[-1]):
                draw.ellipse([x - wd / 2, y - wd / 2, x + wd / 2, y + wd / 2], fill=fill)
            if bristle and Rs >= 3:
                # poils du pinceau : quelques filets plus clairs ou plus sombres dans la touche
                for b in range(3):
                    off = rng.r.uniform(-0.75, 0.75) * Rs
                    q = []
                    for t in range(len(pts)):
                        x0, y0 = pts[max(0, t - 1)]
                        x1, y1 = pts[min(len(pts) - 1, t + 1)]
                        nx, ny = -(y1 - y0), (x1 - x0)
                        nn = math.hypot(nx, ny) or 1.0
                        q.append((pts[t][0] + nx / nn * off, pts[t][1] + ny / nn * off))
                    dv = rng.r.normal(0, 0.035)
                    cb = tuple(int(255 * min(1.0, max(0.0, float(v) + dv))) for v in col)
                    draw.line(q, fill=cb + (48,), width=max(1, int(Rs * 0.28)), joint='curve')
        nstrokes += len(strokes)
    out = canvas.resize((W, H), Image.LANCZOS)
    paint.last_count = nstrokes
    return np.asarray(out, np.float32) / 255.0


def lut(L, stops):
    """Valeur (0 sombre .. 1 clair) → couleur, par une suite d'arrêts [(v, '#hex'), …]."""
    vs = np.array([s[0] for s in stops], np.float32)
    cs = np.stack([col3(s[1]) for s in stops])
    out = np.empty(L.shape + (3,), np.float32)
    for ch in range(3):
        out[..., ch] = np.interp(L, vs, cs[:, ch])
    return out


def aquatint(rng, L, amount=0.08, scale=1.6):
    """Grain d'aquatinte : réseau de résine fondue, visible dans les demi-teintes."""
    n = rng.r.random((H, W)).astype(np.float32)
    n = ndi.gaussian_filter(n, scale)
    n = (n - n.mean()) / (n.std() + 1e-6)
    cell = smooth(-0.2, 0.4, n)
    mid = 4 * L * (1 - L)
    return np.clip(L - amount * mid * (cell - 0.5) * 2, 0, 1)


def enamel(rng, img, amount=0.012):
    """Surface d'émail : nébulosité très douce et grain fin."""
    cloud = fbm(rng, 220, 4) - 0.5
    grain = ndi.gaussian_filter(rng.r.normal(0, 1, (H, W)).astype(np.float32), 0.55)
    return img * (1 + (cloud * amount * 2 + grain * amount * 0.4))[..., None]


# ───────────────────────────── marqueterie ─────────────────────────────

WOODS = [  # du plus sombre au plus clair : (essence, teinte, contraste du fil)
    ('ébène', '#2A1C14', 0.10),
    ('palissandre', '#553424', 0.22),
    ('noyer', '#7E5536', 0.22),
    ('merisier', '#A87449', 0.18),
    ('poirier', '#C49A70', 0.14),
    ('tilleul', '#D8BE93', 0.12),
    ('érable', '#E6D3AE', 0.10),
    ('houx', '#F0E5CC', 0.08),
]


def _majority(q, n, size=5, it=2):
    for _ in range(it):
        best = None
        acc = None
        for k in range(n):
            f = ndi.uniform_filter((q == k).astype(np.float32), size)
            if acc is None:
                acc, best = f, np.zeros_like(q)
            else:
                sel = f > acc
                acc = np.where(sel, f, acc)
                best = np.where(sel, k, best)
        q = best
    return q


def marquetry(rng, L, flow, woods=WOODS, sand=0.42, cut=0.8, pen=None, seed_tone=0.05, cuts=None, flow_over=None, split=None, calm=None):
    """Marqueterie : la valeur est découpée en pièces de placage (une essence par
    niveau), chaque pièce a son fil orienté par le champ de touche, une légère
    variation de feuille, un ombrage au sable sur les bords sombres, et des traits
    de coupe. La plume devient filet d'ébène incrusté. cuts : traits de coupe
    imposés (rayons d'un soleil…), flow_over : (masque, angle) qui force le fil."""
    n = len(woods)
    # lissage guidé : grands aplats propres, détails conservés là où ça contraste
    Lb = ndi.gaussian_filter(L, 4.0)
    Lf = ndi.gaussian_filter(L, 0.9)
    det = smooth(0.015, 0.05, np.abs(Lf - Lb))
    if calm is not None:
        det = det * (1 - calm)
        Lb = Lb * (1 - calm) + ndi.gaussian_filter(L, (3.0, 16.0)) * calm
    Ls = ndi.median_filter(Lb * (1 - det) + Lf * det, 5)
    lo, hi = np.percentile(Ls, 1), np.percentile(Ls, 99.5)
    Ln = np.clip((Ls - lo) / (hi - lo + 1e-6), 0, 0.9999)
    q = np.floor(Ln * n).astype(np.int32)
    q = _majority(q, n, 5, 2)
    free = np.ones_like(q, bool) if cuts is None else (cuts < 0.5)
    lab = np.zeros_like(q)
    off = 0
    for k in range(n):
        lk, nk = ndi.label((q == k) & free)
        lab = np.where(lk > 0, lk + off, lab)
        off += nk
    nl = off
    if cuts is not None:
        # les pixels de coupe prennent l'étiquette voisine
        idx = ndi.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
        lab = lab[idx[0], idx[1]]
    if split is not None:
        key = lab.astype(np.int64) * (int(split.max()) + 1) + split.astype(np.int64)
        _, inv = np.unique(key, return_inverse=True)
        lab = inv.reshape(lab.shape).astype(np.int32)
        nl = int(lab.max())
    po = rng.r.uniform(0, 400, nl + 1).astype(np.float32)
    pt = rng.r.normal(0, seed_tone, nl + 1).astype(np.float32)
    pa = rng.r.normal(0, 0.08, nl + 1).astype(np.float32)
    mean_l = np.nan_to_num(np.array(ndi.mean(Ln, lab, np.arange(nl + 1)), np.float32))
    fl = flow.copy()
    if flow_over is not None:
        fm, fa = flow_over
        fl = np.where(fm > 0.5, fa, fl)
    a = fl + pa[lab] + math.pi / 2
    u = XX * np.cos(a) + YY * np.sin(a) + po[lab]
    v_ = -XX * np.sin(a) + YY * np.cos(a)
    wsm = (fbm(rng, 60, 3, aspect=1.0) - 0.5) * 5
    wbg = (fbm(rng, 140, 3) - 0.5) * 40
    fine = np.sin((u + wsm) * 2.1) * 0.5 + 0.5
    fine2 = np.sin((u + wsm * 1.3) * 0.9 + 1.3) * 0.5 + 0.5
    figure_ = np.sin((u + wbg) * 0.16) * 0.5 + 0.5
    pores = ndi.gaussian_filter(rng.r.random((H, W)).astype(np.float32), 0.45)
    base = np.stack([col3(w[1]) for w in woods])
    con = np.array([w[2] for w in woods], np.float32)
    img = base[q].copy()
    g = (0.4 * fine + 0.3 * fine2 + 0.3 * figure_ - 0.5) * 2
    img *= (1 + (con[q] * g * 0.8 + (pores - 0.5) * 0.05 + pt[lab]))[..., None]
    burn = np.clip((mean_l[lab] - Ln) * n * 0.8, 0, 1) * sand
    edge = ndi.gaussian_filter((ndi.grey_dilation(lab, size=3) != lab).astype(np.float32), 1.6)
    burn = np.clip(burn + edge * sand * 0.25 * (q > 2), 0, 0.7)
    img *= (1 - burn * 0.5)[..., None]
    img = img * (1 - burn[..., None] * 0.12) + col3('#3A2010') * (burn[..., None] * 0.12)
    b = (ndi.grey_dilation(lab, size=2) != lab) | (ndi.grey_erosion(lab, size=2) != lab)
    bl = ndi.gaussian_filter(b.astype(np.float32), 0.45)
    img = img * (1 - cut * np.clip(bl, 0, 1)[..., None] * 0.55)
    if pen is not None:
        p = np.clip(ndi.gaussian_filter(pen, 0.3) * 1.3, 0, 1)[..., None]
        img = img * (1 - p) + col3('#21150E') * p
    return np.clip(img, 0, 1), q


# ───────────────────────────── cloisonné ─────────────────────────────

def cloisonne(rng, img, palette, gold_mask=None, extra_wires=None, wire=1.7, gloss=True):
    """Émail cloisonné : chaque pixel est ramené à l'émail le plus proche de la
    palette ; les frontières entre émaux deviennent des fils d'or en relief
    (ombrés, avec reflet), l'émail se creuse légèrement entre les fils, quelques
    bulles, un lustre. gold_mask : surfaces d'or plein (paillons, étoiles)."""
    pal = np.stack([col3(c) for c in palette])
    d = ((img[..., None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    lab = d.argmin(-1)
    lab = _majority(lab, len(palette), 3, 1)
    b = (ndi.grey_dilation(lab, size=2) != lab) | (ndi.grey_erosion(lab, size=2) != lab)
    wm = b.astype(np.float32)
    if extra_wires is not None:
        wm = np.maximum(wm, extra_wires)
    wm = np.clip(ndi.gaussian_filter(ndi.grey_dilation(wm, size=int(max(1, round(wire - 0.6)))), 0.55) * 1.4, 0, 1)
    base = pal[lab].copy()
    dist = ndi.distance_transform_edt(wm < 0.5)
    deep = 0.86 + 0.14 * smooth(0, 7, dist)
    cloud = fbm(rng, 30, 3) - 0.5
    out = base * (deep + cloud * 0.05)[..., None]
    bub = (rng.r.random((H, W)) < 0.0009).astype(np.float32)
    out = out + ndi.gaussian_filter(bub, 0.6)[..., None] * 0.5
    # or : fil en relief éclairé en haut à gauche
    g = ndi.gaussian_filter(wm, 0.9)
    gy, gx = np.gradient(g)
    lam = np.clip(0.55 + (-gx * -0.7 + -gy * -0.7) * 6, 0, 1)
    g0, g1, g2 = col3('#7A5718'), col3('#D2A74A'), col3('#FFF0B8')
    goldc = np.where(lam[..., None] < 0.5, g0 + (g1 - g0) * (lam[..., None] * 2), g1 + (g2 - g1) * ((lam[..., None] - 0.5) * 2))
    if gold_mask is not None:
        gm = np.clip(gold_mask, 0, 1)
        gg = ndi.gaussian_filter(gm, 1.2)
        gy2, gx2 = np.gradient(gg)
        lam2 = np.clip(0.6 + (gx2 * 0.7 + gy2 * 0.7) * -8, 0, 1)
        gc2 = g1 + (g2 - g1) * lam2[..., None] * 0.9
        out = out * (1 - gm[..., None]) + gc2 * gm[..., None]
    out = out * (1 - wm[..., None]) + goldc * wm[..., None]
    if gloss:
        sh = np.exp(-(((XX - 250) / 380) ** 2 + ((YY - 260) / 300) ** 2))
        out = out + 0.06 * sh[..., None]
    return np.clip(out, 0, 1), lab
