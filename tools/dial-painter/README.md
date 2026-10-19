# dial-painter — les cadrans peints des cartes

Chaque carte WristMasters a un cadran peint : un lieu, une date, une scène,
rendus dans la technique de sa rareté. Tout est calculé : aucune IA, aucune
image source, aucun service. Même script et même graine donnent la même image.

## Installer et lancer

```
python3 -m venv tools/dial-painter/.venv
tools/dial-painter/.venv/bin/pip install -r tools/dial-painter/requirements.txt   # versions figées
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --all --jobs 4
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --card tourbillon --out /tmp/dials
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --contact   # planche de contact 204 × 288
python3 tools/dial-painter/scene_mer.py /tmp/mer.png --ref   # le modèle en valeurs, avant la technique
```

Sorties : `assets/dials/<nom>.webp` (web), `<nom>-408.webp` (srcset) et `<nom>.jpg` (images de partage),
816 × 1152, soit 4 × la zone de cadran de la carte (204 × 288). Sans `--out`, les références sont écrasées.

Le rendu est identique d'une exécution à l'autre ; il peut varier au pixel près si numpy, scipy ou Pillow
changent de version, d'où les versions figées dans `requirements.txt`.

## Comment ça marche

1. **La planche** (un script `scene_*.py`) modèle la scène plan par plan dans une
   `Scene` : une image de référence en valeurs (ou en couleurs pour le Grand Feu),
   lumière en haut à gauche, perspective atmosphérique, plus quatre cartes qui guident
   le rendu : orientation des touches (`flow`, `fw`), longueur des touches (`lenm`),
   plume (`pen`, traits fins : gréements, corniches) et rehauts (`hi`).
2. **La technique** rend la planche :
   - `paint()` : peinture à touches multi-échelles (Hertzmann, *Painterly Rendering
     with Curved Brush Strokes of Multiple Sizes*, 1998). Des grosses touches aux fines ;
     chaque passe ne retouche que là où la toile s'écarte encore du modèle. Gravure
     (+ `aquatint()`), Grisaille (courbe de nuit + palette blanc de Limoges), Grand Feu.
   - `marquetry()` : découpe en pièces de placage (8 essences), fil orienté par pièce,
     ombrage au sable, traits de coupe, filets d'ébène.
   - `cloisonne()` : aplats d'émail ramenés à une palette, fils d'or en relief aux
     frontières, paillons, lustre.
   - `enamel()` : la surface d'émail (nébulosité et grain), pour toutes.
3. **Le vignettage** fond la scène dans l'émail au bord du cadran ; la boîte la recouvre.

## Fichiers

| Fichier | Rôle |
|---|---|
| `wm_paint.py` | Grilles, bruit fractal, calques vectoriels antialiasés au trait tremblé, vignettage |
| `painter.py` | `Scene`, peinture à touches, marqueterie, cloisonné, aquatinte, émail, palettes |
| `vedute.py` | Ciel, cumulus, collines, maisons géorgiennes, clochers de Wren, Saint-Paul, eau et reflets, trois-mâts, gabare, bachot, personnages du XVIIIe, balustrade, réverbère, arbre |
| `marine.py` | Houle en perspective, soleil en éventail, vaisseau sous voiles, goélands |
| `paris.py` | Notre-Dame sans flèche, maisons de quai, murs de quai |
| `scene_*.py` | Les 5 cadrans de référence |
| `render.py` | Regénère un ou tous les cadrans, en parallèle ; planche de contact |
| `plates.json` | Fiche des planches : script, technique, repères, plage de dates (contrôlée par l'admin) |

## Ajouter une planche

Copier le script de scène le plus proche, changer le lieu, l'époque, l'heure et la
graine. Vérifier avec `--ref`, puis rendre. Garder calmes le haut (marque) et le bas
(légende) du cadran. Lister dans l'en-tête du script et dans `plates.json` les repères historiques et la
plage de dates valide (pas de jet d'eau à Genève avant 1891, pas de flèche à
Notre-Dame entre 1792 et 1859).
