import { expect, it } from 'vitest';
import { assignDial, plateForPlace, type DialInput } from './dials';

const ranges = {
  'geneve-rade': { from: 1700, to: 2100 },
  'chaux-de-fonds': { from: 1835, to: 2100 },
  'londres-tamise': { from: 1711, to: 1950 },
  observatoire: { from: 1670, to: 2100 },
  etabli: { from: 1000, to: 2100 },
  'en-mer': { from: 1650, to: 2100 },
};
const card = (o: Partial<DialInput>): DialInput => ({
  slug: 'x',
  type: 'MAISON',
  nameFr: 'X',
  nameEn: 'X',
  year: null,
  yearEnd: null,
  placeFr: null,
  placeEn: null,
  countryFr: null,
  countryEn: null,
  ...o,
});

it('reconnaît les villes horlogères, avec ou sans accents', () => {
  expect(plateForPlace('Genève')).toBe('geneve-rade');
  expect(plateForPlace('Le Brassus')).toBe('vallee-de-joux');
  expect(plateForPlace('Saint-Imier')).toBe('le-locle');
  expect(plateForPlace('Granges')).toBe('bienne');
  expect(plateForPlace('ancien 11e arrondissement de Paris')).toBe('paris-cite');
  expect(plateForPlace('Tokyo')).toBeNull();
});

it('maison dont on ne connaît que le siège actuel : la ville sans l’année', () => {
  const d = assignDial(card({ year: 1905, placeFr: 'Genève', placeEn: 'Geneva', currentSeat: true }), ranges);
  expect([d.plate, d.dialYear, d.dialPlaceFr]).toEqual(['geneve-rade', 1905, 'Genève']);
});

it('maison : lieu et année de fondation', () => {
  const d = assignDial(card({ year: 1839, placeFr: 'Genève', placeEn: 'Geneva' }), ranges);
  expect(d).toMatchObject({ plate: 'geneve-rade', dialYear: 1839, dialPlaceFr: 'Genève, 1839', dialPlaceEn: 'Geneva, 1839' });
});

it('horloger né quelque part : la ville natale l’année de sa naissance', () => {
  const d = assignDial(card({ type: 'WATCHMAKER', year: 1747, yearEnd: 1823, placeFr: 'Neuchâtel', placeEn: 'Neuchâtel', birthplace: true }), {
    ...ranges,
    neuchatel: { from: 1700, to: 2100 },
  });
  expect([d.dialYear, d.dialPlaceFr]).toEqual([1747, 'Neuchâtel, 1747']);
});

it('horloger : sa ville de travail à 35 ans, « vers », jamais après sa mort', () => {
  const d = assignDial(card({ type: 'WATCHMAKER', year: 1747, yearEnd: 1823, placeFr: 'Paris', placeEn: 'Paris' }), ranges);
  expect(d.dialYear).toBe(1782);
  expect([d.dialPlaceFr, d.dialPlaceEn]).toEqual(['Paris, vers 1782', 'Paris, c. 1782']);
  expect(assignDial(card({ type: 'WATCHMAKER', year: 1800, yearEnd: 1820 }), ranges).dialYear).toBe(1820);
});

it('anachronisme : une année hors de la plage de la planche donne l’établi', () => {
  expect(assignDial(card({ year: 1800, placeFr: 'La Chaux-de-Fonds' }), ranges).plate).toBe('etabli');
  expect(assignDial(card({ year: 1700, placeFr: 'Londres' }), ranges).plate).toBe('etabli');
});

it('montre de plongée en mer ; invention sans lieu à l’observatoire ; sinon l’établi, avec le pays', () => {
  expect(assignDial(card({ type: 'MODEL', nameFr: 'Rolex Submariner', year: 1953 }), ranges)).toMatchObject({
    plate: 'en-mer',
    dialPlaceFr: 'En mer, 1953',
  });
  expect(assignDial(card({ type: 'INVENTION', year: 1675 }), ranges).plate).toBe('observatoire');
  const d = assignDial(card({ year: 1881, placeFr: 'Tokyo', placeEn: 'Tokyo' }), ranges);
  expect([d.plate, d.dialPlaceFr]).toEqual(['etabli', 'Tokyo, 1881']);
  expect(assignDial(card({ year: 1918, countryFr: 'Japon', countryEn: 'Japan' }), ranges).dialPlaceFr).toBe('Japon, 1918');
});

it('graine stable par carte', () => {
  expect(assignDial(card({ slug: 'a' }), ranges).plateSeed).toBe(assignDial(card({ slug: 'a' }), ranges).plateSeed);
  expect(assignDial(card({ slug: 'a' }), ranges).plateSeed).not.toBe(assignDial(card({ slug: 'b' }), ranges).plateSeed);
});
