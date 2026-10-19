# WristMasters TCG

Jeu de cartes à collectionner en ligne, 100 % horlogerie, bilingue FR/EN, mobile d'abord.
Le brief complet est dans [`BRIEF_CLAUDE_CODE.md`](BRIEF_CLAUDE_CODE.md), son résumé dans [`CLAUDE.md`](CLAUDE.md),
les maquettes de référence dans [`design/`](design).

État : **Phase 4 terminée** (économie : enchères en Rubis, échanges à double confirmation, protections).
Phase 3 : duel en direct (moteur pur, Socket.IO, automate, reconnexion, Elo, duel d'entraînement). Phase 2 : premier contact sans compte, remontage et sonnerie, boosters et collection, connexion
Google/Discord, partage. Phase 1 : design system, catalogue, cartes, loupe, ingestion, questions, admin.

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

- Accueil : http://localhost:5173
- Remonter un booster (sans compte) : http://localhost:5173/remonter
- Album : http://localhost:5173/collection
- Catalogue : http://localhost:5173/catalogue
- Fiche carte et loupe : http://localhost:5173/carte/tourbillon
- Page de partage (Open Graph) : http://localhost:5173/partage/c/tourbillon
- Duel en direct (5 cartes différentes au moins) : http://localhost:5173/duel
- Duel d'entraînement (sans compte, sans minuteur) : http://localhost:5173/duel/tutoriel
- Marché (enchères et échanges, compte requis) : http://localhost:5173/encheres
- Compte de développement sans OAuth (`DEV_LOGIN=1`, local seulement) : http://localhost:5173/api/auth/dev?name=ada
- Design system et les cinq raretés : http://localhost:5173/systeme
- Admin (jeton `ADMIN_TOKEN` du `.env`) : http://localhost:5173/admin

## Production (VPS)

```bash
cp .env.example .env    # puis : DOMAIN, STATS_DOMAIN, PUBLIC_URL, ADMIN_TOKEN, SESSION_SECRET, POSTGRES_PASSWORD,
                        # UMAMI_APP_SECRET, et si besoin GOOGLE_*, DISCORD_*, VITE_UMAMI_*, PROD_SELL_DELAY_HOURS (72 par défaut)
docker compose up -d --build
docker compose exec api pnpm seed
```

`docker-compose.yml` : postgres, api (NestJS, migrations au démarrage), umami (base `umami` du même postgres),
caddy (front statique, cadrans et sons, HTTPS automatique, `/api/*` → api, `STATS_DOMAIN` → umami).

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | API (tsx watch) + front (Vite) |
| `pnpm test` | Vitest : moteur de duel, automate, Elo, rareté, stats, recharge des boosters, tirage, QCM, overrides, plages de planches |
| `pnpm --filter @wm/api test:db` | idem + tests d'intégration (base requise) : rattachement invité → compte, marché (séquestre, taxe, verrous, concurrence, échanges) |
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

## Connexion Google et Discord

Facultative : sans identifiants, les boutons n'apparaissent pas et les cartes restent sur l'appareil (session invitée).

- Google : console.cloud.google.com → API et services → Identifiants → ID client OAuth (application Web),
  URI de redirection `<PUBLIC_URL>/api/auth/google/callback`, portée `profile` seulement.
- Discord : discord.com/developers/applications → OAuth2, redirection `<PUBLIC_URL>/api/auth/discord/callback`,
  portée `identify`.

À la connexion, les cartes, les Rubis et l'historique de l'invité sont versés dans le compte.

## Mesure (Umami)

Créer le site dans Umami (`STATS_DOMAIN`), puis renseigner `VITE_UMAMI_WEBSITE_ID` et
`VITE_UMAMI_SRC=https://<STATS_DOMAIN>/script.js` avant le build du front. Événements : `first_visit`,
`first_card_revealed` (`seconds` depuis l'arrivée, cible < 20 s), `signup_after_first_booster`.
`tutorial_duel_finished` arrive avec le duel (Phase 3).

## Structure

```
apps/web            React + Vite : accueil, remontage, album, catalogue, fiche carte + loupe, design system, admin
apps/api            NestJS (REST) : cartes, admin, session et connexion, boosters, collection, partage, duel, marché ; seed
                    + Socket.IO sur /api/socket.io : file, parties, minuteurs, automate, reconnexion
packages/ui         tokens, typo, grille, Marquee, SectionLabel, Counter, Button, Chip, StepTimer, Balance, MuteButton, SoundCaption, gestionnaire de sons
packages/card-render <Card />, <FluidCard />, <Loupe />, <BoosterBack />, thèmes de rareté, cardSvg() pour resvg
packages/shared     types, rareté par percentiles, tirage, budgets de stats, PRNG déterministe
packages/ingest     ingestion, QCM, flagship.overrides.json, data/cards.generated.json
packages/engine     moteur de duel pur (init, step, viewFor), automate, Elo
tools/dial-painter  peintre de cadrans (Python), plates.json
prisma/             schéma et migrations
```

## Mesures (fin de Phase 4)

Lighthouse 12, mobile simulé, build de production servi par Caddy, 19 octobre 2026 : `/encheres` 96 en
performance, 100 en accessibilité, 100 en bonnes pratiques, LCP 2,5 s, CLS 0,062. JavaScript initial : 172 Ko gzip.

## Mesures (fin de Phase 3)

Lighthouse 12, mobile simulé, build de production servi par Caddy, 19 octobre 2026 :

| Page | Performance | Accessibilité | Bonnes pratiques | LCP | CLS |
|---|---|---|---|---|---|
| `/` accueil | 97 | 100 | 100 | 2,3 s | 0,071 |
| `/duel` | 97 | 100 | 100 | 2,4 s | 0 |
| `/duel/tutoriel` | 97 | 100 | 100 | 2,3 s | 0 |

JavaScript initial : 166 Ko gzip ; le duel en direct (Socket.IO compris) se charge à part : 15 Ko gzip.

## Mesures (fin de Phase 2)

Lighthouse 12, mobile simulé, build de production servi par Caddy (gzip), 19 octobre 2026 :

| Page | Performance | Accessibilité | Bonnes pratiques | LCP | CLS |
|---|---|---|---|---|---|
| `/` accueil | 97 | 100 | 100 | 2,3 s | 0,071 |
| `/remonter` | 98 | 100 | 100 | 2,3 s | 0 |
| `/collection` | 95 | 100 | 100 | 2,8 s | 0 |

JavaScript initial : 157 Ko gzip. Images de partage : 0,2 s (carré) à 0,3 s (story) par rendu, mises en cache.

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

### Phase 2

- **Session invitée paresseuse** : `GET /api/me` ne crée rien ; l'invité naît au premier booster ouvert (ou à la
  récompense du jour). Une visite sans geste ne laisse aucune ligne en base.
- **Session** : JWT HS256 (`jose`) dans le cookie `wm_session` (httpOnly, SameSite=Lax, Secure en HTTPS, un an).
  Passport sans session serveur ; le paramètre `state` d'OAuth vit dans un cookie de 10 minutes (CSRF de connexion).
  `@nestjs/passport` n'est pas utilisé : `passport.authenticate` est appelé directement dans le contrôleur.
- **Boosters** : recharge calculée à la lecture (`boosterState`, l'ancre ne court pas quand le stock est plein) ;
  ouverture en transaction avec verrou de ligne (`SELECT … FOR UPDATE`) ; tirage `crypto.randomInt`, sans doublon
  dans un paquet, la plus rare révélée en dernier ; le premier booster garantit une Grisaille.
- **Économie** (configurable dans `packages/shared`) : recyclage Gravure 5, Marqueterie 10, Grisaille 25,
  Cloisonné 60, Grand Feu 150 Rubis ; récompense quotidienne 20 Rubis (jour UTC). Chaque mouvement de Rubis
  écrit une `LedgerEntry` dans la même transaction. Le recyclage garde l'exemplaire le plus ancien.
- **Partage** : `cardSvg()` (recto en SVG pur, même géométrie et mêmes thèmes que `<Card />`) rendu par resvg avec
  les polices de `assets/fonts` (instances statiques : resvg ignore les axes variables) et le cadran JPEG.
  `/partage/i/<exemplaire>` et `/partage/c/<carte>` servent les balises Open Graph puis redirigent vers la carte.
  PNG de 0,8 à 4 Mo (le grain du cuir compresse mal) ; cache mémoire de 200 images.
- **Navigation** : en dessous de 900 px, barre de jeu en bas (Remonter, Album, Catalogue, Duel « bientôt ») comme
  dans `Album.dc.html` ; le Duel et les Enchères ne sont pas des liens tant qu'ils n'existent pas.
- **Accueil** : « Cinq cents cartes » de la maquette remplacé par le nombre réel de cartes du catalogue.

### Phase 3

- **Moteur** (`packages/engine`, sans dépendance) : `init`, `step(state, action) → { state, events }`, `viewFor`.
  RNG mulberry32 dont l'état vit dans l'état du duel : même graine, même partie. Main de 5 tirée d'un deck de 10,
  **recomplétée après chaque manche** (ce qui permet de rejouer des manches sans tomber à court). Sans choix à la
  fin des 30 s : carte au hasard, 0 cran. Les crans engagés sont perdus.
- **Question décisive** : lue comme « en cas d'égalité, et toujours à la manche à 2-2 ». Chaque joueur reçoit une
  question vérifiée tirée sur sa propre carte (10 s) ; +2 si juste. Sans question vérifiée sur la carte, pas de bonus
  possible ; si aucun des deux n'en a, on passe à la rareté, puis la manche est rejouée (non comptée).
  Tant qu'aucune question n'est validée dans `/admin`, les questions ne tombent jamais.
- **Serveur** : Socket.IO brut attaché au serveur HTTP de Nest (chemin `/api/socket.io`, donc couvert par Caddy et le
  proxy Vite), session lue dans le cookie. Parties en mémoire (un seul processus API : à déplacer vers Redis si l'on
  passe à plusieurs instances). 3,5 s de pause après chaque révélation avant que le minuteur ne reparte.
- **Automate** (« Automate Jaquet-Droz ») après 20 s d'attente : meilleure carte sur le critère avec 20 % de hasard,
  2 crans aux moments décisifs (un joueur à 2), sinon 1 cran une fois sur quatre ; bonne réponse 6 fois sur 10 ;
  deck de mêmes raretés que le joueur, tiré au hasard dans le catalogue.
- **Deck** : automatique, les 10 cartes distinctes les plus fortes du joueur ; 5 cartes différentes suffisent pour
  jouer. Pas encore d'écran pour composer son deck.
- **Elo** (K = 32) et **10 Rubis** au vainqueur seulement entre joueurs ; rien contre l'automate ni à l'entraînement.
  Chaque partie est enregistrée (`Match`, journal des événements).
- **Reconnexion** : 30 s, compte à rebours visible chez l'adversaire, sinon défaite. Un rechargement de page reprend la
  partie en cours.
- **Duel d'entraînement** : le moteur tourne dans le navigateur, critères imposés, tes cinq cartes phares contre cinq
  Gravures, pas de minuteur. Ouvert à tous, sans compte ; événement Umami `tutorial_duel_finished`.

### Phase 4

- **Enchères** : durée fixe de 24 h ; prix de départ au moins égal à ce que rapporte le recyclage (10 Rubis au moins) ;
  mise suivante = meilleure mise + 5 % (1 Rubis au moins). **Séquestre** : la mise est retirée tout de suite et
  rendue à l'enchérisseur battu ; on ne surenchérit pas sur soi-même. À l'échéance, le vendeur touche le prix moins
  **5 % de taxe brûlée** (arrondie au Rubis supérieur, inscrite au registre en `TAX`, créditée à personne) et la
  carte change de main. Sans mise, la carte revient au vendeur ; on peut retirer une vente tant qu'il n'y a pas de mise.
- **Règlement** : chaque processus API fait le ménage toutes les 30 s, et à chaque lecture du marché. Le règlement est
  idempotent (verrou de ligne sur l'enchère, puis vérification du statut) : avec plusieurs processus, une vente n'est
  réglée qu'une fois (testé avec deux clients en parallèle). Pas de tâche cron externe.
- **Prolongation** : une mise dans les 5 dernières minutes repousse la fin à 5 minutes après la mise, pour que
  l'enchérisseur battu puisse répondre.
- **Notifications** : surenchéri, adjugé, vendu (net après taxe), sans preneur, échange reçu, accepté, refusé, retiré,
  expiré. Écrites dans la transaction de l'événement (`Notification`), elles s'affichent sur une cloche avec compteur,
  relue toutes les 30 s quand l'onglet est visible, et sur `/notifications`, qui les marque comme lues. Pas de push
  navigateur ni de courriel pour l'instant.
- **Échanges à double confirmation** : l'auteur confirme en proposant (1 à 5 cartes de chaque côté), ses cartes sont
  verrouillées ; le destinataire confirme en acceptant, ses cartes sont vérifiées et tout s'échange dans la même
  transaction. Les cartes du destinataire ne sont pas verrouillées à la proposition (sinon n'importe qui pourrait
  bloquer les cartes d'un autre). Expiration à 48 h, 10 échanges en attente au plus par joueur. Cartes seulement,
  pas de Rubis dans un échange.
- **Verrous** : `CardInstance.lock` (`auction:<id>` ou `trade:<id>`) pris par une mise à jour conditionnelle
  (`lock = null`) ; une carte verrouillée ne se vend pas, ne s'échange pas, ne se recycle pas et ne joue pas en duel.
  Verrous de ligne `SELECT … FOR UPDATE` sur l'enchère, l'échange et les joueurs (dans un ordre fixe) ; un test
  vérifie que deux mises simultanées au même prix ne passent pas toutes les deux.
- **Délai avant de vendre** : un invité ne vend, n'enchérit ni n'échange ; un compte peut vendre et échanger
  72 h après sa connexion (`signedUpAt`, réglable par `SELL_DELAY_HOURS` ; 0 en local).
- **Limite d'actions** : 30 écritures par minute et par session, 120 par adresse IP (`429`). Les compteurs vivent
  dans Postgres (`ActionCount`, une ligne par clé et par minute, incrémentée et lue en une requête), donc partagés par
  tous les processus API ; la session y figure sous forme d'empreinte, jamais en clair. Fenêtre fixe d'une minute
  (une rafale à cheval sur deux minutes peut aller jusqu'au double). Les lectures et l'admin ne sont pas limitées.
- **Connexion de développement** : `/api/auth/dev?name=…` crée un compte sans OAuth pour tester le marché à plusieurs.
  Active seulement avec `DEV_LOGIN=1` **et** une `PUBLIC_URL` en `http://` ; `docker-compose.yml` ne la transmet pas.
- **Navigation** : la barre mobile suit la maquette de l'album (Remonter, Album, Duel, Enchères) ; le catalogue est
  accessible depuis l'album et l'en-tête sur ordinateur.
