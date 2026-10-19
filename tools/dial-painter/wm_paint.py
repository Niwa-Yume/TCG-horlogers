"""WristMasters — boîte à outils de peinture procédurale pour les cadrans des cartes.

Pas d'IA, pas d'image source : chaque cadran est calculé (masques vectoriels,
gravure au trait modulé, lavis, marqueterie, émail). Coordonnées en pixels de
l'image finale (W × H), dessin des masques en suréchantillonnage.
"""
import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

W, H = 816, 1152          # 4 × la zone de cadran de la carte (204 × 288)
SS = 3                    # suréchantillonnage des masques

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


class Rng:
    def __init__(self, seed):
        self.r = np.random.default_rng(seed)

    def u(self, a=0.0, b=1.0, size=None):
        return self.r.uniform(a, b, size)

    def n(self, s=1.0, size=None):
        return self.r.normal(0, s, size)

    def i(self, a, b):
        return int(self.r.integers(a, b))


def fbm(rng, scale=160.0, octaves=5, aspect=1.0, h=H, w=W):
    """Bruit fractal 0..1 ; aspect > 1 étire à l'horizontale."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    sx, sy = scale * aspect, scale
    for _ in range(octaves):
        gh, gw = int(h / sy) + 3, int(w / sx) + 3
        g = rng.r.random((gh, gw)).astype(np.float32)
        up = ndi.zoom(g, (sy, sx), order=3)[:h, :w]
        out += amp * up
        tot += amp
        amp *= 0.5
        sx, sy = max(sx / 2, 1), max(sy / 2, 1)
    out /= tot
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


_JIT = []


class Layer:
    """Masque dessiné en suréchantillonnage, rendu antialiasé 0..1 (calcul limité à sa boîte englobante)."""

    def __init__(self, wob=0.0, seed=None):
        self.ops = []
        self.box = [1e9, 1e9, -1e9, -1e9]
        self.wob = wob
        self.jr = np.random.default_rng(seed if seed is not None else len(_JIT))
        _JIT.append(1)

    def _jit(self, pts, closed):
        """Trait de main : subdivise et fait légèrement trembler le contour."""
        if not self.wob or len(pts) < 2:
            return pts
        out = []
        seq = list(pts) + ([pts[0]] if closed else [])
        for (x0, y0), (x1, y1) in zip(seq[:-1], seq[1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            n = max(1, int(L / 5))
            for k in range(n):
                t = k / n
                out.append((x0 + (x1 - x0) * t + self.jr.normal(0, self.wob), y0 + (y1 - y0) * t + self.jr.normal(0, self.wob)))
        if not closed:
            out.append((seq[-1][0] + self.jr.normal(0, self.wob), seq[-1][1] + self.jr.normal(0, self.wob)))
        return out

    def _grow(self, pts, pad=0.0):
        for x, y in pts:
            self.box[0] = min(self.box[0], x - pad); self.box[1] = min(self.box[1], y - pad)
            self.box[2] = max(self.box[2], x + pad); self.box[3] = max(self.box[3], y + pad)

    def poly(self, pts, v=255):
        self.ops.append(('poly', list(pts), v, 0)); self._grow(pts); return self

    def rect(self, x0, y0, x1, y1, v=255):
        self.ops.append(('rect', [(x0, y0), (x1, y1)], v, 0)); self._grow([(x0, y0), (x1, y1)]); return self

    def ellipse(self, cx, cy, rx, ry, v=255):
        self.ops.append(('ellipse', [(cx - rx, cy - ry), (cx + rx, cy + ry)], v, 0)); self._grow([(cx - rx, cy - ry), (cx + rx, cy + ry)]); return self

    def line(self, pts, w=1.0, v=255):
        self.ops.append(('line', list(pts), v, w)); self._grow(pts, w); return self

    def outline(self, pts, w=1.0, v=255):
        pts = list(pts)
        self.ops.append(('line', pts + [pts[0]], v, w)); self._grow(pts, w); return self

    def arr(self):
        out = np.zeros((H, W), np.float32)
        if not self.ops:
            return out
        x0 = int(max(0, np.floor(self.box[0]) - 3)); y0 = int(max(0, np.floor(self.box[1]) - 3))
        x1 = int(min(W, np.ceil(self.box[2]) + 3)); y1 = int(min(H, np.ceil(self.box[3]) + 3))
        if x1 <= x0 or y1 <= y0:
            return out
        bw, bh = x1 - x0, y1 - y0
        img = Image.new('L', (bw * SS, bh * SS), 0)
        d = ImageDraw.Draw(img)
        tr = lambda p: [((x - x0) * SS, (y - y0) * SS) for x, y in p]
        for kind, pts, v, w in self.ops:
            if self.wob and kind == 'rect':
                (ax, ay), (bx, by) = pts
                kind, pts = 'poly', [(ax, ay), (bx, ay), (bx, by), (ax, by)]
            elif self.wob and kind == 'ellipse':
                (ax, ay), (bx, by) = pts
                cx, cy, rx, ry = (ax + bx) / 2, (ay + by) / 2, (bx - ax) / 2, (by - ay) / 2
                n = max(10, int((rx + ry) * 0.9))
                kind, pts = 'poly', [(cx + rx * math.cos(t), cy + ry * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]
            if kind == 'poly':
                pts = self._jit(pts, True)
            elif kind == 'line':
                pts = self._jit(pts, False)
            q = tr(pts)
            if kind == 'poly':
                d.polygon(q, fill=v)
            elif kind == 'rect':
                d.rectangle([q[0][0], q[0][1], q[1][0], q[1][1]], fill=v)
            elif kind == 'ellipse':
                d.ellipse([q[0][0], q[0][1], q[1][0], q[1][1]], fill=v)
            elif kind == 'line':
                d.line(q, fill=v, width=max(1, int(round(w * SS))), joint='curve')
        out[y0:y1, x0:x1] = np.asarray(img.resize((bw, bh), Image.LANCZOS), np.float32) / 255.0
        return out


def hatch(tone, angle=0.0, spacing=4.0, wobble=None, wmin=0.06, wmax=0.92, gate=0.015):
    """Gravure au trait : des lignes parallèles dont l'épaisseur suit la densité (0..1).

    C'est le geste du graveur au burin : une seule direction de taille, un trait
    qui enfle dans l'ombre et s'amincit dans la lumière.
    """
    a = math.radians(angle)
    u = XX * math.sin(a) - YY * math.cos(a)
    if wobble is not None:
        u = u + wobble
    f = np.mod(u / spacing, 1.0)
    d = np.abs(f - 0.5) * spacing
    hw = (wmin + (wmax - wmin) * np.clip(tone, 0, 1)) * spacing * 0.5
    cov = np.clip(hw - d + 0.5, 0, 1)
    return cov * (tone > gate)


def stipple(rng, tone, density=0.5, size=1.0):
    """Pointillé : points dont la probabilité suit la densité."""
    p = rng.r.random((H, W)).astype(np.float32)
    dots = (p < np.clip(tone, 0, 1) * density * 0.25).astype(np.float32)
    if size > 1:
        dots = ndi.maximum_filter(dots, size=int(size))
    return ndi.gaussian_filter(dots, 0.4) * 1.6


def screen(*layers):
    """Somme d'encre : 1 - Π(1 - a)."""
    out = np.zeros((H, W), np.float32)
    for a in layers:
        out = 1 - (1 - out) * (1 - np.clip(a, 0, 1))
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def compose(ground, ink, coverage):
    """Encre sur fond : ground et ink sont des couleurs (3,) ou des cartes (H, W, 3)."""
    g = ground if np.ndim(ground) == 3 else np.broadcast_to(hexrgb(ground) if isinstance(ground, str) else ground, (H, W, 3))
    k = ink if np.ndim(ink) == 3 else np.broadcast_to(hexrgb(ink) if isinstance(ink, str) else ink, (H, W, 3))
    c = coverage[..., None]
    return g * (1 - c) + k * c


def enamel_ground(rng, base, var=0.025):
    """Fond d'émail : couleur de base, légère nébulosité et grain fin."""
    b = hexrgb(base)
    cloud = fbm(rng, 260, 4) - 0.5
    grain = rng.r.normal(0, 1, (H, W)).astype(np.float32)
    grain = ndi.gaussian_filter(grain, 0.6)
    img = np.broadcast_to(b, (H, W, 3)).copy()
    img += (cloud * var * 2)[..., None]
    img += (grain * var * 0.35)[..., None]
    return img


def vignette_cushion(margin=26, soft=70, top_band=None, bottom_band=None):
    """Masque 1 au centre → 0 près des bords du cadran (fondu de la miniature dans l'émail)."""
    dx = np.minimum(XX, W - 1 - XX)
    dy = np.minimum(YY, H - 1 - YY)
    r = 150.0
    # distance approximative à un coussin à grands rayons
    cx = np.clip(r - dx, 0, None)
    cy = np.clip(r - dy, 0, None)
    corner = np.sqrt(cx ** 2 + cy ** 2)
    dist = np.where((dx < r) & (dy < r), r - corner, np.minimum(dx, dy))
    m = smooth(margin, margin + soft, dist)
    if top_band:
        y0, y1 = top_band
        m = m * smooth(y0, y1, YY)
    if bottom_band:
        y0, y1 = bottom_band
        m = m * (1 - smooth(y0, y1, YY))
    return m


def save(img, path, quality=88):
    a = np.clip(img, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8)).save(path, quality=quality, method=6)
