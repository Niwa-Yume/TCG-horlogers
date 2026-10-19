"""Regénère les cadrans peints des cartes.

    python3 tools/dial-painter/render.py --card echappement
    python3 tools/dial-painter/render.py --all --jobs 4
    python3 tools/dial-painter/render.py --all --out /tmp/dials   # sans toucher aux références
    python3 tools/dial-painter/render.py --contact                # planche de contact

Chaque cadran : un script de scène (planche × technique) → PNG 816 × 1152 →
<out>/<nom>.webp (web, q86), <nom>-408.webp (srcset) et <nom>.jpg (partage, q90).
Rendu déterministe : même script, même graine, mêmes versions (requirements.txt), même image.
"""
import argparse
import glob
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'dials'))

# slug de carte → (script de scène, nom du fichier de cadran)
CARDS = {
    'echappement': ('scene_londres2.py', 'cadran-londres-1755'),      # Gravure
    'chronometre': ('scene_mer.py', 'cadran-en-mer-1761'),            # Marqueterie
    'spiral': ('scene_paris_nuit.py', 'cadran-paris-1795'),           # Grisaille
    'quantieme': ('scene_londres_nuit.py', 'cadran-londres-1762'),    # Cloisonné
    'tourbillon': ('scene_paris_soir.py', 'cadran-paris-1801'),       # Grand Feu
}


def render(slug, out=OUT):
    script, name = CARDS[slug]
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, name + '.png')
        subprocess.run([sys.executable, os.path.join(HERE, script), png], cwd=HERE, check=True,
                       stdout=subprocess.DEVNULL)
        im = Image.open(png).convert('RGB')
        im.save(os.path.join(out, name + '.webp'), quality=86, method=6)
        im.resize((408, 576), Image.LANCZOS).save(os.path.join(out, name + '-408.webp'), quality=86, method=6)
        im.save(os.path.join(out, name + '.jpg'), quality=90)
    return slug, name


def contact(out):
    """Planche de contact : chaque cadran réduit à 204 × 288, cinq par ligne."""
    files = sorted(f for f in glob.glob(os.path.join(out, '*.jpg')) if not f.endswith('contact.jpg'))
    cols = 5
    sheet = Image.new('RGB', (cols * 212 + 8, -(-len(files) // cols) * 296 + 8), '#F2ECDF')
    for i, f in enumerate(files):
        sheet.paste(Image.open(f).convert('RGB').resize((204, 288), Image.LANCZOS), (8 + i % cols * 212, 8 + i // cols * 296))
    path = os.path.join(out, 'contact.jpg')
    sheet.save(path, quality=85)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--card', choices=sorted(CARDS))
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--jobs', type=int, default=1)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--contact', action='store_true')
    a = ap.parse_args()
    slugs = sorted(CARDS) if a.all else ([a.card] if a.card else [])
    if not slugs and not a.contact:
        ap.error('--card <slug>, --all ou --contact')
    with ProcessPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        for slug, name in ex.map(render, slugs, [a.out] * len(slugs)):
            print(f'{slug:12s} → {a.out}/{name}.webp')
    if a.contact:
        print('planche de contact →', contact(a.out))


if __name__ == '__main__':
    main()
