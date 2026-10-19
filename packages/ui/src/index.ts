export * from './components';
export { sound, SOUNDS, type SoundName } from './sound';

/** Textes du design system (espace de noms i18next « ui »). */
export const uiResources = {
  fr: {
    loading: 'Chargement…',
    mute: 'Couper le son',
    unmute: 'Activer le son',
    sound: {
      cliquet: 'Cliquet : un cran.',
      armage: 'Armage du ressort.',
      ressort: 'Ressort libéré.',
      tic: 'Tic.',
      tac: 'Tac.',
      timbre: 'Timbre : un coup.',
      'repetition-minutes': 'Répétition minutes : trois coups graves, trois doubles, deux aigus.',
      revelation: 'Carte révélée.',
    },
  },
  en: {
    loading: 'Loading…',
    mute: 'Mute sound',
    unmute: 'Turn sound on',
    sound: {
      cliquet: 'Click: one notch.',
      armage: 'Winding the mainspring.',
      ressort: 'Mainspring released.',
      tic: 'Tick.',
      tac: 'Tock.',
      timbre: 'Gong: one strike.',
      'repetition-minutes': 'Minute repeater: three low strikes, three doubles, two high.',
      revelation: 'Card revealed.',
    },
  },
};
