import { expect, it } from 'vitest';
import type { Card } from '@prisma/client';
import { checkPlate, toView } from './card-view';

const card = {
  slug: 'tourbillon',
  number: 427,
  type: 'COMPLICATION',
  rarity: 'GRAND_FEU',
  nameFr: 'Tourbillon',
  nameEn: 'Tourbillon',
  captionFr: 'Le tourbillon',
  captionEn: 'The tourbillon',
  summaryFr: 'fr',
  summaryEn: 'en',
  overrideName: null,
  overrideText: null,
  overrideImage: null,
  dialPlaceFr: 'Paris, 1801',
  dialPlaceEn: 'Paris, 1801',
  dialImage: '/dials/cadran-paris-1801',
  precision: 7,
  complication: 8,
  innovation: 8,
  prestige: 9,
  heritage: 4,
} as unknown as Card;

it('applique la langue et les overrides', () => {
  expect(toView(card, 'en', 5).caption).toBe('The tourbillon');
  const o = toView(
    { ...card, overrideName: { fr: 'Cage tournante' }, overrideImage: '/dials/x' } as Card,
    'fr',
    5,
  );
  expect([o.name, o.caption, o.dialImage]).toEqual(['Cage tournante', 'Cage tournante', '/dials/x']);
  expect(toView({ ...card, overrideName: { fr: 'Cage tournante' } } as Card, 'en', 5).name).toBe(
    'Tourbillon',
  );
});

it('refuse une date hors de la plage de la planche', () => {
  const t = { 'paris-notre-dame-nuit': { from: 1792, to: 1858, landmarks: ['Notre-Dame sans flèche'] } };
  expect(checkPlate('paris-notre-dame-nuit', 1795, t)).toBeNull();
  expect(checkPlate('paris-notre-dame-nuit', 1870, t)).toMatch(/hors plage/);
  expect(checkPlate('geneve-rade', 1900, t)).toMatch(/inconnue/);
  expect(checkPlate(null, null, t)).toBeNull();
});
