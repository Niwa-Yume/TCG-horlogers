export { Card, FluidCard, BoosterBack, type CardProps } from './Card';
export { Loupe } from './Loupe';
export { THEMES, HALLMARK } from './geometry';

/** Textes des cartes (espace de noms i18next « card »). */
export const cardResources = {
  fr: {
    series: 'SÉRIE I · {{type}}',
    circa: 'vers {{year}}',
    credit: 'Cadran : {{place}} · Texte : Wikipédia, CC BY-SA',
    creditText: 'Texte : Wikipédia, CC BY-SA',
    aria: '{{name}}, {{type}}, {{byline}}. Cadran peint : {{place}}. Rareté {{rarity}}. {{stats}}.',
    loupe: 'Carte à la loupe. Promène la loupe au doigt (appui long), à la souris ou avec les flèches.',
    type: {
      WATCHMAKER: 'Horloger',
      MAISON: 'Maison',
      MODEL: 'Modèle',
      INVENTION: 'Invention',
      COMPLICATION: 'Complication',
      EVENT: 'Événement',
    },
    rarity: {
      GRAVURE: 'Gravure',
      MARQUETERIE: 'Marqueterie',
      GRISAILLE: 'Grisaille',
      CLOISONNE: 'Cloisonné',
      GRAND_FEU: 'Grand Feu',
    },
    criteria: {
      precision: 'Précision',
      complication: 'Complication',
      innovation: 'Innovation',
      prestige: 'Prestige',
      heritage: 'Héritage',
    },
  },
  en: {
    series: 'SERIES I · {{type}}',
    circa: 'c. {{year}}',
    credit: 'Dial: {{place}} · Text: Wikipedia, CC BY-SA',
    creditText: 'Text: Wikipedia, CC BY-SA',
    aria: '{{name}}, {{type}}, {{byline}}. Painted dial: {{place}}. {{rarity}} rarity. {{stats}}.',
    loupe: 'Card under the loupe. Move the loupe with a long press, the mouse or the arrow keys.',
    type: {
      WATCHMAKER: 'Watchmaker',
      MAISON: 'Maison',
      MODEL: 'Model',
      INVENTION: 'Invention',
      COMPLICATION: 'Complication',
      EVENT: 'Event',
    },
    rarity: {
      GRAVURE: 'Engraving',
      MARQUETERIE: 'Marquetry',
      GRISAILLE: 'Grisaille',
      CLOISONNE: 'Cloisonné',
      GRAND_FEU: 'Grand Feu',
    },
    criteria: {
      precision: 'Precision',
      complication: 'Complication',
      innovation: 'Innovation',
      prestige: 'Prestige',
      heritage: 'Heritage',
    },
  },
};
