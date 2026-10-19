import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { cardResources } from '@wm/card-render';
import { uiResources } from '@wm/ui';
import { notifTexts, phase2, phase3, phase4 } from './locales';

const app = {
  fr: {
    nav: {
      label: 'Navigation principale',
      catalogue: 'Catalogue',
      rarities: 'Raretés',
      system: 'Design system',
    },
    lang: { switch: 'English', label: 'Langue' },
    offline: 'Hors ligne. Les cartes déjà chargées restent visibles ; le reste revient avec le réseau.',
    footer: {
      credits: 'Crédits',
      creditsText:
        'Textes des cartes adaptés de Wikipédia, sous licence CC BY-SA 4.0. Données Wikidata (CC0). Aucune affiliation avec les maisons citées.',
      dials: 'Cadrans peints par script : aucune IA, aucune image source.',
      made: '© 2026 WristMasters TCG. Remonté à la main.',
    },
    catalogue: {
      marquee: 'LE CATALOGUE',
      title: 'Toutes les cartes.',
      label: 'Catalogue',
      intro:
        'Horlogers, maisons, modèles, inventions et complications, tirés de Wikidata et Wikipédia. Ouvre une carte pour la passer à la loupe.',
      all: 'Tout',
      allRarities: 'Toutes',
      types: {
        WATCHMAKER: 'Horlogers',
        MAISON: 'Maisons',
        MODEL: 'Modèles',
        INVENTION: 'Inventions',
        COMPLICATION: 'Complications',
      },
      typeFilter: 'Filtrer par type',
      rarityFilter: 'Filtrer par rareté',
      search: 'Chercher une carte',
      more: 'Voir plus',
      emptyTitle: 'Rien sur l’établi.',
      emptyText: 'Aucune carte ne correspond. Change de filtre ou de recherche.',
      reset: 'Tout afficher',
      errorTitle: 'Le mouvement s’est grippé.',
      errorText: 'Impossible de charger le catalogue.',
      retry: 'Réessayer',
      serial: 'N° {{n}}',
    },
    card: {
      back: 'Retour au catalogue',
      loupe: 'Loupe',
      hint: 'Appuie longuement sur la carte et promène la loupe. Les curieux trouvent un poinçon.',
      found: 'Poinçon trouvé',
      hidden: 'Un poinçon se cache dans le cadran.',
      show: 'Montrer',
      noAnecdote: 'Pas encore d’anecdote pour cette carte : elle arrive avec les cartes phares.',
      front: 'Voir le recto',
      backFace: 'Voir le verso',
      share: 'Partager',
      copied: 'Lien copié.',
      source: 'Texte adapté de Wikipédia, {{license}}.',
      sourceLink: 'Lire l’article',
      odds: '{{rarity}}, {{rate}} des tirages.',
      notFoundTitle: 'Carte introuvable.',
      notFoundText: 'Elle a peut-être été retirée du catalogue.',
    },
    rarities: {
      title: 'Les cinq raretés.',
      text: 'Chaque carte est un cadran peint : un lieu, une date, une technique de métier d’art par rareté. Aucune IA, aucune image source : les miniatures sont calculées par script, donc reproductibles sur tout le catalogue.',
      desc: {
        GRAVURE: 'Aquatinte sépia sur émail ivoire, boîte acier.',
        MARQUETERIE: 'Huit essences, ombrage au sable, or rose.',
        GRISAILLE: 'Blanc de Limoges sur émail noir, or gris.',
        CLOISONNE: 'Émaux cernés de fils d’or, paillons.',
        GRAND_FEU: 'Miniature en couleurs, or jaune.',
      },
    },
    system: {
      marquee: 'DESIGN SYSTEM',
      title: 'Papier, encre, un accent.',
      label: 'Design system',
      buttons: 'Boutons',
      primary: 'Remonter ma première montre',
      secondary: 'Comment ça marche',
      timer: 'Minuteur par crans',
      loader: 'Balancier de chargement',
      sounds: 'Sons et sous-titres',
      card: 'Carte : recto, verso, duel',
      focus: 'En duel : critère Complication',
    },
    admin: {
      title: 'Admin.',
      token: 'Jeton d’administration',
      enter: 'Entrer',
      logout: 'Sortir',
      unauthorized: 'Jeton refusé.',
      questions: 'Questions',
      cards: 'Cartes',
      pending: '{{n}} à relire',
      noPending: 'Toutes les questions sont relues.',
      prompt: 'Question',
      choices: 'Choix',
      answer: 'Bonne réponse',
      validate: 'Valider',
      skip: 'Passer',
      remove: 'Supprimer',
      search: 'Chercher',
      retire: 'Retirer',
      restore: 'Réactiver',
      edit: 'Modifier',
      save: 'Enregistrer',
      cancel: 'Annuler',
      saved: 'Enregistré.',
      overrideName: 'Nom remplacé',
      overrideText: 'Résumé remplacé',
      overrideImage: 'Cadran remplacé (/dials/…)',
      plate: 'Planche',
      dialYear: 'Année du cadran',
      none: 'Aucune',
      retired: 'Retirée',
    },
  },
  en: {
    nav: { label: 'Main navigation', catalogue: 'Catalogue', rarities: 'Rarities', system: 'Design system' },
    lang: { switch: 'Français', label: 'Language' },
    offline: 'Offline. Cards already loaded stay visible; the rest comes back with the network.',
    footer: {
      credits: 'Credits',
      creditsText:
        'Card texts adapted from Wikipedia under CC BY-SA 4.0. Wikidata data (CC0). Not affiliated with any of the maisons mentioned.',
      dials: 'Dials painted by script: no AI, no source image.',
      made: '© 2026 WristMasters TCG. Hand-wound.',
    },
    catalogue: {
      marquee: 'THE CATALOGUE',
      title: 'Every card.',
      label: 'Catalogue',
      intro:
        'Watchmakers, maisons, models, inventions and complications, drawn from Wikidata and Wikipedia. Open a card to inspect it under the loupe.',
      all: 'All',
      allRarities: 'All',
      types: {
        WATCHMAKER: 'Watchmakers',
        MAISON: 'Maisons',
        MODEL: 'Models',
        INVENTION: 'Inventions',
        COMPLICATION: 'Complications',
      },
      typeFilter: 'Filter by type',
      rarityFilter: 'Filter by rarity',
      search: 'Search a card',
      more: 'Show more',
      emptyTitle: 'The bench is empty.',
      emptyText: 'No card matches. Try another filter or search.',
      reset: 'Show everything',
      errorTitle: 'The movement jammed.',
      errorText: 'The catalogue could not be loaded.',
      retry: 'Try again',
      serial: 'No. {{n}}',
    },
    card: {
      back: 'Back to the catalogue',
      loupe: 'Loupe',
      hint: 'Press and hold the card, then move the loupe. The curious will find a hallmark.',
      found: 'Hallmark found',
      hidden: 'A hallmark hides in the dial.',
      show: 'Show me',
      noAnecdote: 'No anecdote for this card yet: it comes with the flagship cards.',
      front: 'Show the front',
      backFace: 'Show the caseback',
      share: 'Share',
      copied: 'Link copied.',
      source: 'Text adapted from Wikipedia, {{license}}.',
      sourceLink: 'Read the article',
      odds: '{{rarity}}, {{rate}} of pulls.',
      notFoundTitle: 'Card not found.',
      notFoundText: 'It may have been withdrawn from the catalogue.',
    },
    rarities: {
      title: 'The five rarities.',
      text: 'Every card is a painted dial: a place, a date, one artisan technique per rarity. No AI, no source image: the miniatures are computed by script, so the whole catalogue can be reproduced.',
      desc: {
        GRAVURE: 'Sepia aquatint on ivory enamel, steel case.',
        MARQUETERIE: 'Eight woods, sand shading, rose gold.',
        GRISAILLE: 'Limoges white on black enamel, white gold.',
        CLOISONNE: 'Enamels outlined in gold wire, paillons.',
        GRAND_FEU: 'Colour miniature, yellow gold.',
      },
    },
    system: {
      marquee: 'DESIGN SYSTEM',
      title: 'Paper, ink, one accent.',
      label: 'Design system',
      buttons: 'Buttons',
      primary: 'Wind my first watch',
      secondary: 'How it works',
      timer: 'Notched timer',
      loader: 'Balance loader',
      sounds: 'Sounds and captions',
      card: 'Card: front, caseback, duel',
      focus: 'In a duel: Complication criterion',
    },
    admin: {
      title: 'Admin.',
      token: 'Admin token',
      enter: 'Enter',
      logout: 'Log out',
      unauthorized: 'Token refused.',
      questions: 'Questions',
      cards: 'Cards',
      pending: '{{n}} to review',
      noPending: 'Every question has been reviewed.',
      prompt: 'Question',
      choices: 'Choices',
      answer: 'Right answer',
      validate: 'Approve',
      skip: 'Skip',
      remove: 'Delete',
      search: 'Search',
      retire: 'Withdraw',
      restore: 'Restore',
      edit: 'Edit',
      save: 'Save',
      cancel: 'Cancel',
      saved: 'Saved.',
      overrideName: 'Override name',
      overrideText: 'Override summary',
      overrideImage: 'Override dial (/dials/…)',
      plate: 'Plate',
      dialYear: 'Dial year',
      none: 'None',
      retired: 'Withdrawn',
    },
  },
};

const stored = (() => {
  try {
    return localStorage.getItem('wm-lang');
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources: {
    fr: {
      app: { ...app.fr, ...phase2.fr, ...phase3.fr, ...phase4.fr, ...notifTexts.fr },
      ui: uiResources.fr,
      card: cardResources.fr,
    },
    en: {
      app: { ...app.en, ...phase2.en, ...phase3.en, ...phase4.en, ...notifTexts.en },
      ui: uiResources.en,
      card: cardResources.en,
    },
  },
  lng: stored ?? (navigator.language.startsWith('fr') ? 'fr' : 'en'),
  fallbackLng: 'fr',
  defaultNS: 'app',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (l) => {
  document.documentElement.lang = l;
  try {
    localStorage.setItem('wm-lang', l);
  } catch {
    /* rien */
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
