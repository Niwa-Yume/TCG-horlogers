"""Primitives de paysage horloger pour les planches : montagnes et neige, sapins, fermes du Jura,
rangées de maisons (Genève, Jura, Saxe, Rhin), églises à horloge, Munot, observatoire, usines,
bateaux du Léman (vapeur à aubes, barque à voiles latines), jet d'eau, fumées, passants par époque.

Tout est modelé en valeurs (1 = clair), lumière en haut à gauche, perspective atmosphérique
par vedute.air ; chaque élément pose sa matière (painter.material) pour les techniques en couleurs.
"""
import math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, fbm, smooth
from painter import material
from vedute import Group, lay, air, split, ramp_x, ramp_y, disc, dab_into, figure, _blob_into, LDIR


def era(year):
    """Époque vestimentaire et technique d'une année."""
    if year < 1790:
        return 'xviii'
    if year < 1830:
        return 'empire'
    if year < 1900:
        return 'xix'
    if year < 1945:
        return 'belle'
    return 'moderne'


# ───────────────────────────── ciel ─────────────────────────────

def stars(rng, n, y_max, avoid=()):
    """Masque d'étoiles (petites croix douces), hors des zones à éviter [(x0, y0, x1, y1)]."""
    m = np.zeros((H, W), np.float32)
    for _ in range(n):
        x, y = rng.u(30, W - 30), rng.u(40, y_max)
        if any(a <= x <= c and b <= y <= d for a, b, c, d in avoid):
            continue
        s = rng.u(1.2, 3.2)
        _blob_into(m, x, y, s * 0.55, s * 0.55, 1.0)
        if s > 2.4:
            _blob_into(m, x, y, s * 2.2, 0.45, 0.6)
            _blob_into(m, x, y, 0.45, s * 2.2, 0.6)
    return np.clip(m, 0, 1)


def moon(sc, x, y, r=28):
    with material('lumiere'):
        m = disc(x, y, r, 1.2)
        sc.put(m, 1.0)
        sc.light(m, 0.9)
    halo = np.exp(-(((XX - x) ** 2 + (YY - y) ** 2) / (2 * (r * 4.5) ** 2)))
    sc.put((sc.mat == 1) * halo * 0.6, np.clip(sc.lum() + 0.2, 0, 1))


def sun(sc, x, y, r=32, v=0.99):
    with material('lumiere'):
        m = disc(x, y, r, 1.5)
        sc.put(m, v)
        sc.light(m, 0.6)


def smoke(sc, rng, x, y, h, d=0.3, drift=0.6, v=0.82):
    """Fumée qui monte et part vers la droite : chapelet de bouffées de plus en plus diffuses."""
    M = np.zeros((H, W), np.float32)
    n = int(6 + h / 18)
    for k in range(n):
        t = k / max(n - 1, 1)
        cx = x + drift * h * t ** 1.4 + rng.u(-3, 3)
        cy = y - h * t
        r = 5 + 26 * t
        _blob_into(M, cx, cy, r, r * 0.75, 0.9 - 0.5 * t)
    M = np.clip(M, 0, 1) * smooth(0.0, 0.25, fbm(rng, 18, 3))
    with material('nuage'):
        sc.put(M * 0.8, air(v, d), ln=1.0)


# ───────────────────────────── relief ─────────────────────────────

def mountains(sc, rng, base, peaks, d=0.7, v_lit=0.86, v_sh=0.66, snow=0.45, slant=0.6, rough=0.22):
    """Chaîne de montagnes : peaks = [(x, hauteur, demi-largeur)]. Profil en bosses arrondies,
    arêtes secondaires en bruit « ridged » ; un versant est éclairé là où le profil monte vers
    la droite (lumière à gauche), à l'ombre là où il descend ; les facettes suivent des arêtes
    qui descendent en biais. Neige au-dessus d'une ligne irrégulière (snow = part enneigée).
    rough : poids des arêtes (0,22 les Alpes ; 0,04 les croupes arrondies du Jura ou de l'Erzgebirge)."""
    xs = np.arange(W, dtype=np.float32)
    env = np.zeros(W, np.float32)
    for px, ph, pw in peaks:
        env = np.maximum(env, ph * np.clip(1 - ((xs - px) / pw) ** 2, 0, 1) ** 0.9)
    ridged = 1 - np.abs(fbm(rng, 70, 3, h=1, w=W)[0] * 2 - 1)
    prof = ndi.gaussian_filter1d(env * (1.06 - rough + rough * ridged), 2.5) + (fbm(rng, 10, 2, h=1, w=W)[0] - 0.5) * 4 * (env > 4)
    top = base - prof
    m = smooth(-1.2, 1.2, YY - top[None, :]) * (YY < base + 3)
    # pente du profil, lue le long d'arêtes qui descendent en biais
    dprof = np.gradient(ndi.gaussian_filter1d(prof, 3))
    depth = np.clip(YY - top[None, :], 0, None)
    xi = np.clip(XX - depth * slant, 0, W - 1).astype(np.int32)
    slope = dprof[xi]
    lit = smooth(-0.15, 0.25, slope)
    folds = (fbm(rng, 20, 3, aspect=0.4) - 0.5) * 0.14 * max(rough / 0.22, 0.35)
    v = v_sh + (v_lit - v_sh) * lit + folds - 0.08 * smooth(0, 160, depth)
    with material('montagne'):
        sc.put(m, air(v, d), flow=np.where(lit > 0.5, -0.9, 0.9), fw=0.55, ln=0.9)
    if snow > 0:
        line = base - prof * (1 - snow) + (fbm(rng, 14, 3, h=1, w=W)[0] - 0.5) * 30
        sn = m * smooth(-2, 2, line[None, :] - YY) * (prof[None, :] > 20)
        sn = sn * smooth(0.22, 0.42, fbm(rng, 10, 3, aspect=0.3) * 0.7 + lit * 0.3)
        vs = 0.8 + 0.19 * lit
        with material('neige'):
            sc.put(sn, air(vs, d * 0.8), flow=np.where(lit > 0.5, -0.9, 0.9), fw=0.6, ln=0.8)
            sc.light(sn * lit * smooth(0.3, 0.8, fbm(rng, 30, 2)), 0.25)
    return top


def snowfield(sc, rng, y0, y1, v0=0.94, v1=0.82, d=0.0):
    """Champ de neige : ondulations douces, ombres bleutées des congères, traces."""
    m = (YY >= y0).astype(np.float32) * (YY <= y1)
    und = fbm(rng, 60, 3, aspect=3.0) - 0.5
    v = v0 + (v1 - v0) * smooth(y0, y1, YY) + und * 0.07
    with material('neige'):
        sc.put(m, air(v, d), flow=0.08, fw=0.85, ln=1.8)
        sc.light(m * smooth(0.25, 0.5, und), 0.2)


def meadow(sc, rng, y0, y1, v0=0.7, v1=0.5, d=0.0):
    m = (YY >= y0).astype(np.float32) * (YY <= y1)
    tex = fbm(rng, 30, 3, aspect=2.5) - 0.5
    with material('feuillage'):
        sc.put(m, air(v0 + (v1 - v0) * smooth(y0, y1, YY) + tex * 0.08, d), flow=0.15, fw=0.6, ln=1.2)


# ───────────────────────────── arbres ─────────────────────────────

def fir(G, rng, x, base, h, d=0.2, snow=False, v=0.3):
    """Sapin du Jura : étages en dents de scie, plus clair à gauche ; neige sur les étages."""
    n = max(4, int(h / 14))
    w = h * 0.32
    with material('feuillage'):
        G.put(lay(0.1).rect(x - w * 0.05, base - h * 0.12, x + w * 0.05, base).arr(), air(0.25, d))
        for k in range(n):
            t = k / n
            y_b = base - h * 0.08 - t * h * 0.92 * 0.95
            y_t = y_b - h * 0.92 / n * 1.6
            ww = w * (1 - t) ** 0.95 + 2
            pts = [(x - ww, y_b), (x - ww * 0.55, y_b - 2), (x, y_t), (x + ww * 0.55, y_b - 2), (x + ww, y_b)]
            G.put(lay(0.5).poly(pts).arr(), split(x - ww * 0.1, air(v + 0.14, d), air(v - 0.04, d), ww * 0.3), flow=-0.5, fw=0.4, ln=0.5)
    if snow:
        with material('neige'):
            for k in range(n):
                t = k / n
                y_b = base - h * 0.08 - t * h * 0.92 * 0.95
                ww = w * (1 - t) ** 0.95 + 2
                pts = [(x - ww * 0.9, y_b - 1), (x - ww * 0.35, y_b - 6), (x + ww * 0.1, y_b - 4), (x - ww * 0.2, y_b + 1)]
                G.put(lay(0.5).poly(pts).arr(), air(0.95, d * 0.8))


def forest(sc, rng, x0, x1, base, hmin, hmax, d=0.5, snow=False, density=1.0, rows=2):
    """Lisière de sapins sur plusieurs rangs, du fond vers l'avant."""
    for r in range(rows):
        G = Group()
        dd = d * (1 - 0.35 * r / max(rows - 1, 1))
        y = base + r * (hmax * 0.12)
        x = x0
        while x < x1:
            h = rng.u(hmin, hmax) * (1 + 0.15 * r)
            fir(G, rng, x, y + rng.u(-3, 3), h, dd, snow, v=0.26 + 0.06 * (rows - r))
            x += h * rng.u(0.18, 0.34) / density
        G.commit(sc)


def deciduous(sc, rng, x, base, h, w, d=0.3, v_lit=0.7, v_dark=0.3):
    """Arbre feuillu simple (masse de touffes), pour quais et jardins."""
    G = Group()
    with material('bois'):
        G.put(lay(0.4).poly([(x - w * 0.04, base), (x - w * 0.02, base - h * 0.5), (x + w * 0.02, base - h * 0.5), (x + w * 0.04, base)]).arr(), air(0.3, d))
    M = np.zeros((H, W), np.float32)
    V = np.zeros((H, W), np.float32)
    for _ in range(int(40 + w * 0.6)):
        a = rng.u(0, 2 * math.pi)
        r = rng.u(0, 1) ** 0.6
        cx, cy = x + math.cos(a) * r * w * 0.5, base - h * 0.62 + math.sin(a) * r * h * 0.34
        nx, ny = math.cos(a) * r, math.sin(a) * r
        lam = max(0.0, nx * LDIR[0] + ny * LDIR[1] + 0.6)
        dab_into(M, V, cx, cy, rng.u(0.06, 0.13) * w, v_dark + (v_lit - v_dark) * min(1.0, lam), 1.0, 0.25, rng)
    with material('feuillage'):
        G.put(M, air(V, d), fw=0.0, ln=0.4)
    G.commit(sc)


# ───────────────────────────── maisons ─────────────────────────────

def windows(G, rng, x, top, w, h, d, cols, rows, lit, lights, ww=3.4, wh=5.2, margin=5):
    """Grille de fenêtres ; une part éclairée (lit) devient lumière, le reste vitre sombre."""
    dark, bright = lay(0.15), lay(0.15)
    for i in range(rows):
        for j in range(cols):
            wx = x + margin + j * (w - 2 * margin) / max(cols, 1) + ((w - 2 * margin) / max(cols, 1) - ww) / 2
            wy = top + margin + i * (h - 2 * margin) / max(rows, 1)
            (bright if rng.u() < lit else dark).rect(wx, wy, wx + ww, wy + wh)
    with material('vitre'):
        G.put(dark.arr(), air(0.32, d))
    with material('lumiere'):
        b = bright.arr()
        G.put(b, 0.98)
        G.light(b, 0.7)
    if lights is not None:
        lights.append(b)


def house_row(G, rng, x0, x1, base, hmin, hmax, wmin, wmax, d, style='jura', lit=0.0, lights=None, snow=False, skip=()):
    """Rangée de maisons continentales. style : jura (toits à quatre pans), geneve (hautes façades
    à corniche), saxe (colombages), rhin (pignons et oriels), atelier (longues façades percées
    de fenêtres d'horlogers, La Chaux-de-Fonds)."""
    x = x0
    while x < x1:
        w = rng.u(wmin, wmax)
        if any(a < x + w and x < b for a, b in skip):
            x = max(b for a, b in skip if a < x + w and x < b)
            continue
        h = rng.u(hmin, hmax)
        top = base - h
        vf = rng.u(0.8, 0.9)
        with material('pierre' if style != 'saxe' else 'pierre'):
            G.put(lay(0.3).rect(x, top, x + w, base).arr(), ramp_x(x, x + w, air(vf, d), air(vf - 0.1, d)), flow=math.pi / 2, fw=0.5, ln=0.6)
        rh = w * {'jura': 0.42, 'geneve': 0.16, 'saxe': 0.62, 'rhin': 0.7, 'atelier': 0.22}[style]
        if style in ('rhin', 'saxe'):
            roof = [(x - 2, top), (x + w / 2, top - rh), (x + w + 2, top)]
        elif style == 'geneve':
            roof = [(x - 1, top), (x + w + 1, top), (x + w - 5, top - rh), (x + 5, top - rh)]
        else:
            roof = [(x - 3, top + 1), (x + w * 0.25, top - rh), (x + w * 0.75, top - rh), (x + w + 3, top + 1)]
        with material('toit'):
            G.put(lay(0.3).poly(roof).arr(), ramp_x(x, x + w, air(0.56, d), air(0.42, d)), flow=0.0, fw=0.4, ln=0.8)
        if snow:
            with material('neige'):
                G.put(lay(0.4).poly([(p[0], p[1] + (3 if i in (0, len(roof) - 1) else 0)) for i, p in enumerate(roof)]).arr() * (YY < top - rh * 0.25 + 1), air(0.95, d * 0.8))
        if style == 'saxe':
            tim = lay(0.0)
            for k in range(1, 4):
                tim.line([(x, top + k * h / 4), (x + w, top + k * h / 4)], 1.0)
            for k in range(1, int(w / 9)):
                tim.line([(x + k * 9, top), (x + k * 9, base)], 0.9)
                tim.line([(x + k * 9, top + (k % 2) * h / 4), (x + (k + 1) * 9, top + ((k + 1) % 2) * h / 4)], 0.8)
            G.ink(tim.arr(), 0.45 * (1 - d * 0.5))
        if style == 'geneve':
            G.ink(lay(0.1).line([(x, top + 2), (x + w, top + 2)], 1.2).arr(), 0.3)
        for c in range(rng.i(1, 3)):
            cx = x + w * rng.u(0.2, 0.75)
            with material('brique'):
                G.put(lay(0.2).rect(cx, top - rh * 0.6 - rng.u(4, 9), cx + 4, top - rh * 0.3).arr(), air(0.48, d))
        if h > 16:
            cols = max(1, int(w / (7 if style == 'atelier' else 10)))
            rows = max(1, int((h - 6) / 11))
            windows(G, rng, x, top, w, h - 3, d, cols, rows, lit, lights, ww=3.4 + (style == 'atelier') * 1.5)
        x += w + rng.u(0, 2.5)


def farm(G, rng, x, base, w, h, d=0.2, snow=False, lit=0.0, lights=None):
    """Ferme du Jura : murs bas, immense toit à deux pans tourné vers le pignon, grande cheminée."""
    roof_h = h * 1.25
    with material('pierre'):
        G.put(lay(0.4).rect(x, base - h, x + w, base).arr(), ramp_x(x, x + w, air(0.86, d), air(0.7, d)), flow=math.pi / 2, fw=0.5)
    roof = [(x - w * 0.12, base - h + 3), (x + w * 0.5, base - h - roof_h), (x + w * 1.12, base - h + 3)]
    with material('toit'):
        G.put(lay(0.4).poly(roof).arr(), split(x + w * 0.5, air(0.5, d), air(0.36, d), 3), flow=0.0, fw=0.3)
    if snow:
        with material('neige'):
            sn = lay(0.6).poly([(x - w * 0.12, base - h + 1), (x + w * 0.5, base - h - roof_h - 2), (x + w * 1.12, base - h + 1),
                                (x + w * 0.95, base - h - 4), (x + w * 0.5, base - h - roof_h + 9), (x + w * 0.05, base - h - 4)]).arr()
            G.put(sn, split(x + w * 0.5, air(0.97, d), air(0.8, d), 3))
    with material('bois'):
        G.put(lay(0.3).rect(x + w * 0.4, base - h * 0.62, x + w * 0.58, base).arr(), air(0.3, d))
    windows(G, rng, x, base - h * 0.85, w * 0.38, h * 0.5, d, 2, 1, lit, lights)
    windows(G, rng, x + w * 0.6, base - h * 0.85, w * 0.38, h * 0.5, d, 2, 1, lit, lights)
    with material('brique'):
        G.put(lay(0.3).rect(x + w * 0.62, base - h - roof_h * 0.62, x + w * 0.72, base - h - roof_h * 0.25).arr(), air(0.44, d))
    return (x + w * 0.67, base - h - roof_h * 0.62)


def church(G, rng, x, base, s=1.0, d=0.4, kind='fleche', clock=True, nave=True):
    """Église à clocher : flèche, bulbe baroque (Saxe), toit en bâtière ou pyramide ; cadran d'horloge."""
    tw = 14 * s
    th = 90 * s
    top = base - th
    if nave:
        with material('pierre'):
            G.put(lay(0.3).rect(x + tw * 0.6, base - 44 * s, x + tw * 0.6 + 70 * s, base).arr(), ramp_x(x, x + 80 * s, air(0.86, d), air(0.72, d)), flow=math.pi / 2, fw=0.5)
        with material('toit'):
            G.put(lay(0.3).poly([(x + tw * 0.6, base - 44 * s), (x + tw * 0.6 + 70 * s, base - 44 * s), (x + tw * 0.6 + 66 * s, base - 64 * s), (x + tw * 0.6 + 4 * s, base - 64 * s)]).arr(), air(0.48, d))
    with material('pierre'):
        G.put(lay(0.25).rect(x - tw, top, x + tw, base).arr(), split(x + tw * 0.2, air(0.9, d), air(0.68, d), 2), flow=math.pi / 2, fw=0.6, ln=0.6)
        G.put(lay(0.2).rect(x - tw * 0.3, top + 8 * s, x + tw * 0.3, top + 22 * s).arr(), air(0.4, d))
    if clock:
        cy = top + 36 * s
        with material('lumiere'):
            G.put(disc(x, cy, 8.5 * s, 0.8), air(0.96, d))
        hands = lay(0.0)
        hands.line([(x, cy), (x - 3 * s, cy - 4.5 * s)], 1.2 * s)
        hands.line([(x, cy), (x + 5.5 * s, cy - 2 * s)], 1.0 * s)
        G.ink(hands.arr() + np.clip(1 - np.abs(np.sqrt((XX - x) ** 2 + (YY - cy) ** 2) - 8.5 * s) / 0.9, 0, 1), 0.6)
    with material('toit'):
        if kind == 'fleche':
            G.put(lay(0.25).poly([(x - tw * 1.05, top), (x + tw * 1.05, top), (x, top - 70 * s)]).arr(), split(x, air(0.6, d), air(0.38, d), 1.5))
        elif kind == 'bulbe':
            G.put(lay(0.3).ellipse(x, top - 12 * s, tw * 1.0, 14 * s).arr(), split(x - tw * 0.2, air(0.6, d), air(0.36, d), 3))
            G.put(lay(0.2).rect(x - tw * 0.35, top - 40 * s, x + tw * 0.35, top - 22 * s).arr(), air(0.55, d))
            G.put(lay(0.25).poly([(x - tw * 0.5, top - 40 * s), (x + tw * 0.5, top - 40 * s), (x, top - 66 * s)]).arr(), split(x, air(0.58, d), air(0.36, d), 1.5))
        else:  # pyramide
            G.put(lay(0.25).poly([(x - tw * 1.1, top), (x + tw * 1.1, top), (x, top - 30 * s)]).arr(), split(x, air(0.58, d), air(0.38, d), 1.5))
    G.ink(lay(0.0).line([(x, top - (70 if kind == 'fleche' else 66 if kind == 'bulbe' else 30) * s), (x, top - (80 if kind != 'carre' else 38) * s)], 1.0).arr(), 0.6)


def munot(G, rng, x, base, s=1.0, d=0.4):
    """Le Munot de Schaffhouse (1564-1589) : fort circulaire crénelé et sa tour de guet."""
    r = 48 * s
    with material('pierre'):
        G.put(lay(0.3).rect(x - r, base - 34 * s, x + r, base).arr(), ramp_x(x - r, x + r, air(0.9, d), air(0.62, d)), flow=math.pi / 2, fw=0.5)
        cren = lay(0.2)
        for k in range(12):
            cx = x - r + 3 + k * (2 * r - 6) / 11
            cren.rect(cx - 2.5 * s, base - 40 * s, cx + 2.5 * s, base - 33 * s)
        G.put(cren.arr(), air(0.84, d))
        G.put(lay(0.25).rect(x - r * 0.62, base - 92 * s, x - r * 0.25, base - 34 * s).arr(), split(x - r * 0.45, air(0.9, d), air(0.66, d), 2), flow=math.pi / 2, fw=0.5)
    with material('toit'):
        G.put(lay(0.25).poly([(x - r * 0.7, base - 92 * s), (x - r * 0.17, base - 92 * s), (x - r * 0.435, base - 120 * s)]).arr(), split(x - r * 0.44, air(0.5, d), air(0.34, d), 1))
    with material('vitre'):
        G.put(lay(0.15).rect(x - r * 0.48, base - 80 * s, x - r * 0.4, base - 72 * s).arr(), air(0.3, d))


def observatory(G, rng, x, base, s=1.0, d=0.3, open_=True, glow=False):
    """Observatoire : bâtiment et coupole à cimier ouvert ; la lunette dépasse la nuit."""
    bw = 60 * s
    with material('pierre'):
        G.put(lay(0.3).rect(x - bw, base - 40 * s, x + bw, base).arr(), ramp_x(x - bw, x + bw, air(0.9, d), air(0.66, d)), flow=math.pi / 2, fw=0.5)
        G.put(lay(0.3).rect(x - bw * 0.45, base - 58 * s, x + bw * 0.45, base - 38 * s).arr(), ramp_x(x - bw, x + bw, air(0.88, d), air(0.64, d)))
    r = bw * 0.48
    with material('metal'):
        dome = disc(x, base - 58 * s, r, 1.0) * (YY < base - 58 * s)
        shade = np.clip((XX - (x - r * 0.4)) / (r * 1.6), 0, 1)
        G.put(dome, air(0.88 - 0.36 * shade, d))
    if open_:
        slit = lay(0.1).poly([(x - 4 * s, base - 58 * s - r), (x + 4 * s, base - 58 * s - r), (x + 5 * s, base - 58 * s), (x - 5 * s, base - 58 * s)]).arr() * dome
        with material('lumiere' if glow else 'vitre'):
            G.put(slit, 0.95 if glow else air(0.22, d))
        with material('metal'):
            G.put(lay(0.0).line([(x, base - 58 * s - r * 0.4), (x + 22 * s, base - 58 * s - r * 1.5)], 4.5 * s).arr(), air(0.25, d))
    windows(G, rng, x - bw, base - 36 * s, bw * 2, 30 * s, d, 6, 1, 0.5 if glow else 0.0, None)


def factory(G, rng, x, base, w, h, d=0.4, lit=0.0, lights=None):
    """Fabrique d'horlogerie (après 1850) : toits en sheds, rangées de fenêtres, haute cheminée."""
    with material('brique'):
        G.put(lay(0.3).rect(x, base - h, x + w, base).arr(), ramp_x(x, x + w, air(0.72, d), air(0.6, d)), flow=math.pi / 2, fw=0.5)
    n = max(3, int(w / 26))
    with material('toit'):
        for k in range(n):
            x0 = x + k * w / n
            G.put(lay(0.2).poly([(x0, base - h), (x0 + w / n * 0.8, base - h - 14), (x0 + w / n * 0.8, base - h), ]).arr(), air(0.46, d))
            G.put(lay(0.1).poly([(x0 + w / n * 0.8, base - h - 14), (x0 + w / n, base - h), (x0 + w / n * 0.8, base - h)]).arr(), air(0.86, d))
    windows(G, rng, x, base - h, w, h, d, max(2, int(w / 9)), max(1, int(h / 14)), lit, lights, ww=4.5, wh=7)
    cx = x + w * 0.85
    with material('brique'):
        G.put(lay(0.2).poly([(cx - 5, base - h), (cx + 5, base - h), (cx + 3.5, base - h - 70), (cx - 3.5, base - h - 70)]).arr(), split(cx, air(0.6, d), air(0.42, d), 1))
    return (cx, base - h - 70)


# ───────────────────────────── eau ─────────────────────────────

def steamer(sc, rng, x, wl, L, d=0.2, rip=None, flip=1):
    """Bateau à vapeur à aubes du Léman (dès 1823) : coque blanche, tambour, salon, cheminée."""
    G = Group()
    hh = L * 0.07
    with material('metal'):
        hull = lay(0.3).poly([(x, wl - hh), (x + L, wl - hh * 1.3), (x + L * 0.96, wl + 2), (x + L * 0.04, wl + 2)]).arr()
        G.put(hull, ramp_y(wl - hh * 1.3, wl, air(0.94, d), air(0.7, d)), flow=0.0, fw=0.8, ln=1.3)
        G.ink(lay(0.1).line([(x, wl - hh * 0.35), (x + L * 0.98, wl - hh * 0.45)], 1.4).arr(), 0.5)
        G.put(lay(0.3).rect(x + L * 0.25, wl - hh * 2.3, x + L * 0.78, wl - hh).arr(), ramp_x(x, x + L, air(0.92, d), air(0.74, d)))
        box = disc(x + L * 0.5, wl - hh * 0.9, hh * 1.7, 1.0) * (YY < wl - hh * 0.4)
        G.put(box, air(0.84, d))
        G.ink(lay(0.0).line([(x + L * 0.5 - hh * 1.4, wl - hh * 0.9), (x + L * 0.5 + hh * 1.4, wl - hh * 0.9)], 1.0).arr() * box, 0.4)
    windows(G, rng, x + L * 0.25, wl - hh * 2.2, L * 0.53, hh * 1.1, d, 9, 1, 0.0, None, ww=3, wh=3.5, margin=3)
    fx = x + L * (0.52 if flip > 0 else 0.48)
    with material('metal'):
        G.put(lay(0.2).rect(fx - 4, wl - hh * 2.3 - 34, fx + 4, wl - hh * 2.3).arr(), air(0.22, d))
        G.put(lay(0.2).rect(fx - 4.4, wl - hh * 2.3 - 34, fx + 4.4, wl - hh * 2.3 - 29).arr(), air(0.86, d))
    G.ink(lay(0.0).line([(x + L * 0.12, wl - hh), (x + L * 0.3, wl - hh * 2.3 - 40), (x + L * 0.88, wl - hh * 1.2)], 0.6).arr(), 0.45)
    G.reflect(sc, wl, k=0.55, ripple=rip, amp=7, fade=40)
    G.commit(sc)
    smoke(sc, rng, fx, wl - hh * 2.3 - 36, 70, d, drift=-0.7 * flip, v=0.7)


def steamship(sc, rng, x, wl, L, d=0.0, rip=None):
    """Vapeur de haute mer (après 1860) : coque noire à préceinte, superstructures blanches,
    deux cheminées, deux mâts gréés ; fumée couchée par le vent."""
    G = Group()
    hh = L * 0.1
    with material('metal'):
        hull = lay(0.3).poly([(x, wl - hh * 1.6), (x + L * 0.08, wl - hh * 1.5), (x + L * 0.96, wl - hh * 1.4), (x + L * 1.02, wl - hh * 1.9),
                              (x + L * 0.95, wl + 3), (x + L * 0.06, wl + 3)]).arr()
        G.put(hull, ramp_y(wl - hh * 1.9, wl, air(0.32, d), air(0.16, d)), flow=0.0, fw=0.8, ln=1.3)
        G.put(lay(0.2).poly([(x + L * 0.02, wl - hh * 0.25), (x + L * 0.97, wl - hh * 0.3), (x + L * 0.96, wl - hh * 0.05), (x + L * 0.04, wl)]).arr(), air(0.62, d))
        G.put(lay(0.3).rect(x + L * 0.3, wl - hh * 2.5, x + L * 0.72, wl - hh * 1.45).arr(), ramp_x(x, x + L, air(0.95, d), air(0.74, d)))
        G.put(lay(0.3).rect(x + L * 0.4, wl - hh * 3.1, x + L * 0.62, wl - hh * 2.5).arr(), ramp_x(x, x + L, air(0.95, d), air(0.74, d)))
    windows(G, rng, x + L * 0.3, wl - hh * 2.4, L * 0.42, hh * 0.8, d, 12, 1, 0.0, None, ww=4, wh=4, margin=4)
    ports = lay(0.1)
    for k in range(16):
        ports.ellipse(x + L * (0.1 + k * 0.052), wl - hh * 0.95, 2.4, 2.4)
    with material('vitre'):
        G.put(ports.arr(), air(0.8, d))
    funnels = []
    for fx in (x + L * 0.45, x + L * 0.57):
        with material('metal'):
            G.put(lay(0.2).poly([(fx - 9, wl - hh * 3.1), (fx + 9, wl - hh * 3.1), (fx + 7, wl - hh * 5.2), (fx - 11, wl - hh * 5.2)]).arr(), split(fx, air(0.4, d), air(0.24, d), 2))
            G.put(lay(0.2).rect(fx - 11.5, wl - hh * 5.2, fx + 7.5, wl - hh * 4.8).arr(), air(0.16, d))
        funnels.append((fx - 2, wl - hh * 5.2))
    rig = lay(0.0)
    for mx in (x + L * 0.18, x + L * 0.82):
        with material('bois'):
            G.put(lay(0.0).line([(mx, wl - hh * 1.5), (mx, wl - L * 0.62)], 2.6).arr(), air(0.3, d))
            G.put(lay(0.0).line([(mx - L * 0.07, wl - L * 0.48), (mx + L * 0.07, wl - L * 0.48)], 1.8).arr(), air(0.3, d))
        rig.line([(mx, wl - L * 0.62), (x + (L * 1.05 if mx > x + L / 2 else -L * 0.02), wl - hh * 1.6)], 0.7)
        rig.line([(mx, wl - L * 0.62), (x + L * 0.5, wl - hh * 3.1)], 0.6)
    G.ink(rig.arr(), 0.5)
    G.reflect(sc, wl, k=0.45, ripple=rip, amp=10, fade=80)
    G.commit(sc)
    for fx, fy in funnels:
        smoke(sc, rng, fx, fy, 160, d, drift=-1.2, v=0.6)


def lateen(sc, rng, x, wl, L, d=0.2, rip=None, flip=1):
    """Barque du Léman : coque basse, deux grandes voiles latines croisées « en ciseaux »."""
    G = Group()
    with material('bois'):
        G.put(lay(0.4).poly([(x, wl - 8), (x + L, wl - 11), (x + L * 0.93, wl + 2), (x + L * 0.06, wl + 2)]).arr(), air(0.3, d), flow=0.0, fw=0.8)
    for k, (mx, sgn) in enumerate(((x + L * 0.62, 1), (x + L * 0.3, -1))):
        top = (mx + sgn * L * 0.45 * flip, wl - L * 1.15)
        foot = (mx - sgn * L * 0.32 * flip, wl - 14)
        clew = (mx + sgn * L * 0.05 * flip, wl - 12)
        with material('toile'):
            sm = lay(0.5).poly([top, foot, clew]).arr()
            t = np.clip((YY - top[1]) / (wl - top[1]), 0, 1)
            G.put(sm, air(0.93 - 0.18 * t - 0.08 * k, d), flow=math.pi / 2 - 0.4 * sgn, fw=0.5, ln=0.8)
            G.light(sm * (t < 0.3), 0.3)
        G.ink(lay(0.0).line([top, foot], 1.2).arr(), 0.6)
        G.ink(lay(0.0).line([(mx, wl - 10), (mx, wl - L * 0.55)], 1.6).arr(), 0.6)
    G.reflect(sc, wl, k=0.5, ripple=rip, amp=7, fade=L * 0.8)
    G.commit(sc)


def jet_deau(sc, rng, x, base, h, d=0.3):
    """Jet d'eau de Genève (à cet endroit depuis 1891) : colonne qui s'évase et retombe en embruns."""
    M = np.zeros((H, W), np.float32)
    for k in range(40):
        t = k / 39
        _blob_into(M, x + 6 * t ** 2 + rng.u(-1, 1), base - h * t, 2.5 + 7 * t ** 1.5, 5 + 4 * t, 1.0)
    for k in range(30):
        t = rng.u(0.6, 1.0)
        _blob_into(M, x + rng.u(4, 40) * t, base - h * t + rng.u(0, 60), rng.u(5, 12), rng.u(5, 12), 0.4)
    M = np.clip(M, 0, 1)
    with material('eau'):
        sc.put(M * 0.9, air(0.97, d), flow=math.pi / 2, fw=0.8, ln=1.4)
        sc.light(M * smooth(0.7, 1.0, M), 0.4)


# ───────────────────────────── passants ─────────────────────────────

def walker(G, rng, x, foot, h, year, kind='homme', d=0.0, coat=None):
    """Passant habillé selon son époque. Avant 1790 : la figure du XVIIIe de vedute ;
    ensuite redingote et haut-de-forme, robe à crinoline ou à tournure, puis manteau et chapeau mou."""
    e = era(year)
    with material('figure'):
        if e == 'xviii':
            return figure(G, rng, x, foot, h, kind if kind != 'enfant' or True else 'homme', d, coat=coat)
        dk = lambda v: air(v, d)
        cv = coat if coat is not None else rng.u(0.22, 0.45)
        P = lambda pts: lay(0.3).poly(pts).arr()
        hd = h * 0.065
        hy = foot - h * 0.87
        sh, wa = foot - h * 0.79, foot - h * 0.52
        if kind == 'dame':
            hw = h * {'empire': 0.12, 'xix': 0.26 if year < 1870 else 0.16, 'belle': 0.13, 'moderne': 0.1}[e]
            hem = foot if e != 'moderne' else foot - h * 0.2
            G.put(P([(x - h * 0.07, wa), (x + h * 0.07, wa), (x + hw, hem - h * 0.02), (x - hw, hem - h * 0.02)]), split(x - hw * 0.2, dk(cv + 0.3), dk(cv + 0.08), hw * 0.5))
            if e == 'xix' and year >= 1870:
                G.put(disc(x - h * 0.12, wa + h * 0.05, h * 0.09, 0.8), dk(cv + 0.2))  # tournure
            if e == 'moderne':
                for sx in (-1, 1):
                    G.put(lay(0.2).line([(x + sx * h * 0.04, hem - h * 0.02), (x + sx * h * 0.04, foot - 1)], h * 0.03).arr(), dk(0.7))
            G.put(P([(x - h * 0.08, sh), (x + h * 0.08, sh), (x + h * 0.06, wa + h * 0.02), (x - h * 0.06, wa + h * 0.02)]), split(x, dk(cv + 0.24), dk(cv + 0.04), h * 0.03))
            G.put(disc(x, hy, hd, 0.6), split(x, dk(0.88), dk(0.66), hd * 0.4))
            if e in ('xix', 'belle'):
                G.put(lay(0.2).ellipse(x, hy - hd * 0.8, hd * (2.2 if e == 'belle' else 1.4), hd * 0.5).arr(), dk(cv + 0.1))
        else:
            for sx in (-1, 1):
                G.put(lay(0.2).line([(x + sx * h * 0.045, wa + h * 0.1), (x + sx * h * 0.05, foot - 1.5)], h * 0.045).arr(), split(x, dk(cv), dk(cv - 0.1), 1))
            coat_len = {'empire': 0.26, 'xix': 0.34, 'belle': 0.4, 'moderne': 0.36}[e]
            G.put(P([(x - h * 0.1, sh), (x + h * 0.1, sh), (x + h * 0.11, foot - h * coat_len), (x - h * 0.11, foot - h * coat_len)]), split(x - h * 0.02, dk(cv + 0.12), dk(cv - 0.08), h * 0.05))
            G.put(P([(x - h * 0.02, sh + h * 0.01), (x + h * 0.025, sh + h * 0.01), (x + h * 0.012, sh + h * 0.12)]), dk(0.9))
            G.put(disc(x, hy, hd, 0.6), split(x, dk(0.88), dk(0.66), hd * 0.4))
            if e in ('empire', 'xix'):
                G.put(lay(0.2).rect(x - hd * 0.95, hy - hd * 2.6, x + hd * 0.95, hy - hd * 0.5).arr(), dk(0.12))  # haut-de-forme
                G.put(lay(0.2).ellipse(x, hy - hd * 0.55, hd * 1.6, hd * 0.3).arr(), dk(0.12))
            elif e == 'belle':
                G.put(disc(x, hy - hd * 0.75, hd * 1.05, 0.6) * (YY < hy - hd * 0.4), dk(0.18))  # melon
                G.put(lay(0.2).ellipse(x, hy - hd * 0.45, hd * 1.7, hd * 0.28).arr(), dk(0.18))
            if kind == 'homme' and e != 'moderne':
                G.ink(lay(0.1).line([(x + h * 0.12, wa), (x + h * 0.17, foot)], max(0.8, h * 0.012)).arr(), 0.7)
