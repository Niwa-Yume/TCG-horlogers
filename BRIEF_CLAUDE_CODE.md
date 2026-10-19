# WristMasters TCG — Brief pour l'agent de code (v3)

> Fonctionne avec Claude Code ou tout autre agent. Copie le contenu de ce paquet à la racine d'un repo vide.
> **Les maquettes de la Phase 0 sont dans `/design`** : des fichiers `.dc.html` (HTML + SVG + une classe JS de logique). Ce sont la référence visuelle et comportementale. `Card.dc.html` est l'implémentation de référence des cartes, à porter en composant React à l'identique ; `Remontage.dc.html` contient la couronne, la réserve de marche et la synthèse sonore Web Audio. Les balises `<x-dc>`, `<sc-for>`, `<sc-if>`, `<dc-import>` et les `{{trous}}` sont propres à l'outil de maquette : traduis-les en JSX, ne les recopie pas.
> **Les sons de remplacement sont dans `/assets/sounds`** (MP3 pour le web, WAV sources, et `synth.py` qui les régénère). Ils seront remplacés plus tard par de vrais enregistrements : garde les mêmes noms de fichiers.
> Travaille **phase par phase**. À la fin de chaque phase : s'arrêter, résumer ce qui est fait, ce qui reste, les points à valider.

---

## 1. Le produit

WristMasters TCG est un jeu de cartes à collectionner en ligne, 100 % horlogerie, bilingue FR/EN, mobile d'abord.

- **Collection** : un booster gratuit de 5 cartes toutes les 10 minutes (stock max 10), qu'on ouvre **en remontant une couronne**. Doublons recyclés en Rubis (monnaie du jeu). Enchères et échanges en Phase 4.
- **Cartes** : générées depuis Wikidata et Wikipédia FR/EN (horlogers, maisons, modèles, inventions et complications), 30 cartes phares retravaillées à la main.
- **Duel en direct** 1 contre 1 : 5 manches max, premier à 3. Critère tiré au sort, choix simultané, **réserve de marche** de 3 crans à engager en secret, **question seulement aux moments décisifs**.
- **Concept visuel** : la haute horlogerie dans les cartes, la culture streetwear dans l'interface.

Piliers : (1) 100 % horlogerie, on apprend en jouant. (2) Une partie = un café, 5 à 10 minutes. (3) Le talent gagne, la chance raconte des histoires.

---

## 2. Les dix règles de design et d'UX (bloquantes)

Un écran qui viole une règle n'est pas terminé.

1. **Papier et encre** : l'interface n'utilise que `--paper`, `--ink` et un seul accent `--steel-blue`. L'or, la couleur et la lumière sont réservés aux cartes.
2. **Le temps avance par crans** : minuteurs, comptes à rebours et chargements avancent en saccades d'une seconde (`steps()`), comme une trotteuse. Les cartes bougent de façon physique et fluide (ressort).
3. **Un geste horloger par moment fort** : remonter (ouvrir un booster), loupe (inspecter une carte), sonnerie (tirage rare).
4. **Une carte se lit en une seconde** : en duel, seul le critère en jeu est affiché en grand.
5. **Le vrai plutôt que le générique** : chaque cadran est une miniature peinte **par script** (`tools/dial-painter`, Python, procédural : aucune IA, aucune image source), le reste de la carte est du SVG ; sons fournis dans `/assets/sounds`. Ne jamais ajouter d'image de banque, d'illustration générée par IA ou de placeholder « joli ».
6. **Humour dans les mots, rigueur dans les faits** : tous les textes passent par i18n ; aucune donnée horlogère inventée.
7. **La valeur avant l'inscription** : le premier booster s'ouvre sans compte.
8. **Chaque moment fort se partage en un geste.**
9. **Accessible par défaut** : contraste AA, `prefers-reduced-motion` respecté, navigation clavier complète, focus visible, le son n'est jamais le seul porteur d'information, la rareté n'est jamais signalée par la couleur seule.
10. **Fluide sur un téléphone moyen** : 60 fps visés ; si un effet ne tient pas, on le simplifie.

Test final de chaque écran : « Est-ce que ça pourrait être n'importe quel autre jeu ? » Si oui, ce n'est pas fini.

---

## 3. Stack imposée

Critères : coût minimal, maintenance faible, production durable. **Pas de Next.js.**

| Brique | Choix |
|---|---|
| Monorepo | pnpm workspaces |
| Front | React + Vite + TypeScript, React Router, TanStack Query, CSS Modules (pas de kit UI générique type shadcn ou Material) |
| Rendu des cartes | Cadre en SVG (composant React : écrin, boîte, aiguilles, textes) + cadran peint en WebP 816 × 1152, précalculé hors ligne par `tools/dial-painter`. Pas de WebGL, pas de shaders, pas d'IA |
| Images de partage | `@resvg/resvg-js` : rendu du même SVG en PNG côté serveur, cadran inclus via sa copie JPEG (`<image href>`), polices chargées depuis des fichiers |
| Animations | CSS + Web Animations API ; Motion (ex-Framer Motion) seulement si nécessaire |
| Audio | Web Audio API, gestionnaire de sons maison |
| Back | NestJS (REST + WebSocket via Socket.IO) |
| Moteur de duel | Package TypeScript pur, sans dépendance, Vitest |
| Base de données | PostgreSQL + Prisma |
| Connexion | Google et Discord via Passport, session JWT en cookie httpOnly ; sessions invitées |
| Mesure | Umami auto-hébergé |
| Déploiement | Docker Compose (postgres + api + umami + caddy servant le front statique) sur un VPS |
| i18n | i18next ; toutes les données de carte en FR et EN |

---

## 4. Structure du repo

```
wristmasters-tcg/
├─ apps/
│  ├─ web/              # React + Vite
│  └─ api/              # NestJS
├─ packages/
│  ├─ ui/               # design system : tokens, typo, grille, mouvement, sons, composants de base
│  ├─ card-render/      # composant <Card /> : cadre SVG + cadran peint, 5 thèmes de rareté (boîte, écrin, encre, aiguilles)
│  ├─ engine/           # règles du duel, pures et déterministes
│  ├─ shared/           # types partagés (Card, Rarity, Criterion, DTOs, événements WebSocket)
│  └─ ingest/           # ingestion Wikidata / Wikipédia
├─ tools/
│  └─ dial-painter/     # peintre de cadrans (Python) : planches de scènes × techniques de rareté → WebP + JPEG
├─ assets/
│  ├─ dials/            # cadrans peints (WebP pour le web, JPEG pour les images de partage)
│  └─ sounds/           # sons de remplacement (mp3, wav, synth.py), mêmes noms pour les vrais plus tard
├─ design/              # maquettes de la Phase 0 (.dc.html, référence obligatoire)
├─ prisma/schema.prisma
├─ docker-compose.yml
├─ Caddyfile
└─ CLAUDE.md            # résumé de ce brief
```

---

## 5. Modèle de données (Prisma, à affiner)

```prisma
enum CardType   { WATCHMAKER  MAISON  MODEL  INVENTION  EVENT }
enum Rarity     { GRAVURE  MARQUETERIE  GRISAILLE  CLOISONNE  GRAND_FEU }
enum CardStatus { ACTIVE  RETIRED }

model Card {
  id            String     @id @default(cuid())
  slug          String     @unique
  type          CardType
  wikidataId    String?    @unique
  nameFr        String
  nameEn        String
  summaryFr     String
  summaryEn     String
  anecdoteFr    String?    // révélée par la loupe
  anecdoteEn    String?
  plate         String?    // planche de scène du cadran (ex. "londres-tamise", "paris-cite", "en-mer")
  plateSeed     Int?       // variante de la planche (heure, ciel, embarcations, promeneurs)
  dialPlace     String?    // légende ligne 2 : « Londres, vers 1755 » (FR/EN via i18n)
  dialImage     String?    // chemin du WebP peint (assets/dials/<slug>.webp)
  shareImage    String?    // PNG de partage rendu par resvg
  rarity        Rarity
  precision     Int        // 1..10
  complication  Int
  innovation    Int
  prestige      Int
  heritage      Int
  pageviews     Int        @default(0)
  isFlagship    Boolean    @default(false)
  status        CardStatus @default(ACTIVE)   // interrupteur d'urgence
  overrideName  Json?      // { fr, en }
  overrideText  Json?      // { fr, en }
  overrideImage String?
  sourceUrlFr   String?
  sourceUrlEn   String?
  license       String     @default("CC BY-SA 4.0")
  updatedAt     DateTime   @updatedAt
  instances     CardInstance[]
  questions     Question[]
}

model User {
  id             String   @id @default(cuid())
  displayName    String
  provider       String?  // google | discord | null pour un invité
  providerId     String?
  isGuest        Boolean  @default(true)
  rubis          Int      @default(0)
  boosterStock   Int      @default(3)
  boosterRefill  DateTime @default(now())
  rating         Int      @default(1000)
  tutorialDone   Boolean  @default(false)
  createdAt      DateTime @default(now())
  cards          CardInstance[]
  decks          Deck[]
  ledger         LedgerEntry[]
  @@unique([provider, providerId])
}

model CardInstance {
  id         String   @id @default(cuid())
  cardId     String
  ownerId    String
  acquiredAt DateTime @default(now())
  card       Card     @relation(fields: [cardId], references: [id])
  owner      User     @relation(fields: [ownerId], references: [id])
  @@index([ownerId, cardId])
}

model LedgerEntry {
  id        String   @id @default(cuid())
  userId    String
  delta     Int
  reason    String   // RECYCLE | DUEL_WIN | DAILY | ALBUM | AUCTION_BUY | AUCTION_SELL | TAX ...
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}

model Deck {
  id      String   @id @default(cuid())
  userId  String
  name    String
  cardIds String[] // exactement 10 instances
  user    User     @relation(fields: [userId], references: [id])
}

model Question {
  id          String   @id @default(cuid())
  cardId      String
  promptFr    String
  promptEn    String
  choicesFr   String[] // 4 choix
  choicesEn   String[]
  answerIndex Int
  source      String   // AUTO | MANUAL
  verified    Boolean  @default(false)  // seules les questions vérifiées sont utilisées en V1
  card        Card     @relation(fields: [cardId], references: [id])
}

model Match {
  id        String   @id @default(cuid())
  playerA   String
  playerB   String?  // null = bot
  winnerId  String?
  seed      String
  log       Json
  createdAt DateTime @default(now())
}
```

Toute opération sur les Rubis ou la propriété d'une carte : **transaction Prisma** + `LedgerEntry`. Quand un invité se connecte, ses cartes et ses Rubis sont rattachés à son compte.

---

## 6. Phase 1 — Design system, catalogue et rendu des cartes

### 6.1 Design system (`packages/ui`)

Implémenter fidèlement les maquettes de `/design`. Point de départ :

```css
:root {
  /* Interface : papier et encre */
  --paper: #F2ECDF;
  --ink: #121114;
  --ink-muted: #4E4943;    /* texte secondaire, contraste AA sur --paper */
  --steel-blue: #213A9C;   /* seul accent : aiguilles bleuies */
  --night: #121114;        /* sections inversées (ex. raretés) : fond --night, texte --paper, secondaire #CFC8BB */
  --rule: 1px solid var(--ink);

  /* Typographie (celle des maquettes, Google Fonts) */
  --font-display: "Big Shoulders", "Arial Narrow", sans-serif;   /* graisse 900, capitales */
  --font-ui: "Instrument Sans", "Helvetica Neue", sans-serif;
  --font-card-title: "IM Fell English", Georgia, serif;  /* + "Belleza" (marque sur le cadran) et "Pinyon Script" (signature de technique) */
  --font-figures: "JetBrains Mono", ui-monospace, monospace; /* chiffres tabulaires des critères */

  /* Espacements : base 8 px */
  --s1: 4px; --s2: 8px; --s3: 16px; --s4: 24px; --s5: 40px; --s6: 64px;

  /* Mouvement */
  --t-micro: 150ms;        /* boutons, survol */
  --t-screen: 380ms;       /* transitions d'écran */
  --t-reveal: 1000ms;      /* révélation de carte */
  --ease-out: cubic-bezier(.2, .7, .2, 1);
}
```

- Grille : 4 colonnes mobile, 12 colonnes ordinateur. Filets de 1 px, ni ombres ni coins arrondis dans l'interface.
- Composants : bandeau défilant (marquee, figé en `prefers-reduced-motion`), étiquette de section « (Collection) », compteur « 1 — 4 », bouton, minuteur par crans, balancier de chargement, bouton muet.
- Gestionnaire de sons : préchargement, déblocage audio au premier geste, muet mémorisé, sous-titre visuel pour chaque son.
- Échelle typographique fluide (`clamp()`), titres d'affichage jusqu'à environ 18vw dans les bandeaux.

### 6.2 Ingestion (`packages/ingest`)

1. SPARQL sur `https://query.wikidata.org/sparql` : personnes d'occupation horloger, entreprises horlogères, modèles de montres, mécanismes et complications. Vérifier les identifiants Q exacts avant d'écrire les requêtes.
2. Par entité : libellés FR/EN, liens Wikipédia FR/EN, faits utiles (par exemple P569 naissance, P570 décès, P571 fondation, P112 fondateur, P61 inventeur, P17 pays ; vérifier chaque propriété).
3. Résumés via l'API REST Wikipédia (`/api/rest_v1/page/summary/{title}`), FR et EN.
4. Consultations via l'API Wikimedia pageviews (moyenne mensuelle sur 12 mois).
5. Écrire `cards.generated.json`, puis un script `seed` qui l'upsert.
6. `flagship.overrides.json`, écrit à la main, écrase les données des 30 cartes phares.

Contraintes : User-Agent identifiable, délais entre requêtes, cache local ; ignorer les entités sans article dans au moins une langue ; créditer source et licence sur chaque carte.

### 6.3 Rareté et statistiques

- Percentiles de consultations : top 1 % = GRAND_FEU, 1–5 % = CLOISONNE, 5–15 % = GRISAILLE, 15–40 % = MARQUETERIE, reste = GRAVURE. Recalcul hebdomadaire.
- Tirage en booster (configurable) : GRAVURE 60 %, MARQUETERIE 25 %, GRISAILLE 10 %, CLOISONNE 4 %, GRAND_FEU 1 %.
- Budget de points par rareté (configurable) : GRAVURE 20, MARQUETERIE 24, GRISAILLE 28, CLOISONNE 32, GRAND_FEU 36. Répartition par type (Horloger → Innovation, Héritage ; Maison → Prestige, Héritage ; Modèle → Prestige, Complication ; Invention → Innovation, Précision), avec un léger aléatoire déterministe (seed = slug). Les cartes phares prennent leurs stats dans les overrides.

### 6.4 Rendu des cartes (`packages/card-render` + `tools/dial-painter`)

**Principe : la carte est une montre d'art dans son écrin.** Le recto montre une boîte coussin polie posée dans un écrin de cuir surpiqué ; son cadran est une **miniature peinte** (un lieu, une date, une scène), comme les cadrans des Rare Handcrafts. En haut du cadran : WRISTMASTERS puis « SÉRIE I · TYPE ». En bas : le nom de la carte puis le lieu et l'année (« L'échappement à ancre » / « Londres, vers 1755 »), et la technique signée en script. Aiguilles dauphine facettées à 10 h 10. Aucune statistique au recto. Le verso est le fond de boîte (guilloché, numéro, auteur, les 5 critères). En duel (`focus`), un compteur gradué apparaît à 6 h avec la valeur du critère en jeu.

**Deux moitiés, imposées :**

1. **Le cadre, en SVG, au runtime.** Porter `design/Card.dc.html` en composant React `<Card card focus face />` **à l'identique** : géométrie 252 × 352, écrin (cuir, surpiqûre, ombre portée), boîte coussin (dégradés de poli, chanfrein, réhaut, bride), couronne cannelée, cadran découpé dans la boîte (masque), ombre intérieure, reflet du verre, aiguilles facettées et leur ombre, poinçon, polices et positions du texte, verso. Pas de WebGL, pas de shaders.
2. **Le cadran, en image, hors ligne.** `tools/dial-painter` (Python 3.11+, numpy, scipy, Pillow ; aucun service, aucune IA) calcule chaque cadran en 816 × 1152 (4 × la zone de cadran) et l'exporte en WebP q86 (40 à 170 Ko) pour le web et en JPEG q90 pour les images de partage. Coût au runtime : nul. Le rendu est déterministe (graine = slug + `plateSeed`) : on peut tout regénérer.

**Une carte = une planche de scène × la technique de sa rareté.** La planche modèle la scène plan par plan, en valeurs (lumière, perspective atmosphérique, champ de direction des touches, plume, rehauts). La technique la rend :

| Rareté | Technique du cadran | Boîte, écrin, aiguilles |
|---|---|---|
| GRAVURE | Aquatinte sépia sur émail ivoire : peinture à touches multi-échelles, plume, grain d'aquatinte | Acier, cuir marine, aiguilles bleuies |
| MARQUETERIE | Huit essences de placage, fil orienté par pièce, ombrage au sable, traits de coupe, filets d'ébène | Or rose, cuir brun, aiguilles or rose |
| GRISAILLE | Blanc de Limoges sur émail noir : scène de nuit, peinture à touches, rehauts | Or gris, écrin noir, aiguilles or gris |
| CLOISONNE | Aplats d'émail cernés de fils d'or en relief, paillons, léger lustre | Or jaune, velours bleu, aiguilles or |
| GRAND_FEU | Miniature en couleurs à touches, lumière chaude et ombres froides | Or jaune, cuir vert, aiguilles or |

**Les 5 cadrans de référence** sont dans `assets/dials/` et leurs scripts dans `tools/dial-painter/` : `scene_londres2.py` (Londres, vers 1755), `scene_mer.py` (En mer, 1761), `scene_paris_nuit.py` (Paris, 1795), `scene_londres_nuit.py` (Londres, 1762), `scene_paris_soir.py` (Paris, 1801). Le moteur : `painter.py` (peinture à touches d'après Hertzmann 1998, marqueterie, cloisonné, aquatinte, émail), `vedute.py` (ciel, nuages, eau, architecture, navires, personnages du XVIIIe, balustrade, arbres), `marine.py`, `paris.py`.

**Passer à l'échelle du catalogue** (c'est le vrai chantier des cartes) :

- Bâtir une bibliothèque d'une douzaine de **planches** paramétrables qui couvrent l'histoire horlogère : Londres-Tamise, Paris-Cité, Genève-rade (le jet d'eau à partir de 1891 seulement), Vallée de Joux sous la neige, La Chaux-de-Fonds en damier, Le Locle, Neuchâtel et son observatoire, Bienne, Schaffhouse et le Rhin, Glashütte, en mer, l'établi à la fenêtre (intérieur d'atelier), l'observatoire de nuit.
- Chaque planche expose des variantes par graine : heure (matin, couchant, nuit), ciel, embarcations, promeneurs, point de vue décalé. Deux cartes de la même ville ne doivent jamais avoir le même cadran.
- Une planche doit pouvoir être rendue dans **les cinq techniques** (la valeur et le champ de touche suffisent pour Gravure, Marqueterie et Grisaille ; Cloisonné et Grand Feu demandent une carte de matières → palette).
- Exactitude historique : rien d'anachronique dans une scène datée (Notre-Dame sans flèche entre 1792 et 1859, maisons du pont de Londres avant 1760, pas de jet d'eau avant 1891). Une fiche par planche liste ses repères et ses dates de validité ; l'admin refuse une carte dont la date sort de la plage.
- Commande : `python3 tools/dial-painter/render.py --card <slug>` et `--all --jobs N` (multiprocessing). Compter 7 à 60 s par cadran sur un cœur : 500 cartes ≈ 1 h sur 8 cœurs. À lancer en CI à chaque nouvelle carte, résultats versionnés ou poussés sur le stockage objet, servis par Caddy avec cache long.
- Contrôle qualité : planche de contact automatique (toutes les cartes réduites à 204 × 288) et vérification des zones de texte : le haut (marque) et le bas (légende) doivent rester calmes ; contraste de la légende ≥ 4,5:1 grâce au halo, sinon ajuster `inkB`.

| Type de carte | Scène du cadran |
|---|---|
| Invention / complication | Le lieu et l'année de l'invention (Londres 1755 pour l'échappement à ancre) ; le mécanisme vit au verso et à la loupe |
| Horloger | Sa ville à son époque, sa boutique ou son atelier si on en connaît l'adresse (Fleet Street pour Mudge, quai de l'Horloge pour Breguet) |
| Maison | Le lieu et l'année de fondation, aucun logo |
| Modèle | Le lieu et l'année de lancement, aucune silhouette de produit ni logo |

- Polices des cartes : Belleza (marque et type en haut du cadran, chiffres du verso), IM Fell English (légende, lieu et année, verso), Pinyon Script (signature de technique).
- **Poinçon caché** : petit hexagone « WM » à droite au-dessus de la signature, visible seulement à la loupe.
- **Loupe** : comme `design/Loupe.dc.html` — appui long (survol sur ordinateur), loupe ×2,4 qui suit le doigt ; passer sur le poinçon révèle l'anecdote.
- **Dos de booster** (carte face cachée avant révélation) : comme dans `design/Remontage.dc.html`. Le verso d'une carte révélée, lui, est le fond de boîte (`face="back"`).
- Images de partage : rendre le SVG de la carte en PNG avec `@resvg/resvg-js` côté serveur (cadran inclus depuis sa copie JPEG), polices chargées depuis des fichiers.
- Respecter `status` et les champs `override*` partout.

### 6.5 Questions

Générer 1 à 3 QCM par carte à partir des faits Wikidata, avec 3 mauvaises réponses plausibles tirées d'autres cartes du même type. Stockées avec `verified = false`. Fournir une petite page admin protégée pour relire et valider les questions une par une.

**Fin de Phase 1 : s'arrêter et demander validation.**

---

## 7. Phase 2 — Premier contact, collection, partage

### 7.1 Premier contact (sans compte)

1. Accueil : bandeau défilant, couronne au centre, une seule action : « Remonte ta première montre ».
2. Session invitée créée automatiquement ; premier booster offert, garanti avec au moins une GRISAILLE.
3. Révélation carte par carte ; loupe enseignée sur la meilleure carte.
4. « Garde ta collection » : connexion Google ou Discord ; rattacher les cartes de l'invité.
5. Duel tutoriel contre le bot (Phase 3 ; en attendant, lien désactivé).
6. Deuxième booster offert.

Événements Umami : `first_visit`, `first_card_revealed` (avec durée depuis l'arrivée, cible < 20 s), `signup_after_first_booster`, `tutorial_duel_finished`.

### 7.2 Le remontage (ouverture d'un booster)

- Couronne interactive : geste circulaire au doigt ou à la souris, molette, trackpad, flèches du clavier. 12 crans.
- Comportement de référence : `design/Remontage.dc.html` (calcul de l'angle, 30° par cran, sens horaire seulement, appui = un cran, bouton à maintenir).
- À chaque cran : son `cliquet.mp3` (ou la synthèse Web Audio de la maquette), `navigator.vibrate(10)` si disponible (Android ; absent sur Safari iOS, le son et le visuel compensent), la réserve de marche avance d'un cran.
- Au 12e cran : libération du ressort, sortie des cartes.
- Alternative accessible : bouton « Remonter » à maintenir.
- Le premier geste débloque l'audio.

### 7.3 La sonnerie

Le son annonce la rareté avant l'image : CLOISONNE = `timbre.mp3` ; GRAND_FEU = écran assombri, `repetition-minutes.mp3` (3 h 47 : trois coups graves, trois doubles, deux aigus), révélation après environ 5,5 s. Les autres raretés : `revelation.mp3`. Libération du ressort : `ressort.mp3`. Duel : `tic.mp3` / `tac.mp3` en alternance. Équivalent visuel pour chaque son (voir les légendes de la maquette).

### 7.4 Collection

- Boosters : recharge calculée à la lecture (`stock = min(10, stock + floor((now - boosterRefill) / 10 min))`), jamais de cron ; compte à rebours par crans.
- Tirage côté serveur avec RNG sécurisé.
- Album par catégories (maison, époque, complication), états vides soignés (« Ton établi est vide. Remonte une couronne. »).
- Recyclage d'un doublon en Rubis selon la rareté, en transaction. Récompense quotidienne.

### 7.5 Partage

- Endpoint qui génère l'image de partage d'une carte (format story 9:16 et carré) avec le pseudo et la rareté, rendue depuis le SVG de la carte et son cadran JPEG par `@resvg/resvg-js`.
- Bouton « Partager mon tirage » (Web Share API, sinon copie du lien). Page publique de la carte avec balises Open Graph.

**Fin de Phase 2 : s'arrêter et demander validation.**

---

## 8. Phase 3 — Le duel en direct

### 8.1 Moteur (`packages/engine`)

Fonctions pures `(state, action) => { state, events }`, RNG seedé, aucune dépendance réseau ni base.

1. Deck de 10 cartes ; chaque joueur pioche 5 cartes.
2. Chaque joueur a une réserve de marche de 3 crans pour tout le duel.
3. Manche : un critère est tiré parmi PRECISION, COMPLICATION, INNOVATION, PRESTIGE, HERITAGE.
4. 30 secondes : chaque joueur choisit une carte et engage en secret 0 à N crans (+1 par cran). Sans choix, carte au hasard et 0 cran.
5. Révélation simultanée : valeur = critère + crans. La plus haute gagne. Cartes défaussées, crans perdus.
6. **Question décisive** uniquement en cas d'égalité et lors de la manche à 2-2 : chaque joueur répond à une question vérifiée sur sa propre carte (10 secondes), bonne réponse = +2. Si égalité persistante : rareté la plus haute, sinon manche rejouée.
7. Premier à 3 manches.

Tests Vitest : égalités, crans, timeouts, abandon, déconnexion, déterminisme à seed égale.

### 8.2 Temps réel et interface

- Gateway Socket.IO : file d'attente, partie, actions, événements. Le serveur fait autorité ; chaque client ne reçoit que sa main et les cartes révélées.
- Interface : seul le critère en jeu en très grand sur les cartes ; minuteur par crans avec tic-tac qui accélère dans les 5 dernières secondes.
- Présence de l'adversaire : « réfléchit… » puis « verrouillé » ; six réactions prédéfinies (« Tic-tac… », « Chapeau l'artiste », « Remonté à bloc », « Bien réglé », « Ça déraille », « Grand Feu ! »). Pas de chat libre.
- Bot après 20 secondes d'attente : meilleure carte sur le critère, crans engagés selon une règle simple, 20 % d'aléatoire.
- Duel tutoriel scénarisé (main et critères fixés) pour le premier contact.
- Reconnexion pendant 30 secondes avec compte à rebours visible, sinon défaite. Classement Elo simple.

**Fin de Phase 3 : s'arrêter et demander validation.**

---

## 9. Phase 4 — L'économie

- Enchères en Rubis (durée fixe, enchère minimale, taxe de 5 % brûlée).
- Échanges entre joueurs avec double confirmation.
- Protections : transactions, verrous sur les instances, délai avant qu'un nouveau compte puisse vendre, limite d'actions par minute.

---

## 10. Propriété intellectuelle

- Aucun logo, aucune photo officielle, aucune réplique photoréaliste d'un modèle.
- Noms de marques, modèles et personnes autorisés dans le texte des cartes.
- Chaque carte peut être retirée ou renommée via `status` et `override*`, sans redéploiement (page admin).
- Aucune image générée par IA en V1 : les cadrans sont peints par script (`tools/dial-painter`), sur des compositions originales. Si de l'IA arrive en V2 : jamais de nom de marque, de maison ou de modèle dans un prompt, ni « à la manière de [marque] ».
- Aucune silhouette de modèle sur les cadrans ; la boîte coussin des cartes est un dessin générique WristMasters, pas la réplique d'une référence.
- Les pièces de métiers d'art des maisons inspirent les techniques uniquement, jamais les compositions.

---

## 11. Performance et qualité

- LCP < 2,5 s en 4G ; JavaScript initial < 200 Ko compressé.
- Grilles : cadrans en WebP avec `srcset` (408 et 816 px de large), `loading="lazy"` au-delà de l'écran, `decoding="async"` ; l'aiguille des minutes ne tourne que sur la carte au premier plan.
- Lighthouse : Performance ≥ 90 et Accessibilité ≥ 95 sur mobile, mesurés à la fin de chaque phase et notés dans le README.
- États obligatoires pour chaque écran : chargement (balancier par crans), vide, erreur avec action claire, hors ligne.

## 12. Conventions

- TypeScript strict. ESLint + Prettier. `.env.example` documenté.
- Chaque phase livre : code, tests verts, README à jour (`pnpm dev`, `docker compose up -d`), section « Décisions ».
- Commits petits et explicites.

## 13. Premier message à envoyer à l'agent

> Lis `BRIEF_CLAUDE_CODE.md` et regarde toutes les maquettes du dossier `/design`. Crée la structure du monorepo, le schéma Prisma, le docker-compose et un README. Puis réalise la Phase 1 en entier : design system fidèle aux maquettes, ingestion, rareté et statistiques, composant carte porté à l'identique depuis `design/Card.dc.html` (cadre SVG + cadrans de `assets/dials`), `tools/dial-painter` installé avec une commande `render.py` qui regénère les 5 cadrans de référence, loupe, questions et page admin, page catalogue. Respecte les dix règles de la section 2. Arrête-toi à la fin de la Phase 1 et résume ce qui est fait, ce qui reste et les points à valider.
