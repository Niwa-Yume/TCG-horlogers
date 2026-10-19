"""Les cinq techniques de rareté, appliquées à n'importe quelle planche.

Une planche fournit une Scene modelée en valeurs (avec ses cartes de touche, plume, rehauts
et matières) et des repères (horizon, astres, étoiles). La technique la rend :

GRAVURE      aquatinte sépia sur émail ivoire : peinture à touches, plume, grain d'aquatinte
MARQUETERIE  huit essences de placage, fil orienté, ombrage au sable, rayons de soleil en pointes
GRISAILLE    blanc de Limoges sur émail noir : valeurs de nuit, peinture à touches, rehauts
CLOISONNE    aplats d'émail par matière, cernés de fils d'or, paillons pour les astres et les lumières
GRAND_FEU    miniature en couleurs à touches : palettes de matière, lumière chaude, ombres froides

Les recettes reprennent celles des cinq cadrans de référence (scene_*.py).
"""
import math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, smooth, hexrgb, vignette_cushion
from painter import Scene, paint, lut, aquatint, enamel, marquetry, cloisonne, col3, MAT, MATERIALS

TECHNIQUES = ['GRAVURE', 'MARQUETERIE', 'GRISAILLE', 'CLOISONNE', 'GRAND_FEU']

# fonds d'émail au bord du cadran (ceux des cadrans de référence)
GROUND = {'GRAVURE': '#EFE7D6', 'MARQUETERIE': '#C99D66', 'GRISAILLE': '#0B0C10', 'CLOISONNE': '#0A1433', 'GRAND_FEU': '#F3E9D6'}
SEPIA = [(0, '#2B2119'), (0.5, '#8C7B66'), (0.85, '#D9CEB8'), (1.0, '#F1E9D8')]
GRIS = [(0, '#0B0C10'), (0.3, '#3E3F43'), (0.65, '#A9A6A0'), (1.0, '#F7F4EC')]


def time_for(technique, rng):
    """Le moment de la scène suit la technique : la grisaille est de nuit, le grand feu au couchant…"""
    r = rng.u()
    return {
        'GRAVURE': 'jour',
        'MARQUETERIE': 'jour' if r < 0.6 else 'couchant',
        'GRISAILLE': 'nuit',
        'CLOISONNE': 'nuit' if r < 0.7 else 'couchant',
        'GRAND_FEU': 'couchant' if r < 0.6 else 'jour',
    }[technique]


# ───────────────────────────── palettes de matière ─────────────────────────────
# Valeur (0 sombre .. 1 clair) → couleur, par matière et par moment. Le ciel se colore par la hauteur.

PAL = {
    'jour': {
        'ciel': [(0.0, '#5E7FAE'), (0.6, '#9DB6D6'), (1.0, '#E3ECF0')],
        'nuage': [(0.4, '#7F889E'), (0.75, '#C9CFDA'), (1.0, '#FBFAF5')],
        'lumiere': [(0.0, '#E9C36A'), (1.0, '#FFF7DC')],
        'eau': [(0.15, '#24405E'), (0.55, '#567E9E'), (0.85, '#A9C3D3'), (1.0, '#E6EEF0')],
        'pierre': [(0.15, '#4D4552'), (0.55, '#A8957E'), (0.85, '#E3D3B6'), (1.0, '#F6EEDD')],
        'toit': [(0.15, '#33262A'), (0.5, '#7D4B3C'), (1.0, '#C99172')],
        'bois': [(0.1, '#271A14'), (0.5, '#6A452E'), (1.0, '#B9895C')],
        'toile': [(0.4, '#A99E86'), (1.0, '#F6F0DF')],
        'feuillage': [(0.1, '#17241A'), (0.5, '#45633A'), (1.0, '#A9B56C')],
        'sol': [(0.2, '#54463A'), (0.6, '#A48F70'), (1.0, '#E6D9BB')],
        'neige': [(0.4, '#7E92B4'), (0.8, '#D4DEEC'), (1.0, '#FFFFFF')],
        'montagne': [(0.3, '#55657F'), (0.7, '#919FB6'), (1.0, '#D4DBE6')],
        'figure': [(0.1, '#1C1B26'), (0.35, '#34456B'), (0.55, '#8C3D33'), (0.82, '#D9C3A1'), (1.0, '#F7EBDB')],
        'metal': [(0.1, '#1D2126'), (0.6, '#8A919A'), (1.0, '#EEF2F3')],
        'vitre': [(0.0, '#18202E'), (1.0, '#7C8EA6')],
        'brique': [(0.2, '#43231D'), (0.6, '#97573F'), (1.0, '#DCA585')],
        'vide': [(0.0, '#2A2420'), (1.0, '#F3ECDE')],
    },
    'couchant': {
        'ciel': [(0.0, '#7E9CC2'), (0.35, '#AFB9CF'), (0.62, '#E8C6B4'), (0.85, '#F6D4A6'), (1.0, '#FBE3B4')],
        'nuage': [(0.0, '#6D6890'), (0.55, '#9D8EAE'), (0.75, '#E3A99A'), (0.9, '#F9CFA6'), (1.0, '#FFF0D0')],
        'lumiere': [(0.0, '#F0B85A'), (1.0, '#FFF2C8')],
        'eau': [(0.15, '#2E3557'), (0.5, '#7C7A9A'), (0.8, '#E3B49A'), (1.0, '#FBE3C0')],
        'pierre': [(0.0, '#241F2E'), (0.3, '#4F4A69'), (0.48, '#7F7489'), (0.62, '#B29486'), (0.78, '#DDB78E'), (0.9, '#F5D9AA'), (1.0, '#FFF0D2')],
        'toit': [(0.0, '#1E2030'), (0.35, '#3F4762'), (0.55, '#6B7491'), (0.75, '#A79AA8'), (1.0, '#E9CFC0')],
        'bois': [(0.1, '#231722'), (0.5, '#6E3F35'), (1.0, '#D19A6A')],
        'toile': [(0.3, '#8E7E96'), (0.7, '#E9C6A8'), (1.0, '#FFF3DC')],
        'feuillage': [(0.1, '#1A1A28'), (0.5, '#4A4F4E'), (1.0, '#B5A86C')],
        'sol': [(0.2, '#3E3242'), (0.6, '#9C7B6E'), (1.0, '#F0D3A8')],
        'neige': [(0.3, '#6E6A98'), (0.75, '#D9B9C6'), (1.0, '#FFEBD6')],
        'montagne': [(0.3, '#5E5584'), (0.7, '#A98FAA'), (1.0, '#F2C7B0')],
        'figure': [(0.0, '#1C1822'), (0.3, '#2F3F70'), (0.55, '#8E3B34'), (0.8, '#E2C29A'), (1.0, '#FFF2DC')],
        'metal': [(0.1, '#1D1C28'), (0.6, '#9A8E9E'), (1.0, '#FFEAD2')],
        'vitre': [(0.0, '#1C1A2A'), (1.0, '#8C7E96')],
        'brique': [(0.2, '#3A1E22'), (0.6, '#9E5544'), (1.0, '#F0B08A')],
        'vide': [(0.0, '#241F2E'), (1.0, '#FBE7C8')],
    },
    'nuit': {
        'ciel': [(0.0, '#0A1433'), (0.55, '#1A3577'), (1.0, '#3C6AAA')],
        'nuage': [(0.2, '#26345F'), (0.7, '#6F86B8'), (1.0, '#C9D6EE')],
        'lumiere': [(0.0, '#E3B24A'), (1.0, '#FFF0BE')],
        'eau': [(0.0, '#081130'), (0.5, '#1B3770'), (0.9, '#7A97C8'), (1.0, '#E9D7A2')],
        'pierre': [(0.0, '#0B1129'), (0.5, '#33497C'), (1.0, '#9FB3D6')],
        'toit': [(0.0, '#060A1C'), (1.0, '#34466F')],
        'bois': [(0.0, '#090C1A'), (1.0, '#4E4A5E')],
        'toile': [(0.2, '#2C3A66'), (1.0, '#C4CFE6')],
        'feuillage': [(0.0, '#050C10'), (1.0, '#2B4650')],
        'sol': [(0.0, '#0B1024'), (1.0, '#56628A')],
        'neige': [(0.2, '#2E4478'), (0.7, '#8EA4CF'), (1.0, '#E2EAF6')],
        'montagne': [(0.0, '#0C1532'), (1.0, '#5F79AC')],
        'figure': [(0.0, '#05070F'), (0.6, '#28324F'), (1.0, '#8E99B8')],
        'metal': [(0.0, '#090C18'), (1.0, '#8A97B4')],
        'vitre': [(0.0, '#0A1028'), (1.0, '#2C3C69')],
        'brique': [(0.0, '#100A1C'), (1.0, '#5A4466')],
        'vide': [(0.0, '#070B1C'), (1.0, '#8A9CC4')],
    },
}


def colorize(sc, time, hz, levels=None):
    """Couleur par matière. levels : nombre de paliers par matière (cloisonné), sinon continu."""
    L = np.clip(sc.lum(), 0, 1)
    out = np.zeros((H, W, 3), np.float32)
    pal = PAL[time]
    for k, name in enumerate(MATERIALS):
        sel = sc.mat == k
        if not sel.any():
            continue
        v = L
        if name == 'ciel':
            # le ciel se colore par la hauteur (dégradé du moment), modulé par sa valeur
            v = np.clip(smooth(-60, hz, YY) * 0.85 + (L - 0.75) * 0.6 + 0.1, 0, 1)
        if levels:
            lo, hi = np.percentile(v[sel], 3), np.percentile(v[sel], 97)
            v = np.clip((v - lo) / (hi - lo + 1e-6), 0, 0.999)
            v = (np.floor(v * levels) + 0.5) / levels
            stops = pal[name]
            a, b = stops[0][0], stops[-1][0]
            v = a + (b - a) * v
        c = lut(v, pal[name])
        out[sel] = c[sel]
    return out


def palette_of(time, levels=3):
    """Toutes les teintes d'émail d'un moment (paliers de chaque matière)."""
    cols = []
    for name, stops in PAL[time].items():
        a, b = stops[0][0], stops[-1][0]
        for i in range(levels):
            cols.append(lut(np.array([a + (b - a) * (i + 0.5) / levels]), stops)[0])
    return cols


# ───────────────────────────── finitions communes ─────────────────────────────

def finish(img, technique, rng, enamel_amount):
    vig = vignette_cushion(4, 46)
    gnd = np.broadcast_to(hexrgb(GROUND[technique]), (H, W, 3))
    img = gnd * (1 - vig[..., None]) + img * vig[..., None]
    return np.clip(enamel(rng, img, enamel_amount), 0, 1)


def render(sc, technique, rng, meta):
    """Rend la planche dans la technique de rareté."""
    hz = meta.get('hz', 640)
    if technique == 'GRAVURE':
        C = paint(sc, rng, radii=(16, 8, 4, 2, 1.1), T=0.032, maxlen=10)
        L = C.mean(-1) * (1 - 0.82 * ndi.gaussian_filter(sc.pen, 0.35))
        L = aquatint(rng, np.clip(L, 0, 1), amount=0.03, scale=0.7)
        img = lut(np.clip(L, 0, 1), SEPIA)
        hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None]
        img = img * (1 - hi) + hexrgb('#FCF9F2') * hi
        return finish(img, technique, rng, 0.01)

    if technique == 'GRISAILLE':
        L = sc.lum()
        night = 0.03 + 0.8 * np.clip(L, 0, 1) ** 2.3
        # les lumières (lune, fenêtres, lanternes) restent blanches
        night = np.where(sc.mat == MAT['lumiere'], np.maximum(night, 0.92), night)
        sc.img = np.repeat(night[..., None], 3, -1)
        C = paint(sc, rng, radii=(14, 7, 3.5, 1.8, 1.0), T=0.03, maxlen=10, start=0.12)
        L = C.mean(-1) * (1 - 0.7 * ndi.gaussian_filter(sc.pen, 0.35))
        img = lut(np.clip(L, 0, 1), GRIS)
        hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None]
        img = img * (1 - hi) + hexrgb('#FFFFFF') * hi
        return finish(img, technique, rng, 0.012)

    if technique == 'MARQUETERIE':
        L = sc.lum().copy()
        # zones de texte : bois clair sous la marque (encre foncée), bois sombre sous la légende (encre claire)
        L = L + (0.8 - L) * 0.6 * (1 - smooth(150, 240, YY))
        L = L * (1 - 0.55 * smooth(880, 970, YY))
        sky = sc.mat == MAT['ciel']
        cuts = wedge = flow_over = None
        sun = meta.get('sun')
        if sun:
            # rayons du soleil : pointes de placage, fil rayonnant, une coupe entre chaque
            sx, sy = sun
            ang = np.arctan2(YY - sy, XX - sx)
            r = np.sqrt((XX - sx) ** 2 + (YY - sy) ** 2)
            NR = 36
            ph = (ang + np.pi) / (2 * np.pi) * NR
            zone = sky & (r > 40) & (r < 560) & (YY > 180)  # la marque, en haut, reste sur un fond calme
            cuts = ((np.abs(ph - np.round(ph)) * 2 * np.pi / NR * r < 0.8) & zone).astype(np.float32)
            L = np.where(zone, L + ((np.floor(ph) % 2) * 2 - 1) * 0.06 * (1 - smooth(380, 560, r)), L)
            wedge = np.where(zone, np.floor(ph).astype(np.int32) + 1, 0)
            flow_over = (zone, ang)
        calm = ndi.gaussian_filter(((sc.mat == MAT['eau']) | (sc.mat == MAT['neige'])).astype(np.float32), 3) * 0.85
        img, _ = marquetry(rng, L, sc.flow, pen=sc.pen, cuts=cuts, flow_over=flow_over, split=wedge, calm=calm)
        hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None] * 0.35
        img = img * (1 - hi) + hexrgb('#F6EEDC') * hi
        img = img * 0.97 + hexrgb('#5A3A18') * 0.03
        return finish(img, technique, rng, 0.006)

    time = meta['time']
    if technique == 'CLOISONNE':
        col = colorize(sc, time, hz, levels=3)
        gold = (sc.mat == MAT['lumiere']).astype(np.float32)
        if meta.get('stars') is not None:
            gold = np.maximum(gold, meta['stars'])
        wires = np.clip(ndi.gaussian_filter(sc.pen, 0.4) * 1.6, 0, 1) * (sc.pen > 0.25)
        img, _ = cloisonne(rng, col, palette_of(time), gold_mask=gold, extra_wires=wires, wire=1.8)
        return finish(img, technique, rng, 0.006)

    if technique == 'GRAND_FEU':
        col = colorize(sc, time, hz)
        if meta.get('stars') is not None:
            col = col * (1 - meta['stars'][..., None]) + col3('#FFF4D0') * meta['stars'][..., None]
        cs = Scene(0.5)
        cs.img, cs.flow, cs.fw, cs.lenm = col, sc.flow, sc.fw, sc.lenm
        C = paint(cs, rng, radii=(14, 7, 3.5, 1.8, 1.0), T=0.035, maxlen=10)
        pen = ndi.gaussian_filter(sc.pen, 0.35)[..., None]
        img = C * (1 - pen * 0.75) + col3('#2A1E18') * pen * 0.75
        hi = ndi.gaussian_filter(sc.hi, 0.6)[..., None]
        img = img * (1 - hi * 0.7) + col3('#FFF8E8') * hi * 0.7
        return finish(img, technique, rng, 0.01)

    raise ValueError(technique)
