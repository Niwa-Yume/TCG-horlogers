"""Bibliothèque de planches : une scène paramétrée par une graine et une année, modelée en
valeurs et en matières, que techniques.render rend ensuite dans la technique de la rareté.

    python3 plates.py <planche> <technique> <graine> <année> sortie.png [--ref]

Chaque planche garde calmes le haut du cadran (marque, y < 170) et le bas (légende,
y 940–1100 au centre) ; ses repères historiques et sa plage de dates sont dans plates.json.
Une même ville ne donne jamais deux fois le même cadran : la graine déplace les monuments,
le point de vue, les nuages, les bateaux et les passants.
"""
import math
import sys
import numpy as np
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, Rng, fbm, smooth, save
from painter import Scene, material, lut, MAT
from vedute import (Group, lay, air, set_haze, split, ramp_x, ramp_y, disc, sky, cloud, hills, water,
                    city_row, spire, st_paul, ship, barge, wherry, balustrade, lamp, tree, cast_shadow, _blob_into)
from marine import sea, ship_under_sail, gull
from paris import notre_dame, quay_row, quay_wall
from scenery import (era, stars, moon, sun, smoke, mountains, snowfield, meadow, fir, forest, deciduous, windows,
                     house_row, farm, church, munot, observatory, factory, steamer, steamship, lateen, jet_deau, walker)
import techniques


# ───────────────────────────── ciel et lumière ─────────────────────────────

def heavens(sc, rng, hz, time, clouds=True, sun_side=None):
    """Ciel du moment : jour (cumulus), couchant (soleil bas, nuages éclairés par en dessous),
    nuit (lune, étoiles). Le haut du cadran reste calme : pas de nuage au-dessus de y = 220."""
    meta = {'hz': hz, 'time': time, 'sun': None, 'stars': None}
    if time == 'nuit':
        set_haze(0.62)
        with material('ciel'):
            sky(sc, rng, hz, top=0.44, bot=0.6, noise=0.02)
        mx = rng.u(140, 676) if sun_side is None else (rng.u(130, 300) if sun_side < 0 else rng.u(516, 680))
        my = rng.u(250, 330)
        if clouds:
            for k in range(rng.i(1, 3)):
                cx, cy = rng.u(150, 670), rng.u(330, max(330, hz - 120))
                with material('nuage'):
                    cloud(sc, rng, cx, cy, rng.u(200, 380), rng.u(30, 60), d=0.3, top=0.8, under=0.48, tiers=2)
        moon(sc, mx, my, rng.u(22, 30))
        st = stars(rng, 60, hz - 60, avoid=[(120, 40, 700, 190), (mx - 70, my - 70, mx + 70, my + 70)])
        with material('lumiere'):
            sc.put(st * 0.9, 0.95)
        meta['stars'] = st
        meta['moon'] = (mx, my)
        return meta
    if time == 'couchant':
        set_haze(0.92)
        with material('ciel'):
            sky(sc, rng, hz, top=0.68, bot=0.97, noise=0.02)
        sx = rng.u(120, 300) if (sun_side or rng.u(-1, 1)) < 0 else rng.u(516, 700)
        sy = hz - rng.u(40, 110)
        r = np.sqrt((XX - sx) ** 2 + ((YY - sy) * 1.3) ** 2)
        sc.put((sc.mat == MAT['ciel']).astype(np.float32), np.clip(sc.lum() + 0.18 * np.exp(-(r / 230) ** 1.5), 0, 1))
        if clouds:
            for k in range(rng.i(2, 4)):
                with material('nuage'):
                    cloud(sc, rng, rng.u(140, 680), rng.u(250, max(250, hz - 140)), rng.u(220, 420), rng.u(36, 90), d=rng.u(0.1, 0.5), top=1.0, under=0.6, tiers=2)
        sun(sc, sx, sy, rng.u(26, 34))
        meta['sun'] = (sx, sy)
        return meta
    set_haze(0.9)
    with material('ciel'):
        sky(sc, rng, hz, top=0.72, bot=0.94)
    if clouds:
        for k in range(rng.i(2, 4)):
            with material('nuage'):
                cloud(sc, rng, rng.u(140, 680), rng.u(250, max(250, hz - 130)), rng.u(240, 460), rng.u(50, 140), d=rng.u(0.1, 0.6), top=0.99, under=0.74, tiers=rng.i(2, 4))
    if rng.u() < 0.45:
        sx, sy = rng.u(520, 690), rng.u(240, 330)
        sun(sc, sx, sy, rng.u(24, 32))
        meta['sun'] = (sx, sy)
    return meta


def lit_for(time):
    """Part des fenêtres éclairées."""
    return {'nuit': 0.55, 'couchant': 0.18, 'jour': 0.0}[time]


def strollers(sc, rng, year, feet, time, n=None, xs=None):
    """Passants au premier plan, hors du centre bas (la légende)."""
    n = n or rng.i(2, 5)
    G = Group()
    placed = []
    for k in range(n):
        x = xs[k] if xs else (rng.u(60, 250) if rng.u() < 0.5 else rng.u(560, 760))
        foot = rng.u(*feet)
        h = (foot - 600) * rng.u(0.2, 0.26)
        kind = 'dame' if rng.u() < 0.45 else 'homme'
        placed.append((x, foot, h, kind))
    if time != 'nuit':
        for x, foot, h, kind in placed:
            cast_shadow(sc, x, foot, h, a=0.18)
    for x, foot, h, kind in sorted(placed, key=lambda p: p[1]):
        walker(G, rng, x, foot, h, year, kind, 0.0)
    G.commit(sc)


def boats(sc, rng, year, hz, y_near, rip, lake=False, flip=1):
    """Bateaux de l'époque sur le fleuve ou le lac."""
    with material('bois'):
        if lake:
            if year >= 1823 and rng.u() < 0.7:
                steamer(sc, rng, rng.u(380, 560), hz + rng.u(40, 80), rng.u(150, 210), d=0.35, rip=rip, flip=flip)
            if year < 1935:
                lateen(sc, rng, rng.u(140, 330), hz + rng.u(70, 120), rng.u(70, 110), d=0.25, rip=rip, flip=flip)
        else:
            if year < 1860:
                barge(sc, rng, rng.u(520, 660), hz + rng.u(26, 44), rng.u(50, 70), rng.u(44, 60), d=0.5, rip=rip, flip=-1)
            else:
                steamer(sc, rng, rng.u(420, 560), hz + rng.u(36, 60), rng.u(110, 160), d=0.4, rip=rip, flip=flip)
            wherry(sc, rng, rng.u(160, 320), y_near - rng.u(40, 90), rng.u(60, 90), d=0.1, rip=rip,
                   people=(('rameur', 0.4), ('homme', 0.66))) if year < 1900 else None


def terrace(sc, rng, y0, year, time, lamps=True):
    """Terrasse dallée et balustrade (bord de fleuve ou de lac)."""
    with material('sol'):
        ground = (YY > y0).astype(np.float32)
        sc.put(ground, 0.9 - 0.06 * smooth(y0 + 100, H, YY) + (fbm(rng, 70, 3, aspect=3.0) - 0.5) * 0.04, flow=-0.05, fw=0.6, ln=1.4)
    with material('pierre'):
        gy, hb = balustrade(sc, rng, y0 - 240, y0 + 14, y0 - 14, s0=17.0, pier_every=9, lamps=(1, 4) if lamps else (), lamp_h=80)
    return gy


# ───────────────────────────── planches ─────────────────────────────

def londres_tamise(sc, rng, year, time):
    """La City vue de la rive sud : dôme de Saint-Paul (achevé en 1711), flèches de Wren, Tamise."""
    hz = int(rng.u(600, 650))
    meta = heavens(sc, rng, hz, time)
    with material('montagne'):
        hills(sc, rng, hz - 16, 26, v=0.82, d=0.9)
    G = Group()
    with material('pierre'):
        city_row(G, rng, 0, W, hz - 22, 12, 24, 12, 22, d=0.8, side=0.1)
    G.commit(sc)
    spx = rng.u(330, 490)
    sp = Group()
    with material('pierre'):
        for x, k in zip(sorted(rng.u(40, 780, 6)), ['needle', 'tiered', 'cupola', 'lantern', 'needle', 'tiered']):
            if abs(x - spx) > 110:
                spire(sp, x, hz - 16, rng.u(0.75, 1.0), k, 0.65, rng.u(32, 46))
        st_paul(sp, rng, spx, hz - 12, 1.0, d=0.45)
    sp.commit(sc)
    near = Group()
    with material('pierre'):
        city_row(near, rng, 0, W, hz - 2, 20, 36, 22, 40, d=0.55, side=0.14, skip=(spx - 130, spx + 110))
    near.commit(sc)
    with material('eau'):
        rip = water(sc, rng, hz + 2, 880, v_far=0.86 if time != 'nuit' else 0.56, v_near=0.7 if time != 'nuit' else 0.38, k=0.6, fade=240)
    boats(sc, rng, year, hz, 860, rip)
    terrace(sc, rng, 900, year, time)
    strollers(sc, rng, year, (930, 975), time)
    if rng.u() < 0.6:
        tx = rng.u(20, 70) if rng.u() < 0.5 else rng.u(740, 790)
        with material('feuillage'):
            tree(sc, rng, tx, 990, rng.u(700, 860), 220, v_lit=0.72, v_dark=0.26,
                 env=[(tx - 10, 300, 140, 190), (tx + (80 if tx < 400 else -80), 180, 90, 90), (tx, 500, 100, 130)], density=1.2)
    return meta


def paris_cite(sc, rng, year, time):
    """Notre-Dame vue de la Seine. Sa flèche : présente avant 1786, déposée de 1792 à 1859, rebâtie ensuite."""
    hz = int(rng.u(620, 670))
    meta = heavens(sc, rng, hz, time, sun_side=-1)
    lights = []
    G = Group()
    lit = lit_for(time)
    with material('pierre'):
        quay_row(G, rng, -20, rng.u(150, 200), hz - 18, 60, 95, d=0.55, lit_windows=lit, light=lights)
        quay_row(G, rng, rng.u(610, 650), 840, hz - 18, 70, 110, d=0.45, lit_windows=lit, light=lights)
    G.commit(sc)
    nd = Group()
    x0 = rng.u(190, 240)
    with material('pierre'):
        notre_dame(nd, rng, x0, hz - 16, u=3.3, d=0.32, lit=0.9, sh=0.6, roof=0.5)
    if year < 1786 or 1859 <= year < 2019 or year >= 2024:
        u = 3.3
        cx, base = x0 + 57 * u, hz - 16 - 43 * u
        with material('toit'):
            nd.put(lay(0.2).poly([(cx - 2.2 * u, base), (cx + 2.2 * u, base), (cx, base - 50 * u)]).arr(), split(cx, air(0.6, 0.32), air(0.4, 0.32), 1))
        nd.ink(lay(0.0).line([(cx, base - 50 * u), (cx, base - 54 * u)], 1.0).arr(), 0.6)
    nd.commit(sc)
    qw = Group()
    with material('pierre'):
        quay_wall(qw, rng, hz - 18, hz + 10, v=0.72, d=0.3)
    qw.commit(sc)
    with material('eau'):
        rip = water(sc, rng, hz + 10, 1000, v_far=0.86 if time != 'nuit' else 0.56, v_near=0.68 if time != 'nuit' else 0.36, k=0.55, fade=240)
    boats(sc, rng, year, hz, 900, rip)
    # quai du premier plan, parapet en biais, réverbère
    fg = Group()
    side = 1 if rng.u() < 0.5 else -1
    xs = lambda x: x if side > 0 else W - x
    with material('pierre'):
        par = lay(0.4).poly([(xs(-10), 948), (xs(120), 968), (xs(330), 1010), (xs(420), 1152), (xs(-10), 1152)])
        fg.put(par.arr(), ramp_y(948, 1152, 0.7, 0.5), flow=0.35 * side, fw=0.7, ln=1.2)
        top = lay(0.3).poly([(xs(-10), 940), (xs(120), 960), (xs(334), 1002), (xs(330), 1012), (xs(120), 970), (xs(-10), 950)])
        fg.put(top.arr(), 0.88, flow=0.2 * side, fw=0.9, ln=1.5)
    fg.commit(sc)
    with material('metal'):
        lamp(sc, xs(70), 950, 170)
    strollers(sc, rng, year, (950, 990), time, n=2, xs=[xs(190), xs(232)])
    return meta


def geneve_rade(sc, rng, year, time):
    """La rade de Genève : le Mont-Blanc au loin, le Salève, la vieille ville et Saint-Pierre ;
    barques à voiles latines (jusqu'aux années 1930), vapeurs (dès 1823), jet d'eau (dès 1891)."""
    hz = int(rng.u(600, 640))
    meta = heavens(sc, rng, hz, time)
    mountains(sc, rng, hz - 30, [(rng.u(560, 640), 150, 140), (rng.u(680, 760), 120, 110), (rng.u(440, 520), 90, 100)], d=0.75, snow=0.5)
    mountains(sc, rng, hz - 4, [(rng.u(250, 420), 70, 260)], d=0.45, v_lit=0.7, v_sh=0.56, snow=0.0)
    lights = []
    G = Group()
    lit = lit_for(time)
    with material('pierre'):
        house_row(G, rng, -10, 330, hz + 6, 34, 62, 26, 44, d=0.35, style='geneve', lit=lit, lights=lights)
    G.commit(sc)
    c = Group()
    cx = rng.u(120, 230)
    church(c, rng, cx, hz - 26, 0.9, d=0.4, kind='carre', clock=False, nave=False)
    church(c, rng, cx + 46, hz - 26, 0.9, d=0.4, kind='carre', clock=True, nave=False)
    if year >= 1898:
        with material('toit'):
            c.put(lay(0.2).poly([(cx + 16, hz - 100), (cx + 30, hz - 100), (cx + 23, hz - 170)]).arr(), air(0.42, 0.4))
    c.commit(sc)
    with material('eau'):
        rip = water(sc, rng, hz + 6, 940, v_far=0.86 if time != 'nuit' else 0.56, v_near=0.68 if time != 'nuit' else 0.36, k=0.6, fade=260)
    if year >= 1891:
        jet_deau(sc, rng, rng.u(470, 600), hz + 14, rng.u(280, 360), d=0.3)
    boats(sc, rng, year, hz, 900, rip, lake=True, flip=1 if rng.u() < 0.5 else -1)
    terrace(sc, rng, 930, year, time)
    strollers(sc, rng, year, (950, 985), time)
    return meta


def vallee_de_joux(sc, rng, year, time):
    """La Vallée de Joux sous la neige : le Risoux et ses sapins, la Dent de Vaulion, le lac gelé,
    les fermes où les paysans-horlogers travaillaient l'hiver à la fenêtre."""
    hz = int(rng.u(520, 580))
    meta = heavens(sc, rng, hz, time, clouds=rng.u() < 0.5)
    flip = rng.u() < 0.5
    dent = rng.u(560, 700) if not flip else rng.u(120, 260)
    mountains(sc, rng, hz, [(dent, 150, 120), (W - dent, 70, 330)], d=0.55, v_lit=0.86, v_sh=0.66, snow=0.9, slant=0.3, rough=0.1)
    forest(sc, rng, -10, W + 10, hz - 4, 24, 40, d=0.6, snow=True, rows=2, density=1.3)
    with material('neige'):
        lake = ((YY > hz + 30) & (YY < hz + 84)).astype(np.float32)
        sc.put(ndi.gaussian_filter(lake, 2), air(0.88, 0.35) + (fbm(rng, 30, 2, aspect=6.0) - 0.5) * 0.05, flow=0.0, fw=0.95, ln=2.0)
    snowfield(sc, rng, hz + 84, H, v0=0.95, v1=0.86)
    lights = []
    lit = lit_for(time)
    G = Group()
    chimneys = []
    # le village au bord du lac
    for k in range(rng.i(5, 8)):
        x = rng.u(60, 740)
        base = hz + rng.u(110, 170)
        w = rng.u(70, 110) * (base - hz) / 140
        chimneys.append(farm(G, rng, x, base, w, w * 0.34, d=0.25, snow=True, lit=lit, lights=lights))
    church(G, rng, rng.u(330, 480), hz + 120, 0.75, d=0.3, kind='carre', clock=True)
    G.commit(sc)
    # la grande ferme du premier plan, côté opposé à la Dent
    F = Group()
    fx = rng.u(430, 560) if not flip else rng.u(-20, 80)
    chim = farm(F, rng, fx, rng.u(820, 860), 300, 100, d=0.0, snow=True, lit=lit, lights=lights)
    F.commit(sc)
    for cx, cy in chimneys[: rng.i(1, 3)] + [chim]:
        smoke(sc, rng, cx, cy, rng.u(70, 130), d=0.2, drift=0.5)
    fence = lay(0.3)
    for k in range(14):
        x = 40 + k * 40 + rng.u(-4, 4)
        y = 905 + k * 2
        fence.line([(x, y), (x, y - 26)], 2.2)
    fence.line([(40, 888), (600, 914)], 1.4)
    with material('bois'):
        sc.put(fence.arr() * (np.abs(XX - fx - 150) > 180), 0.3)
    fg = Group()
    for k in range(rng.i(2, 4)):
        fir(fg, rng, rng.u(-30, 110) if (k % 2) != flip else rng.u(700, 840), rng.u(1000, 1080), rng.u(380, 520), d=0.0, snow=True)
    fg.commit(sc)
    strollers(sc, rng, year, (920, 950), time, n=rng.i(1, 3))
    return meta


def chaux_de_fonds(sc, rng, year, time):
    """La Chaux-de-Fonds en damier (plan de 1835) vue des hauteurs : longues rangées parallèles
    d'immeubles d'horlogers aux fenêtres serrées, jardins entre les rangs, le Grand Temple,
    les cheminées d'usine ; le Pouillerel boisé au fond."""
    hz = int(rng.u(330, 380))
    meta = heavens(sc, rng, hz, time, clouds=rng.u() < 0.6)
    snow = rng.u() < 0.35
    mountains(sc, rng, hz + 30, [(rng.u(100, 300), 90, 320), (rng.u(520, 760), 70, 300)], d=0.55, v_lit=0.66, v_sh=0.5, snow=0.9 if snow else 0.0, slant=0.2, rough=0.04)
    forest(sc, rng, -10, W + 10, hz + 20, 18, 30, d=0.55, snow=snow, rows=2)
    (snowfield if snow else meadow)(sc, rng, hz + 40, H)
    lights = []
    lit = lit_for(time)
    temple = rng.i(1, 3)
    tx = rng.u(250, 560)
    for r in range(6):
        t = r / 5
        base = hz + 110 + t ** 1.35 * 560
        k = 0.5 + 1.3 * t
        d = 0.5 * (1 - t)
        G = Group()
        skip = [(tx - 60 * k, tx + 60 * k)] if r == temple else []
        with material('pierre'):
            house_row(G, rng, -40 + r * 23, W + 30, base, 46 * k, 58 * k, 70 * k, 120 * k, d=d, style='atelier', lit=lit, lights=lights, snow=snow, skip=skip)
        if r == temple:
            church(G, rng, tx, base, 0.9 * k, d=d, kind='fleche' if year < 1919 else 'carre', clock=True, nave=False)
        G.commit(sc)
        # jardins et arbres entre les rangs
        if r < 5:
            T = Group()
            for j in range(rng.i(2, 5)):
                with material('feuillage'):
                    tr = lay(0.6).ellipse(rng.u(0, W), base + 18 * k, 16 * k, 11 * k).arr()
                    T.put(tr, air(0.42, d))
            T.commit(sc)
        if r in (1, 3) and year >= 1850 and rng.u() < 0.8:
            F = Group()
            cx, cy = factory(F, rng, rng.u(560, 700), base - 40 * k, 100 * k, 34 * k, d=d, lit=lit, lights=lights)
            F.commit(sc)
            if time != 'nuit':
                smoke(sc, rng, cx, cy, 80 * k, d=d)
    with material('sol'):
        road = (YY > 940).astype(np.float32)
        sc.put(road, 0.84 - 0.05 * smooth(950, H, YY) + (fbm(rng, 40, 2, aspect=4.0) - 0.5) * 0.04, flow=0.0, fw=0.7, ln=1.6)
    strollers(sc, rng, year, (955, 985), time)
    return meta


def le_locle(sc, rng, year, time):
    """Un vallon jurassien (Le Locle, Saint-Imier, Fleurier…) : la ville au fond de la vallée,
    le temple et son horloge, les forêts de sapins de part et d'autre, les fabriques après 1870."""
    hz = int(rng.u(520, 580))
    meta = heavens(sc, rng, hz, time)
    snow = rng.u() < 0.35
    mountains(sc, rng, hz + 20, [(rng.u(80, 200), 120, 300), (rng.u(620, 760), 135, 320)], d=0.45, v_lit=0.62, v_sh=0.46, snow=0.9 if snow else 0.0, slant=0.2, rough=0.04)
    forest(sc, rng, -10, 300, hz + 10, 30, 46, d=0.45, snow=snow, rows=2)
    forest(sc, rng, 520, W + 10, hz + 10, 30, 46, d=0.45, snow=snow, rows=2)
    (snowfield if snow else meadow)(sc, rng, hz + 60, H)
    lights = []
    lit = lit_for(time)
    G = Group()
    with material('pierre'):
        house_row(G, rng, 120, 700, hz + 110, 40, 64, 40, 70, d=0.35, style='jura', lit=lit, lights=lights, snow=snow, skip=[(370, 430)])
    church(G, rng, 400, hz + 110, 0.8, d=0.35, kind='carre', clock=True)
    G.commit(sc)
    if year >= 1870:
        F = Group()
        cx, cy = factory(F, rng, rng.u(500, 620), hz + 150, 150, 46, d=0.3, lit=lit, lights=lights)
        F.commit(sc)
        if time != 'nuit':
            smoke(sc, rng, cx, cy, 120, d=0.3)
    fg = Group()
    chim = farm(fg, rng, rng.u(-40, 80) if rng.u() < 0.5 else rng.u(560, 680), rng.u(860, 900), 220, 70, d=0.0, snow=snow, lit=lit, lights=lights)
    fg.commit(sc)
    smoke(sc, rng, chim[0], chim[1], 120, d=0.1)
    strollers(sc, rng, year, (930, 965), time, n=rng.i(1, 3))
    return meta


def neuchatel(sc, rng, year, time):
    """Neuchâtel : le lac, la chaîne des Alpes à l'horizon, le château et la collégiale ;
    l'observatoire cantonal (1858) sur la colline."""
    hz = int(rng.u(600, 650))
    meta = heavens(sc, rng, hz, time)
    mountains(sc, rng, hz - 2, [(x, rng.u(40, 90), rng.u(70, 120)) for x in np.linspace(380, 820, 6)], d=0.85, snow=0.75)
    lights = []
    lit = lit_for(time)
    G = Group()
    with material('feuillage'):
        G.put(lay(0.5).poly([(-10, hz + 10), (-10, hz - 150), (160, hz - 120), (330, hz - 40), (380, hz + 10)]).arr(), ramp_x(0, 380, air(0.5, 0.4), air(0.62, 0.4)), flow=0.3, fw=0.4)
    with material('pierre'):
        house_row(G, rng, -10, 380, hz + 8, 30, 54, 24, 40, d=0.35, style='geneve', lit=lit, lights=lights)
    church(G, rng, rng.u(110, 180), hz - 110, 0.8, d=0.4, kind='fleche', clock=True)
    with material('pierre'):
        G.put(lay(0.3).rect(220, hz - 90, 300, hz - 40).arr(), ramp_x(220, 300, air(0.88, 0.4), air(0.66, 0.4)))
    with material('toit'):
        G.put(lay(0.3).poly([(216, hz - 90), (304, hz - 90), (290, hz - 110), (230, hz - 110)]).arr(), air(0.46, 0.4))
    if year >= 1858:
        observatory(G, rng, rng.u(40, 90), hz - 150, 0.55, d=0.45, open_=time == 'nuit', glow=time == 'nuit')
    G.commit(sc)
    with material('eau'):
        rip = water(sc, rng, hz + 8, 940, v_far=0.88 if time != 'nuit' else 0.56, v_near=0.7 if time != 'nuit' else 0.38, k=0.6, fade=260)
    boats(sc, rng, year, hz, 900, rip, lake=True)
    terrace(sc, rng, 930, year, time)
    with material('feuillage'):
        deciduous(sc, rng, rng.u(700, 790), 940, 380, 200, d=0.0)
    strollers(sc, rng, year, (950, 985), time)
    return meta


def bienne(sc, rng, year, time):
    """Bienne au pied du Jura : la première chaîne boisée, la vieille ville et ses tours,
    le lac ; les fabriques d'horlogerie à partir du milieu du XIXe siècle."""
    hz = int(rng.u(560, 610))
    meta = heavens(sc, rng, hz, time)
    mountains(sc, rng, hz + 20, [(rng.u(150, 330), 170, 440), (rng.u(560, 760), 150, 400)], d=0.4, v_lit=0.6, v_sh=0.45, snow=0.0, slant=0.2, rough=0.04)
    forest(sc, rng, -10, W + 10, hz + 18, 24, 36, d=0.45, rows=2)
    meadow(sc, rng, hz + 24, H)
    lights = []
    lit = lit_for(time)
    G = Group()
    with material('pierre'):
        house_row(G, rng, -10, 520, hz + 90, 40, 70, 30, 52, d=0.35, style='rhin', lit=lit, lights=lights, skip=[(200, 250)])
    church(G, rng, 225, hz + 90, 0.75, d=0.35, kind='fleche', clock=True, nave=False)
    G.commit(sc)
    with material('eau'):
        lake = ((XX > 560) & (YY > hz + 30) & (YY < hz + 150)).astype(np.float32)
        sc.put(ndi.gaussian_filter(lake, 3), air(0.86 if time != 'nuit' else 0.5, 0.3), flow=0.0, fw=0.95, ln=2.0)
    if year >= 1850:
        F = Group()
        cx, cy = factory(F, rng, rng.u(380, 560), hz + 170, 220, 60, d=0.25, lit=lit, lights=lights)
        F.commit(sc)
        if time != 'nuit':
            smoke(sc, rng, cx, cy, 140, d=0.25)
    with material('sol'):
        road = (YY > 920).astype(np.float32)
        sc.put(road, 0.86 - 0.05 * smooth(930, H, YY), flow=0.0, fw=0.7, ln=1.6)
    with material('feuillage'):
        deciduous(sc, rng, rng.u(20, 90), 930, 420, 220, d=0.0)
    strollers(sc, rng, year, (945, 975), time)
    return meta


def schaffhouse(sc, rng, year, time):
    """Schaffhouse et le Rhin : le Munot (1589) sur sa colline de vignes, la vieille ville
    aux pignons, le fleuve et ses barques plates."""
    hz = int(rng.u(560, 610))
    meta = heavens(sc, rng, hz, time)
    with material('feuillage'):
        hill = lay(0.5).poly([(380, hz + 60), (500, hz - 110), (700, hz - 140), (830, hz - 100), (830, hz + 60)]).arr()
        sc.put(hill, ramp_x(380, 830, air(0.66, 0.4), air(0.5, 0.4)), flow=0.2, fw=0.4)
        vines = lay(0.0)
        for k in range(9):
            y = hz - 90 + k * 16
            vines.line([(470 + k * 6, y), (820, y - 20)], 0.8)
        sc.ink(vines.arr() * hill, 0.25)
    G = Group()
    munot(G, rng, rng.u(600, 680), hz - 108, 0.9, d=0.4)
    lights = []
    lit = lit_for(time)
    with material('pierre'):
        house_row(G, rng, -10, 560, hz + 50, 50, 84, 28, 46, d=0.35, style='rhin', lit=lit, lights=lights, skip=[(250, 300)])
    church(G, rng, 275, hz + 50, 0.85, d=0.35, kind='fleche', clock=True, nave=False)
    G.commit(sc)
    with material('eau'):
        rip = water(sc, rng, hz + 52, 930, v_far=0.82 if time != 'nuit' else 0.52, v_near=0.66 if time != 'nuit' else 0.36, k=0.6, fade=220)
    with material('bois'):
        for k in range(rng.i(1, 3)):
            barge(sc, rng, rng.u(120, 600), rng.u(hz + 110, 860), rng.u(70, 110), 18, d=0.2, rip=rip, flip=1)
    terrace(sc, rng, 930, year, time, lamps=year >= 1800)
    strollers(sc, rng, year, (950, 985), time)
    return meta


def glashutte(sc, rng, year, time):
    """Glashütte dans l'Erzgebirge : la vallée de la Müglitz, les collines boisées, les maisons
    à colombages et l'église au clocher baroque, le pont de pierre, les manufactures (Lange, 1845)."""
    hz = int(rng.u(500, 560))
    meta = heavens(sc, rng, hz, time)
    snow = rng.u() < 0.3
    mountains(sc, rng, hz + 40, [(rng.u(60, 220), 120, 340), (rng.u(600, 780), 130, 350)], d=0.45, v_lit=0.6, v_sh=0.44, snow=0.95 if snow else 0.0, slant=0.2, rough=0.04)
    forest(sc, rng, -10, 330, hz + 40, 26, 42, d=0.45, snow=snow, rows=2)
    forest(sc, rng, 520, W + 10, hz + 40, 26, 42, d=0.45, snow=snow, rows=2)
    (snowfield if snow else meadow)(sc, rng, hz + 50, H)
    lights = []
    lit = lit_for(time)
    G = Group()
    with material('pierre'):
        house_row(G, rng, 40, 780, hz + 130, 46, 70, 40, 64, d=0.3, style='saxe', lit=lit, lights=lights, snow=snow, skip=[(380, 450)])
    church(G, rng, 415, hz + 130, 1.0, d=0.3, kind='bulbe', clock=True)
    if year >= 1845:
        factory(G, rng, rng.u(520, 620), hz + 210, 190, 64, d=0.2, lit=lit, lights=lights)
    G.commit(sc)
    # la Müglitz et son pont de pierre à arches
    ry = hz + int(rng.u(250, 290))
    with material('eau'):
        rv = ((YY > ry) & (YY < ry + 70)).astype(np.float32)
        sc.put(ndi.gaussian_filter(rv, 2), air(0.84 if time != 'nuit' else 0.5, 0.1) + (fbm(rng, 10, 2, aspect=6.0) - 0.5) * 0.05, flow=0.0, fw=0.95, ln=1.8)
    B = Group()
    bx0, bx1 = rng.u(120, 260), rng.u(520, 680)
    with material('pierre'):
        deck = lay(0.4).rect(bx0, ry - 18, bx1, ry + 34).arr()
        B.put(deck, ramp_y(ry - 18, ry + 34, air(0.88, 0.1), air(0.68, 0.1)), flow=0.0, fw=0.7)
        B.put(lay(0.3).rect(bx0 - 6, ry - 26, bx1 + 6, ry - 16).arr(), air(0.92, 0.1), flow=0.0, fw=0.9)
    n = 3
    for k in range(n):
        ax = bx0 + (k + 0.5) * (bx1 - bx0) / n
        with material('vitre'):
            arch = disc(ax, ry + 34, (bx1 - bx0) / n * 0.36, 1.0) * (YY > ry + 2) * (YY < ry + 35)
            B.put(arch, air(0.26, 0.1))
    B.reflect(sc, ry + 34, k=0.5, ripple=fbm(rng, 10, 3, aspect=9.0) - 0.5, amp=6, fade=40)
    B.commit(sc)
    R = Group()
    fir(R, rng, rng.u(-30, 60) if rng.u() < 0.5 else rng.u(750, 840), rng.u(1010, 1080), rng.u(420, 560), d=0.0, snow=snow)
    R.commit(sc)
    strollers(sc, rng, year, (930, 965), time)
    return meta


def en_mer(sc, rng, year, time):
    """En mer : la houle, le soleil bas, un vaisseau de l'époque (voiles jusqu'en 1860,
    vapeur gréé ensuite, paquebot sans vergues après 1910), des goélands."""
    hz = int(rng.u(700, 760))
    meta = heavens(sc, rng, hz, time if time != 'jour' else 'couchant')
    if rng.u() < 0.6:
        with material('montagne'):
            hills(sc, rng, hz + 1, 40, v=0.66, d=0.55, x0=0, x1=int(rng.u(200, 360)))
    with material('eau'):
        sea(sc, rng, hz, v_far=0.84 if time != 'nuit' else 0.5, v_near=0.5 if time != 'nuit' else 0.28, amp=0.9, sun=meta['sun'])
    with material('toile'):
        if year is None:
            pass  # sans année, pas de navire qui daterait la scène
        elif year < 1860:
            ship_under_sail(sc, rng, rng.u(80, 200), hz + rng.u(150, 180), rng.u(380, 440), rng.u(480, 540), d=0.0, heel=-0.05)
        else:
            steamship(sc, rng, rng.u(60, 160), hz + rng.u(150, 190), rng.u(500, 580), d=0.0, year=year)
    for k in range(rng.i(2, 5)):
        gull(sc, rng.u(450, 720), rng.u(380, 560), rng.u(0.7, 1.4))
    return meta


def etabli(sc, rng, year, time):
    """L'établi à la fenêtre : un mouvement ouvert, les brucelles, le tournevis, la loupe ;
    avant 1500, un astrolabe ; chandelle, lampe à huile ou lampe électrique selon l'époque ;
    au mur, un régulateur (après 1680). Sans année connue, rien qui date la scène : ni régulateur,
    ni lampe, ni montre-bracelet."""
    known = year is not None
    meta = {'hz': 560, 'time': time, 'sun': None, 'stars': None}
    set_haze(0.9 if time != 'nuit' else 0.7)
    left = rng.u() < 0.5
    with material('pierre'):
        sc.put(np.ones((H, W), np.float32), 0.72 + 0.06 * (fbm(rng, 160, 3) - 0.5) - 0.1 * smooth(200, 900, YY * 0.5 + np.abs(XX - 408)), flow=math.pi / 2, fw=0.2, ln=1.5)
    # fenêtre : un paysage du Jura, de jour ou de nuit
    wx0 = rng.u(70, 130) if left else rng.u(330, 400)
    wx1 = wx0 + rng.u(330, 390)
    wy0, wy1 = 200, 640
    win = ((XX > wx0) & (XX < wx1) & (YY > wy0) & (YY < wy1)).astype(np.float32)
    view = Scene(0.9)
    vm = heavens(view, rng, 520, time, clouds=True)
    if rng.u() < 0.5:
        mountains(view, rng, 580, [(rng.u(wx0, wx1), 120, 220), (rng.u(wx0, wx1), 80, 180)], d=0.4, snow=0.6 if rng.u() < 0.5 else 0.0)
        forest(view, rng, wx0 - 20, wx1 + 20, 600, 30, 46, d=0.3, rows=1)
        with material('feuillage'):
            view.put((YY > 600).astype(np.float32), air(0.55, 0.2))
    else:
        # les toits d'en face et un clocher
        T = Group()
        with material('pierre'):
            house_row(T, rng, wx0 - 30, wx1 + 30, 660, 60, 140, 50, 90, d=0.2, style=rng.r.choice(['jura', 'rhin', 'geneve']), lit=lit_for(time))
        church(T, rng, rng.u(wx0 + 60, wx1 - 60), 560, 0.9, d=0.35, kind=rng.r.choice(['fleche', 'carre']), clock=True, nave=False)
        T.commit(view)
    sc.put(win, view.img)
    sc.mat[win > 0.5] = view.mat[win > 0.5]
    sc.pen = np.maximum(sc.pen, view.pen * win)
    sc.hi = np.maximum(sc.hi, view.hi * win)
    if vm.get('stars') is not None:
        meta['stars'] = vm['stars'] * win
    with material('bois'):
        frame = lay(0.2)
        for x in (wx0, (wx0 + wx1) / 2, wx1):
            frame.rect(x - 7, wy0 - 7, x + 7, wy1 + 7)
        for y in (wy0, (wy0 + wy1) / 2, wy1):
            frame.rect(wx0 - 7, y - 7, wx1 + 7, y + 7)
        sc.put(frame.arr(), 0.5, flow=0.0, fw=0.6)
        sill = ((YY > wy1 + 7) & (YY < wy1 + 30) & (XX > wx0 - 34) & (XX < wx1 + 34)).astype(np.float32)
        sc.put(sill, 0.84)
        sc.light(sill * (YY < wy1 + 12), 0.4)
    # régulateur au mur (horloge à balancier, après 1680)
    if known and year >= 1680:
        rx = (wx1 + 820) / 2 if left else wx0 / 2
        with material('bois'):
            case = lay(0.3).rect(rx - 46, 220, rx + 46, 600).arr()
            sc.put(case, ramp_x(rx - 46, rx + 46, 0.5, 0.32), flow=math.pi / 2, fw=0.8)
            sc.put(lay(0.3).poly([(rx - 54, 220), (rx + 54, 220), (rx, 180)]).arr(), 0.4)
        with material('metal'):
            sc.put(disc(rx, 280, 34, 1.0), 0.92)
            hands = lay(0.0)
            hands.line([(rx, 280), (rx - 8, 262)], 2.2)
            hands.line([(rx, 280), (rx + 20, 272)], 1.6)
            sc.ink(hands.arr() + np.clip(1 - np.abs(np.sqrt((XX - rx) ** 2 + (YY - 280) ** 2) - 30) / 1.0, 0, 1) * 0.6, 0.7)
            sc.put(lay(0.2).rect(rx - 22, 340, rx + 22, 560).arr(), 0.3)
            sc.put(lay(0.0).line([(rx, 340), (rx + 6, 500)], 1.6).arr(), 0.86)
            bob = disc(rx + 6, 510, 13, 1.0)
            sc.put(bob, 0.9)
            sc.light(bob * (XX < rx + 4), 0.6)
    # l'établi : plateau incliné vers l'horloger, chant, tiroir
    with material('bois'):
        top = lay(0.3).poly([(-10, 740), (826, 720), (826, 880), (-10, 900)]).arr()
        sc.put(top, ramp_y(720, 900, 0.8, 0.62) + (fbm(rng, 6, 3, aspect=8.0) - 0.5) * 0.08, flow=-0.02, fw=0.95, ln=2.0)
        front = ((YY > 880 + 20 * (1 - XX / W))).astype(np.float32)
        sc.put(front, 0.44 + (fbm(rng, 8, 3, aspect=9.0) - 0.5) * 0.05, flow=0.0, fw=0.95, ln=2.0)
        sc.ink(lay(0.0).line([(-10, 899), (826, 879)], 1.4).arr(), 0.5)
    # l'objet : astrolabe avant 1500, sinon un mouvement de montre, platine et rouages
    cx, cy = (rng.u(420, 520) if left else rng.u(200, 320)), 812
    with material('metal'):
        if known and year < 1500:
            r = 120
            sc.put(lay(0.2).ellipse(cx, cy - 10, r, r * 0.42).arr(), ramp_x(cx - r, cx + r, 0.86, 0.6))
            rings = lay(0.0)
            for k in (0.92, 0.66, 0.4):
                rings.ellipse(cx, cy - 10, r * k, r * k * 0.42)
            ra = rings.arr()
            sc.ink(np.clip(ndi.morphological_gradient(ra, size=3) * 3, 0, 1), 0.5)
            sc.ink(lay(0.0).line([(cx - r * 0.9, cy - 6), (cx + r * 0.9, cy - 14)], 1.8).arr(), 0.6)
            sc.light(lay(0.2).ellipse(cx - r * 0.35, cy - 26, r * 0.3, 6).arr(), 0.5)
        elif rng.u() < 0.45:
            # montre ouverte : boîte, cadran à index, aiguilles ; bracelet après 1910, sinon pendant et chaîne
            r = 96
            wrist = known and year >= 1910 and rng.u() < 0.6
            if wrist:
                with material('bois'):
                    sc.put(lay(0.4).poly([(cx - r * 1.9, cy - 6), (cx - r * 0.7, cy - 18), (cx - r * 0.7, cy + 4), (cx - r * 1.9, cy + 14)]).arr(), 0.3, flow=0.0, fw=0.8)
                    sc.put(lay(0.4).poly([(cx + r * 0.7, cy - 18), (cx + r * 1.9, cy - 28), (cx + r * 1.9, cy - 8), (cx + r * 0.7, cy + 4)]).arr(), 0.3, flow=0.0, fw=0.8)
                r = 66
            case = lay(0.2).ellipse(cx, cy - 12, r, r * 0.5).arr()
            sc.put(case, ramp_x(cx - r, cx + r, 0.9, 0.55))
            dial_ = lay(0.2).ellipse(cx, cy - 13, r * 0.84, r * 0.42).arr()
            sc.put(dial_, 0.96)
            idx = lay(0.0)
            for k in range(12):
                a = k * math.pi / 6
                idx.line([(cx + math.cos(a) * r * 0.7, cy - 13 + math.sin(a) * r * 0.35), (cx + math.cos(a) * r * 0.78, cy - 13 + math.sin(a) * r * 0.39)], 1.6)
            idx.line([(cx, cy - 13), (cx - r * 0.28, cy - 13 - r * 0.2)], 2.2)
            idx.line([(cx, cy - 13), (cx + r * 0.5, cy - 13 - r * 0.06)], 1.6)
            sc.ink(idx.arr(), 0.8)
            if not wrist:
                sc.put(lay(0.2).rect(cx - 6, cy - 12 - r * 0.5 - 14, cx + 6, cy - 12 - r * 0.5 + 2).arr(), 0.8)
                chain = lay(0.0).line([(cx, cy - 12 - r * 0.5 - 14)] + [(cx + 40 + k * 30, cy - 70 + 26 * math.sin(k * 0.9)) for k in range(6)], 1.6)
                sc.ink(chain.arr(), 0.5)
            sc.light(lay(0.1).ellipse(cx - r * 0.45, cy - 26, r * 0.25, 4).arr(), 0.6)
        else:
            r = 112
            plate_ = lay(0.2).ellipse(cx, cy - 12, r, r * 0.42).arr()
            sc.put(plate_, ramp_x(cx - r, cx + r, 0.88, 0.58))
            sc.ink(np.clip(ndi.morphological_gradient(plate_, size=3) * 2, 0, 1), 0.5)
            for gx, gy, gr in ((cx - 34, cy - 18, 40), (cx + 40, cy - 6, 27), (cx + 12, cy - 34, 18), (cx - 70, cy - 2, 15)):
                g = lay(0.2).ellipse(gx, gy, gr, gr * 0.42).arr()
                sc.put(g, 0.94)
                ang = np.arctan2((YY - gy) / 0.42, XX - gx)
                rad = np.sqrt(((XX - gx) / gr) ** 2 + ((YY - gy) / (gr * 0.42)) ** 2)
                teeth = 0.5 + 0.5 * np.sin(ang * max(12, gr * 0.8))
                sc.ink(g * (rad > 0.84) * (teeth > 0.5), 0.55)
                sc.ink(g * (np.abs(np.sin(ang * 2)) < 0.12) * (rad < 0.8) * (rad > 0.2), 0.35)
                sc.ink(lay(0.0).ellipse(gx, gy, 3, 1.5).arr(), 0.8)
            bal = lay(0.0).ellipse(cx + 66, cy - 26, 22, 9).arr()
            sc.ink(np.clip(ndi.morphological_gradient(bal, size=2) * 3, 0, 1), 0.7)
            sc.light(lay(0.1).ellipse(cx - r * 0.45, cy - 28, r * 0.25, 4).arr(), 0.6)
        tools = lay(0.0)
        tx = cx + (180 if cx < 408 else -330)
        tools.line([(tx, cy + 30), (tx + 160, cy - 8)], 3.0)              # brucelles
        tools.line([(tx, cy + 37), (tx + 160, cy - 4)], 2.6)
        sx = cx + (-260 if cx > 300 else 220)
        tools.line([(sx, cy + 50), (sx + 130, cy + 26)], 5.0)             # tournevis
        sc.put(tools.arr(), 0.4)
        sc.light(lay(0.0).line([(tx + 10, cy + 27), (tx + 150, cy - 6)], 1.0).arr(), 0.4)
        lx = cx + (130 if cx < 408 else -150)
        loupe = lay(0.2).poly([(lx - 22, cy + 46), (lx + 22, cy + 46), (lx + 28, cy - 4), (lx - 28, cy - 4)]).arr()
        sc.put(loupe, ramp_x(lx - 28, lx + 28, 0.34, 0.16))
        sc.put(lay(0.2).ellipse(lx, cy - 4, 28, 9).arr(), 0.62)
    # la lumière : chandelle, lampe à huile, lampe électrique
    lx = rng.u(640, 740) if left else rng.u(70, 170)
    ly = 760
    with material('metal'):
        if not known:
            pass
        elif year < 1800:
            sc.put(lay(0.2).ellipse(lx, ly, 40, 12).arr(), 0.6)
            sc.put(lay(0.2).rect(lx - 9, ly - 120, lx + 9, ly - 4).arr(), 0.92)
            fy, fx = ly - 136, lx
        elif year < 1900:
            sc.put(lay(0.2).poly([(lx - 30, ly), (lx + 30, ly), (lx + 18, ly - 60), (lx - 18, ly - 60)]).arr(), 0.38)
            sc.put(lay(0.2).ellipse(lx, ly - 104, 26, 42).arr(), 0.9)
            fy, fx = ly - 100, lx
        else:
            arm = lay(0.0)
            d_ = 1 if left else -1
            arm.line([(lx, ly), (lx, ly - 220), (lx - d_ * 90, ly - 290)], 5.0)
            sc.put(arm.arr(), 0.28)
            sc.put(lay(0.2).poly([(lx - d_ * 60, ly - 296), (lx - d_ * 130, ly - 310), (lx - d_ * 142, ly - 250), (lx - d_ * 90, ly - 248)]).arr(), 0.34)
            fy, fx = ly - 250, lx - d_ * 115
    if time != 'jour' and known:
        with material('lumiere'):
            flame = disc(fx, fy, 11 if year < 1800 else 16, 1.0)
            sc.put(flame, 1.0)
            sc.light(flame, 1.0)
        glow = np.exp(-(((XX - fx) ** 2 + (YY - fy) ** 2) / (2 * 220 ** 2)))
        sc.put(glow * 0.45 * (sc.mat != MAT['lumiere']), np.clip(sc.lum() + 0.22, 0, 1))
    return meta


def observatoire(sc, rng, year, time):
    """L'observatoire de nuit : la coupole ouverte, la lunette pointée, le ciel étoilé ;
    les concours de chronométrie s'y jugeaient à l'aune des étoiles."""
    time = 'nuit' if rng.u() < 0.8 or time == 'nuit' else 'couchant'
    hz = int(rng.u(660, 720))
    meta = heavens(sc, rng, hz, time, clouds=rng.u() < 0.4)
    mountains(sc, rng, hz, [(rng.u(80, 300), 60, 260), (rng.u(520, 760), 50, 260)], d=0.6, v_lit=0.6, v_sh=0.48, snow=0.0)
    with material('feuillage'):
        hill = lay(0.6).poly([(-10, hz + 60), (200, hz - 10), (420, hz - 30), (640, hz - 5), (830, hz + 50), (830, H), (-10, H)]).arr()
        sc.put(hill, air(0.52, 0.2) + (fbm(rng, 40, 3) - 0.5) * 0.06, flow=0.1, fw=0.5)
    G = Group()
    ox = rng.u(330, 480)
    observatory(G, rng, ox, hz + 40, 2.3, d=0.1, open_=True, glow=time == 'nuit')
    G.commit(sc)
    for k in range(rng.i(3, 6)):
        x = rng.u(-40, 200) if k % 2 else rng.u(640, 860)
        G2 = Group()
        fir(G2, rng, x, hz + 60 + rng.u(0, 140), rng.u(220, 360), d=0.1)
        G2.commit(sc)
    with material('sol'):
        path = lay(0.6).poly([(ox - 40, hz + 44), (ox + 40, hz + 44), (ox + 260, H), (ox - 160, H)]).arr()
        sc.put(path, air(0.7, 0.05), flow=math.pi / 2, fw=0.5)
    strollers(sc, rng, year, (930, 970), time, n=1, xs=[ox + rng.u(170, 240)])
    return meta


PLATES = {
    'londres-tamise': londres_tamise,
    'paris-cite': paris_cite,
    'geneve-rade': geneve_rade,
    'vallee-de-joux': vallee_de_joux,
    'chaux-de-fonds': chaux_de_fonds,
    'le-locle': le_locle,
    'neuchatel': neuchatel,
    'bienne': bienne,
    'schaffhouse': schaffhouse,
    'glashutte': glashutte,
    'en-mer': en_mer,
    'etabli': etabli,
    'observatoire': observatoire,
}


def build(plate, technique, seed, year):
    """Scène et repères d'une planche pour une carte (graine = slug + plateSeed)."""
    rng = Rng(seed)
    time = techniques.time_for(technique, rng)
    sc = Scene(0.9)
    meta = PLATES[plate](sc, rng, year, time)
    meta.setdefault('time', time)
    if meta['time'] == 'nuit':
        # la nuit, le premier plan s'enfonce dans l'ombre ; les lumières et le ciel restent
        keep = np.isin(sc.mat, [MAT['ciel'], MAT['nuage'], MAT['lumiere']])
        f = 1 - 0.38 * smooth(meta['hz'] + 120, H, YY)
        sc.img = np.where(keep[..., None], sc.img, sc.img * f[..., None])
    return sc, meta, rng


def render(plate, technique, seed, year):
    sc, meta, rng = build(plate, technique, seed, year)
    return techniques.render(sc, technique, rng, meta)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    plate, technique, seed, year, out = args[0], args[1], int(args[2]), None if args[3] == '-' else int(args[3]), args[4]
    if '--ref' in sys.argv:
        sc, meta, rng = build(plate, technique, seed, year)
        img = techniques.colorize(sc, meta['time'], meta['hz']) if '--color' in sys.argv else lut(np.clip(sc.lum(), 0, 1), techniques.SEPIA)
        save(img, out)
    else:
        save(render(plate, technique, seed, year), out)
    print('ok', plate, technique, seed, year)
