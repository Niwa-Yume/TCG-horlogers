# dial-painter — les cadrans peints des cartes

Chaque carte WristMasters a un cadran peint : un lieu, une date, une scène,
rendus dans la technique de sa rareté. Tout est calculé : aucune IA, aucune
image source, aucun service. Même script et même graine donnent la même image.

## Installer et lancer

```
python3 -m venv tools/dial-painter/.venv
tools/dial-painter/.venv/bin/pip install -r tools/dial-painter/requirements.txt   # versions figées
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --all --jobs 8            # tout le catalogue
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --all --missing --jobs 8  # les nouvelles cartes
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --card rolex             # une carte
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --reference             # les 5 cadrans de référence
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --contact --check       # planche de contact, contrôle
tools/dial-painter/.venv/bin/python tools/dial-painter/plates.py geneve-rade CLOISONNE 42 1895 /tmp/g.png [--ref]
```

Sorties : `assets/dials/<slug>.webp` (web), `<slug>-408.webp` (srcset) et `<slug>.jpg` (images de partage),
816 × 1152, soit 4 × la zone de cadran de la carte (204 × 288). Sans `--out`, les fichiers sont écrasés ;
`--all` ne touche jamais aux cinq cadrans de référence, que seul `--reference` regénère.

Le rendu est identique d'une exécution à l'autre ; il peut varier au pixel près si numpy, scipy ou Pillow
changent de version, d'où les versions figées dans `requirements.txt`.

## Le catalogue : planche × technique

Chaque carte du catalogue (`packages/ingest/data/cards.generated.json`) porte une planche, une graine
(issue du slug) et une année ; sa rareté choisit la technique, et la technique le moment de la scène :

| Rareté | Technique | Moment |
|---|---|---|
| Gravure | aquatinte sépia | jour |
| Marqueterie | huit essences, rayons de soleil en pointes de placage | jour ou couchant |
| Grisaille | blanc de Limoges sur émail noir | nuit |
| Cloisonné | aplats d'émail par matière, fils d'or, étoiles et lumières en paillons | nuit ou couchant |
| Grand Feu | miniature à touches, palettes de matière | couchant ou jour |

Les planches (`plates.py`) : Londres-Tamise, Paris-Cité, Genève-rade, Vallée de Joux, La Chaux-de-Fonds,
vallon jurassien (Le Locle, Saint-Imier, Fleurier…), Neuchâtel, Bienne, Schaffhouse, Glashütte, en mer,
l'établi à la fenêtre, l'observatoire de nuit. Chacune varie avec la graine (point de vue, monuments,
nuages, bateaux, passants, saison) et suit l'histoire selon l'année : flèche de Notre-Dame, jet d'eau de
Genève (1891), vapeurs (1823), observatoire de Neuchâtel (1858), fabriques, costumes des passants. Leur
fiche (repères, plage de dates) est dans `plates.json` ; une année hors de la plage donne l'établi.

Pour qu'une planche se rende en couleurs, chaque élément est peint dans une **matière**
(`with material('pierre'):` : ciel, nuage, lumière, eau, pierre, toit, bois, toile, feuillage, sol, neige,
montagne, figure, métal, vitre, brique). `techniques.py` colore chaque matière selon le moment (palettes
jour, couchant, nuit), puis peint (Grand Feu) ou découpe en émaux (Cloisonné) ; Gravure, Marqueterie et
Grisaille n'ont besoin que des valeurs et du champ de touche.

## Contrôle qualité

`render.py --check` mesure, dans les zones de texte de la carte (la marque en haut, la légende en bas),
le contraste de l'encre de la rareté sur le fond, halo compté pour moitié (5e centile, au moins 4,5:1), et
le détail fin (au plus 0,05, seuil étalonné sur les cinq cadrans de référence). `--contact` assemble la
planche de contact de tous les cadrans en 204 × 288.

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
| `scene_*.py` | Les 5 cadrans de référence (cartes phares) |
| `scenery.py` | Montagnes et neige, sapins, fermes du Jura, maisons par style, églises à horloge, Munot, observatoire, fabriques, vapeurs, barque du Léman, jet d'eau, passants par époque |
| `plates.py` | Les 13 planches du catalogue |
| `techniques.py` | Les 5 techniques appliquées à n'importe quelle planche ; palettes de matière |
| `render.py` | Regénère un ou tous les cadrans, en parallèle ; planche de contact ; contrôle des zones de texte |
| `plates.json` | Fiche des planches : script, technique, repères, plage de dates (contrôlée par l'admin) |

## Ajouter une planche

Copier le script de scène le plus proche, changer le lieu, l'époque, l'heure et la
graine. Vérifier avec `--ref`, puis rendre. Garder calmes le haut (marque) et le bas
(légende) du cadran. Lister dans l'en-tête du script et dans `plates.json` les repères historiques et la
plage de dates valide (pas de jet d'eau à Genève avant 1891, pas de flèche à
Notre-Dame entre 1792 et 1859).
