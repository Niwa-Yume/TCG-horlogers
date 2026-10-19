# WristMasters TCG

Jeu de cartes à collectionner en ligne, 100 % horlogerie, bilingue FR/EN, mobile d'abord.
Le brief complet est dans [`BRIEF_CLAUDE_CODE.md`](BRIEF_CLAUDE_CODE.md), son résumé dans [`CLAUDE.md`](CLAUDE.md),
les maquettes de référence dans [`design/`](design).

État : **Phase 1 terminée** (design system, catalogue, rendu des cartes, loupe, ingestion, questions, admin).

## Démarrer en local

Prérequis : Node 22+, pnpm (via `corepack enable`), Docker, Python 3.11+ (seulement pour regénérer les cadrans).

```bash
cp .env.example .env
pnpm install
pnpm db:up              # postgres dans Docker (127.0.0.1:5432)
pnpm db:migrate         # applique prisma/migrations
pnpm seed               # charge packages/ingest/data/cards.generated.json (versionné)
pnpm dev                # api :3000 + web :5173
```

- Catalogue : http://localhost:5173
- Fiche carte et loupe : http://localhost:5173/carte/tourbillon
- Design system et les cinq raretés : http://localhost:5173/systeme
- Admin (jeton `ADMIN_TOKEN` du `.env`) : http://localhost:5173/admin

## Production (VPS)

```bash
cp .env.example .env    # puis : DOMAIN, STATS_DOMAIN, ADMIN_TOKEN, POSTGRES_PASSWORD, UMAMI_APP_SECRET
docker compose up -d --build
docker compose exec api pnpm seed
```

`docker-compose.yml` : postgres, api (NestJS, migrations au démarrage), umami (base `umami` du même postgres),
caddy (front statique, cadrans et sons, HTTPS automatique, `/api/*` → api, `STATS_DOMAIN` → umami).

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | API (tsx watch) + front (Vite) |
| `pnpm test` | Vitest : rareté, stats, QCM, overrides, plages de planches |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | TypeScript strict, ESLint, Prettier |
| `pnpm ingest` | Wikidata + Wikipédia + consultations → `packages/ingest/data/cards.generated.json` (cache dans `packages/ingest/.cache`) |
| `pnpm seed` | Upsert des cartes et des QCM ; ne touche ni au statut, ni aux overrides, ni aux questions relues |
| `pnpm dials` | Regénère les 5 cadrans de référence (voir ci-dessous) |
| `pnpm --filter @wm/api prisma <cmd>` | CLI Prisma avec le `.env` racine |

### Cadrans peints

```bash
python3 -m venv tools/dial-painter/.venv
tools/dial-painter/.venv/bin/pip install -r tools/dial-painter/requirements.txt
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --all --jobs 5
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --card tourbillon --out /tmp/dials   # sans écraser les références
tools/dial-painter/.venv/bin/python tools/dial-painter/render.py --contact                            # planche de contact
```

Sorties : `assets/dials/<nom>.webp` (816 px), `<nom>-408.webp` (srcset) et `<nom>.jpg` (partage). Voir
[`tools/dial-painter/README.md`](tools/dial-painter/README.md) et la fiche des planches `tools/dial-painter/plates.json`.

## Structure

```
apps/web            React + Vite : catalogue, fiche carte + loupe, design system, admin
apps/api            NestJS (REST) : /api/cards, /api/admin/* ; seed
packages/ui         tokens, typo, grille, Marquee, SectionLabel, Counter, Button, Chip, StepTimer, Balance, MuteButton, SoundCaption, gestionnaire de sons
packages/card-render <Card />, <FluidCard />, <Loupe />, <BoosterBack />, thèmes de rareté
packages/shared     types, rareté par percentiles, tirage, budgets de stats, PRNG déterministe
packages/ingest     ingestion, QCM, flagship.overrides.json, data/cards.generated.json
packages/engine     Phase 3
tools/dial-painter  peintre de cadrans (Python), plates.json
prisma/             schéma et migrations
```

## Mesures (fin de Phase 1)

Lighthouse 12, mobile simulé, build de production servi par Caddy (gzip), 19 octobre 2026 :

| Page | Performance | Accessibilité | Bonnes pratiques | LCP | CLS |
|---|---|---|---|---|---|
| `/` catalogue | 97 | 100 | 100 | 2,4 s | 0,012 |
| `/carte/tourbillon` | 97 | 100 | 100 | 2,5 s | 0 |
| `/systeme` | 97 | 100 | 100 | 2,3 s | 0,006 |

JavaScript initial : 146 Ko gzip (cible < 200 Ko). Défilement du catalogue (48 cartes) : 0 image > 33 ms sur un Mac ;
reste à mesurer sur un téléphone moyen.

## Décisions

- **Versions** : TypeScript 5.9, React 19, Vite 7, React Router 7, NestJS 11, Prisma 6, Vitest 3, ESLint 9. Des
  majeures plus récentes existent (TS 7, Vite 8, Nest 12, Prisma 7) ; on monte quand le reste est stable.
- **API exécutée par `tsx`** (dev et prod), sans étape de build : elle importe directement les sources TypeScript
  de `packages/shared`. Les décorateurs NestJS marchent sans métadonnées de type : l'injection passe par
  `@Inject(...)` explicite.
- **Prisma** est installé à la racine (le CLI le cherche à côté de `prisma/schema.prisma`) et dans `apps/api`.
- **Schéma affiné** : type `COMPLICATION` ajouté (les maquettes affichent « Série I · Complication ») ; champs
  `number` (n° de série stable, jamais réattribué), `captionFr/En` (légende avec article), `author`, `year`,
  `yearEnd`, `yearCirca`, `dialYear`, `dialPlaceFr/En` ; id de question déterministe `q_<slug>_<fait>`.
- **Ingestion** : SPARQL ne sert qu'à lister les entités (les requêtes avec faits et libellés dépassaient le délai de
  60 s de Wikidata) ; faits et libellés via `wbgetentities`. Dates gardées seulement si précises à l'année. Une
  entité doit avoir un article FR **et** EN (toutes les données de carte existent dans les deux langues).
- **Rareté** : percentiles sur la somme des consultations moyennes FR + EN ; les cartes phares fixent la leur.
- **Stats** : budget de la rareté réparti point par point, les deux critères forts du type pesant ×3, PRNG
  mulberry32 semé par le slug. Complication → Complication + Innovation, Événement → Héritage + Prestige (non
  précisés dans le brief).
- **Cartes sans cadran peint** : émail uni de la couleur de fond de la technique, sans placeholder (règle 5).
- **Admin** : jeton `ADMIN_TOKEN` en en-tête `Authorization` (Google/Discord arrivent en Phase 2). Une planche
  ne s'enregistre que si l'année du cadran tient dans sa plage ; `overrideImage` n'accepte que `/dials/<nom>`.
- **Polices** : Google Fonts chargées sans bloquer le rendu (préchargement + bascule) ; replis système d'abord.
- **Pied de page** : le mot géant passe de 20,5vw (maquette, mot rogné) à 16vw (mot entier).
- **Cadrans de référence** : les originaux sont conservés. Regénérés ici (numpy 2.5.4, scipy 1.18.1, Pillow 13), ils
  ont la même composition mais diffèrent au pixel près (écart moyen 0,4 à 10 / 255) ; le rendu est déterministe
  d'une exécution à l'autre. Versions désormais figées dans `requirements.txt`.
