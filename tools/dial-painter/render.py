"""Regénère les cadrans peints des cartes.

    python3 tools/dial-painter/render.py --card tourbillon           # une carte (référence ou catalogue)
    python3 tools/dial-painter/render.py --all --jobs 8              # tout le catalogue (pas les références)
    python3 tools/dial-painter/render.py --all --missing --jobs 8    # seulement les cadrans absents
    python3 tools/dial-painter/render.py --reference                 # les 5 cadrans de référence (les écrase)
    python3 tools/dial-painter/render.py --all --out /tmp/dials      # sans toucher à assets/dials
    python3 tools/dial-painter/render.py --contact --check           # planche de contact, contrôle des textes

Cadrans de référence : un script de scène par carte phare (scene_*.py). Catalogue : la planche, la graine
et l'année de chaque carte (packages/ingest/data/cards.generated.json), rendues par plates.py dans la
technique de sa rareté. Sorties : <out>/<nom>.webp (web, q86), <nom>-408.webp (srcset), <nom>.jpg (partage, q90).
Rendu déterministe : même planche, même graine, mêmes versions (requirements.txt), même image.
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'dials'))
DATA = os.path.normpath(os.path.join(HERE, '..', '..', 'packages', 'ingest', 'data', 'cards.generated.json'))

# cartes phares : slug → (script de scène, nom du fichier de cadran, rareté)
CARDS = {
    'echappement': ('scene_londres2.py', 'cadran-londres-1755', 'GRAVURE'),
    'chronometre': ('scene_mer.py', 'cadran-en-mer-1761', 'MARQUETERIE'),
    'spiral': ('scene_paris_nuit.py', 'cadran-paris-1795', 'GRISAILLE'),
    'quantieme': ('scene_londres_nuit.py', 'cadran-londres-1762', 'CLOISONNE'),
    'tourbillon': ('scene_paris_soir.py', 'cadran-paris-1801', 'GRAND_FEU'),
}


def catalogue():
    """slug → (planche, rareté, graine, année) pour les cartes du catalogue."""
    try:
        cards = json.load(open(DATA))['cards']
    except FileNotFoundError:
        return {}
    return {c['slug']: (c['plate'], c['rarity'], c['plateSeed'], c['dialYear'] or 1900)
            for c in cards if c.get('plate') and c['slug'] not in CARDS}


def save(im, out, name):
    im.save(os.path.join(out, name + '.webp'), quality=86, method=6)
    im.resize((408, 576), Image.LANCZOS).save(os.path.join(out, name + '-408.webp'), quality=86, method=6)
    im.save(os.path.join(out, name + '.jpg'), quality=90)


def render_reference(slug, out):
    script, name, _ = CARDS[slug]
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, name + '.png')
        subprocess.run([sys.executable, os.path.join(HERE, script), png], cwd=HERE, check=True, stdout=subprocess.DEVNULL)
        save(Image.open(png).convert('RGB'), out, name)
    return slug, name


def render_card(job):
    slug, (plate, rarity, seed, year), out = job
    sys.path.insert(0, HERE)
    import plates  # noqa: E402 (chargé dans le processus de travail)
    img = plates.render(plate, rarity, seed, year)
    save(Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), out, slug)
    return slug, f'{plate} · {rarity} · {year}'


# ───────────────────────────── contrôle qualité ─────────────────────────────
# Zones de texte de la carte, en pixels du cadran (4 × la zone 204 × 288) : la marque en haut,
# la légende et le lieu en bas. Couleur de l'encre et du halo par rareté (THEMES de card-render).
ZONES = {'marque': (69, 149, 62, 754), 'légende': (957, 1090, 120, 696)}
INK = {  # rareté → {zone: (encre, halo)}
    'GRAVURE': {'marque': ('#2A2018', '#EFE7D6'), 'légende': ('#2A2018', '#EFE7D6')},
    'MARQUETERIE': {'marque': ('#2B170B', '#F0D7AA'), 'légende': ('#F6EAD0', '#2B170B')},
    'GRISAILLE': {'marque': ('#EEE8DC', '#0A0A0C'), 'légende': ('#EEE8DC', '#0A0A0C')},
    'CLOISONNE': {'marque': ('#F4DFA0', '#081230'), 'légende': ('#F4DFA0', '#081230')},
    'GRAND_FEU': {'marque': ('#1F2436', '#E1E8F5'), 'légende': ('#FBF1DE', '#1E2642')},
}


def _lum(rgb):
    c = np.where(rgb <= 0.03928, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def _hex(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def check(path, rarity):
    """Contraste encre/fond (halo compté pour moitié, 5e centile) ≥ 4,5:1 et détail fin modéré."""
    im = np.asarray(Image.open(path).convert('RGB'), np.float32) / 255
    problems = []
    for zone, (y0, y1, x0, x1) in ZONES.items():
        ink, halo = (_hex(c) for c in INK[rarity][zone])
        bg = im[y0:y1, x0:x1] * 0.5 + halo * 0.5
        li, lb = _lum(ink), _lum(bg)
        ratio = (np.maximum(li, lb) + 0.05) / (np.minimum(li, lb) + 0.05)
        worst = float(np.percentile(ratio, 5))
        # détail fin (écart à un flou de 6 px) : les dégradés doux du ciel ne comptent pas
        L = _lum(im[y0:y1, x0:x1])
        busy = float(np.abs(L - ndi.gaussian_filter(L, 6)).mean())
        if worst < 4.5:
            problems.append(f'{zone} : contraste {worst:.1f}:1')
        if busy > 0.05:  # étalonné sur les 5 cadrans de référence (0,047 au plus)
            problems.append(f'{zone} : agitée ({busy:.3f})')
    return problems


def contact(out, names):
    """Planche de contact : chaque cadran réduit à 204 × 288, dix par ligne."""
    files = [os.path.join(out, n + '.jpg') for n in names if os.path.exists(os.path.join(out, n + '.jpg'))]
    cols = 10
    sheet = Image.new('RGB', (cols * 212 + 8, -(-len(files) // cols) * 296 + 8), '#F2ECDF')
    for i, f in enumerate(files):
        sheet.paste(Image.open(f).convert('RGB').resize((204, 288), Image.LANCZOS), (8 + i % cols * 212, 8 + i // cols * 296))
    path = os.path.join(out, 'contact.jpg')
    sheet.save(path, quality=85)
    return path


def main():
    cat = catalogue()
    ap = argparse.ArgumentParser()
    ap.add_argument('--card', choices=sorted({*CARDS, *cat}))
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--reference', action='store_true')
    ap.add_argument('--missing', action='store_true', help='ne rend que les cadrans absents')
    ap.add_argument('--jobs', type=int, default=1)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--contact', action='store_true')
    ap.add_argument('--check', action='store_true', help='contrôle les zones de texte de chaque cadran')
    a = ap.parse_args()
    # les cadrans de référence ne sont regénérés que sur demande explicite
    refs = sorted(CARDS) if a.reference else [s for s in [a.card] if s in CARDS]
    cards = sorted(cat) if a.all else [s for s in [a.card] if s in cat]
    if a.missing:
        cards = [s for s in cards if not os.path.exists(os.path.join(a.out, s + '.webp'))]
    if not (refs or cards or a.contact or a.check):
        ap.error('--card <slug>, --all, --reference, --contact ou --check')
    os.makedirs(a.out, exist_ok=True)
    with ProcessPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        for slug, name in ex.map(render_reference, refs, [a.out] * len(refs)):
            print(f'{slug:28s} → {name}')
        for slug, what in ex.map(render_card, [(s, cat[s], a.out) for s in cards]):
            print(f'{slug:28s} → {what}')
    names = [CARDS[s][1] for s in sorted(CARDS)] + sorted(cat)
    if a.contact:
        print('planche de contact →', contact(a.out, names))
    if a.check:
        rar = {**{CARDS[s][1]: CARDS[s][2] for s in CARDS}, **{s: cat[s][1] for s in cat}}
        bad = 0
        for n in names:
            p = os.path.join(a.out, n + '.webp')
            if os.path.exists(p) and (pb := check(p, rar[n])):
                bad += 1
                print(f'  {n:28s} {rar[n]:12s} ' + ' ; '.join(pb))
        print(f'contrôle : {bad} cadran(s) à revoir sur {sum(os.path.exists(os.path.join(a.out, n + ".webp")) for n in names)}')


if __name__ == '__main__':
    main()
