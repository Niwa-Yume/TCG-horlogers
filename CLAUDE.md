# WristMasters TCG — résumé du brief

Référence complète : `BRIEF_CLAUDE_CODE.md`. Maquettes : `design/*.dc.html` (référence visuelle et comportementale).

**Produit** : jeu de cartes horlogères, FR/EN, mobile d'abord. Boosters gratuits (5 cartes / 10 min, stock 10) ouverts
en remontant une couronne ; duels 1 contre 1 (5 manches, premier à 3, réserve de marche 3 crans, question aux moments
décisifs) ; Rubis, enchères et échanges en Phase 4.

**Dix règles bloquantes** : (1) interface en `--paper`, `--ink`, un seul accent `--steel-blue` ; or et couleur réservés
aux cartes. (2) Le temps avance par crans (`steps()`), les cartes bougent en ressort. (3) Un geste horloger par moment
fort. (4) Une carte se lit en une seconde. (5) Cadrans peints par script (`tools/dial-painter`), jamais d'image de
banque, d'IA ni de placeholder. (6) Tous les textes via i18n ; aucune donnée horlogère inventée. (7) Premier booster
sans compte. (8) Chaque moment fort se partage en un geste. (9) AA, `prefers-reduced-motion`, clavier, focus visible,
son jamais seul porteur d'info, rareté jamais signalée par la couleur seule. (10) 60 fps sur un téléphone moyen.

**Stack** : pnpm workspaces ; React + Vite + TS, React Router, TanStack Query, CSS Modules ; NestJS + Prisma +
PostgreSQL ; Vitest ; i18next ; Docker Compose (postgres, api, umami, caddy). Pas de Next.js, pas de kit UI, pas de
WebGL.

**Conventions du dépôt**
- Cartes : `packages/card-render` (port à l'identique de `design/Card.dc.html`). Toujours respecter `status` et
  `override*` (mapping dans `apps/api/src/card-view.ts`).
- Rubis et propriété des cartes : transaction Prisma + `LedgerEntry` (à partir de la Phase 2).
- Données : `pnpm ingest` → `packages/ingest/data/cards.generated.json` → `pnpm seed`. Les cartes phares s'écrivent à
  la main dans `packages/ingest/flagship.overrides.json`.
- Une planche de cadran = une fiche dans `tools/dial-painter/plates.json` (repères, plage de dates).
- Travailler phase par phase ; à la fin de chaque phase : s'arrêter, résumer, lister les points à valider.
