// Géométrie de la carte (252 × 352), portée telle quelle de design/Card.dc.html.
import type { Rarity } from '@wm/shared';

const r2 = (n: number) => Math.round(n * 100) / 100;
type Pt = [number, number];
export const P = (cx: number, cy: number, r: number, d: number): Pt => {
  const a = (d * Math.PI) / 180;
  return [r2(cx + r * Math.sin(a)), r2(cy - r * Math.cos(a))];
};
const pt = (p: Pt) => p[0] + ' ' + p[1];
const circ = (cx: number, cy: number, r: number) =>
  'M' +
  r2(cx - r) +
  ' ' +
  cy +
  'a' +
  r +
  ' ' +
  r +
  ' 0 1 1 ' +
  r2(2 * r) +
  ' 0a' +
  r +
  ' ' +
  r +
  ' 0 1 1 ' +
  r2(-2 * r) +
  ' 0Z';
const poly = (pts: Pt[]) => 'M' + pts.map(pt).join('L') + 'Z';
const ticks = (cx: number, cy: number, r0: number, r1: number, n: number, from: number, to: number) => {
  let d = '';
  const step = (to - from) / n;
  for (let i = 0; i <= n; i++) {
    const a = from + i * step;
    d += 'M' + pt(P(cx, cy, r0, a)) + 'L' + pt(P(cx, cy, r1, a));
  }
  return d;
};

// coussin : rectangle aux flancs bombés (b) et aux coins arrondis (r)
const cushion = (x0: number, y0: number, x1: number, y1: number, r: number, b: number) => {
  const w = x1 - x0,
    h = y1 - y0,
    dx = (w - 2 * r) / 3,
    dy = (h - 2 * r) / 3;
  return (
    'M' +
    r2(x0 + r) +
    ' ' +
    y0 +
    'C' +
    r2(x0 + r + dx) +
    ' ' +
    r2(y0 - b) +
    ' ' +
    r2(x1 - r - dx) +
    ' ' +
    r2(y0 - b) +
    ' ' +
    r2(x1 - r) +
    ' ' +
    y0 +
    'Q' +
    x1 +
    ' ' +
    y0 +
    ' ' +
    x1 +
    ' ' +
    r2(y0 + r) +
    'C' +
    r2(x1 + b) +
    ' ' +
    r2(y0 + r + dy) +
    ' ' +
    r2(x1 + b) +
    ' ' +
    r2(y1 - r - dy) +
    ' ' +
    x1 +
    ' ' +
    r2(y1 - r) +
    'Q' +
    x1 +
    ' ' +
    y1 +
    ' ' +
    r2(x1 - r) +
    ' ' +
    y1 +
    'C' +
    r2(x1 - r - dx) +
    ' ' +
    r2(y1 + b) +
    ' ' +
    r2(x0 + r + dx) +
    ' ' +
    r2(y1 + b) +
    ' ' +
    r2(x0 + r) +
    ' ' +
    y1 +
    'Q' +
    x0 +
    ' ' +
    y1 +
    ' ' +
    x0 +
    ' ' +
    r2(y1 - r) +
    'C' +
    r2(x0 - b) +
    ' ' +
    r2(y1 - r - dy) +
    ' ' +
    r2(x0 - b) +
    ' ' +
    r2(y0 + r + dy) +
    ' ' +
    x0 +
    ' ' +
    r2(y0 + r) +
    'Q' +
    x0 +
    ' ' +
    y0 +
    ' ' +
    r2(x0 + r) +
    ' ' +
    y0 +
    'Z'
  );
};

// aiguille dauphine facettée : deux demi-losanges, l'un clair, l'autre sombre
const C: Pt = [126, 176];
const dauph = (deg: number, len: number, w: number, tail: number) => {
  const T = P(C[0], C[1], tail, deg + 180),
    Lp = P(C[0], C[1], w, deg - 90),
    Rp = P(C[0], C[1], w, deg + 90),
    Tip = P(C[0], C[1], len, deg);
  return { L: poly([T, Lp, Tip]), R: poly([T, Tip, Rp]), all: poly([T, Lp, Tip, Rp]) };
};

let crownFlutes = '',
  crownFlutesHi = '';
for (let y = 167.2; y <= 185; y += 1.6) {
  crownFlutes += 'M241.5 ' + r2(y) + 'L248.6 ' + r2(y);
  crownFlutesHi += 'M241.5 ' + r2(y + 0.6) + 'L248.2 ' + r2(y + 0.6);
}
let guilloche = '';
for (let r = 5; r < 160; r += 2.4) guilloche += circ(126, 196, r);

export const G = {
  hour: dauph(304.5, 36, 2.6, 8),
  min: dauph(54, 56, 2.1, 10),
  caseOuter: cushion(15, 26, 237, 326, 66, 3),
  caseBevel: cushion(19.5, 30.5, 232.5, 321.5, 62, 2.8),
  caseFacet: cushion(21.6, 32.6, 230.4, 319.4, 60, 2.6),
  flange: cushion(23.6, 34.6, 228.4, 317.4, 58, 2.5),
  dial: cushion(25.2, 36.2, 226.8, 315.8, 56.5, 2.4),
  // reflets du poli : deux traits sur l'arête haute gauche
  caseHi: 'M30 52 Q32 34 58 28.5 M18.5 120 Q16.6 160 17.6 196',
  crown:
    'M241 167Q241 165.4 242.6 165.4L247.4 165.4Q249.4 165.4 249.4 168L249.4 184Q249.4 186.6 247.4 186.6L242.6 186.6Q241 186.6 241 185Z',
  crownFlutes,
  crownFlutesHi,
  guilloche,
  subTicks: ticks(126, 270, 26.5, 29, 10, -135, 135),
};

/** Arc du compteur à 6 h pour une valeur 0..10. */
export function subArc(value: number) {
  const vAngle = -135 + (value / 10) * 270;
  const p0 = P(126, 270, 22.5, -135),
    p1 = P(126, 270, 22.5, vAngle);
  return 'M' + pt(p0) + 'A22.5 22.5 0 ' + (vAngle + 135 > 180 ? 1 : 0) + ' 1 ' + pt(p1);
}

/** Poinçon caché : à droite au-dessus de la signature, en coordonnées de carte. */
export const HALLMARK = { x: 206, y: 236 };

// Dos du booster (design/Remontage.dc.html)
let backRays = '';
for (let a = 0; a < 360; a += 5) {
  const rad = (a * Math.PI) / 180;
  backRays +=
    'M' +
    r2(126 + 46 * Math.sin(rad)) +
    ' ' +
    r2(176 - 46 * Math.cos(rad)) +
    'L' +
    r2(126 + 260 * Math.sin(rad)) +
    ' ' +
    r2(176 - 260 * Math.cos(rad));
}
export const BACK_RAYS = backRays;

export interface Theme {
  box: string;
  stitch: string;
  bz0: string;
  bz1: string;
  bz2: string;
  bz3: string;
  ground: string;
  ink: string;
  halo: string;
  inkB: string;
  haloB: string;
  hand0: string;
  hand1: string;
  sub: string;
  subInk: string;
  pl0: string;
  pl1: string;
  plText: string;
}

// Boîtier, écrin et encre par technique (rareté).
export const THEMES: Record<Rarity, Theme> = {
  GRAVURE: {
    box: '#141A26',
    stitch: '#3A4866',
    bz0: '#FAFAF8',
    bz1: '#C7CBCE',
    bz2: '#7B8086',
    bz3: '#3B3F44',
    ground: '#EFE7D6',
    ink: '#2A2018',
    halo: '0 0 3px rgba(239,231,214,0.75)',
    inkB: '#2A2018',
    haloB: '0 0 3px rgba(239,231,214,0.9)',
    hand0: '#4A66A8',
    hand1: '#16224A',
    sub: '#EFE7D6',
    subInk: '#2A2018',
    pl0: '#F2F2F0',
    pl1: '#B9BDC1',
    plText: '#25282B',
  },
  MARQUETERIE: {
    box: '#22130F',
    stitch: '#5A3426',
    bz0: '#FFEDE1',
    bz1: '#E8B396',
    bz2: '#A8664A',
    bz3: '#5C3222',
    ground: '#C99D66',
    ink: '#2B170B',
    halo: '0 0 3px rgba(240,215,170,0.9)',
    inkB: '#F6EAD0',
    haloB: '0 0 3px rgba(43,23,11,0.95)',
    hand0: '#FFE4D2',
    hand1: '#9C5A3E',
    sub: '#E9CFA6',
    subInk: '#2B170B',
    pl0: '#F6D9C6',
    pl1: '#C9907A',
    plText: '#3A2216',
  },
  GRISAILLE: {
    box: '#0C0C0E',
    stitch: '#34353A',
    bz0: '#F4F4F2',
    bz1: '#B3B7BB',
    bz2: '#62666B',
    bz3: '#2B2D30',
    ground: '#141416',
    ink: '#EEE8DC',
    halo: '0 0 3px rgba(10,10,12,0.9)',
    inkB: '#EEE8DC',
    haloB: '0 0 3px rgba(10,10,12,0.9)',
    hand0: '#F7F7F5',
    hand1: '#8E9399',
    sub: '#141416',
    subInk: '#EEE8DC',
    pl0: '#5D5F63',
    pl1: '#26282B',
    plText: '#ECE6DA',
  },
  CLOISONNE: {
    box: '#0E1838',
    stitch: '#2C3C70',
    bz0: '#FFF4CC',
    bz1: '#E6C26A',
    bz2: '#A97E2A',
    bz3: '#5A3F10',
    ground: '#13295A',
    ink: '#F4DFA0',
    halo: '0 0 3px rgba(8,18,48,0.9)',
    inkB: '#F4DFA0',
    haloB: '0 0 3px rgba(8,18,48,0.9)',
    hand0: '#FFF0BE',
    hand1: '#B88A30',
    sub: '#13295A',
    subInk: '#F4DFA0',
    pl0: '#F7E3A6',
    pl1: '#CFA552',
    plText: '#3B2A0A',
  },
  GRAND_FEU: {
    box: '#0D2119',
    stitch: '#2A4A3A',
    bz0: '#FFF4CC',
    bz1: '#E6C26A',
    bz2: '#A97E2A',
    bz3: '#5A3F10',
    ground: '#F3E9D6',
    ink: '#1F2436',
    halo: '0 0 3px rgba(225,232,245,0.8)',
    inkB: '#FBF1DE',
    haloB: '0 0 3px rgba(30,38,66,0.9)',
    hand0: '#FFF0BE',
    hand1: '#9A7224',
    sub: '#F6EEDC',
    subInk: '#2E1F12',
    pl0: '#F7E3A6',
    pl1: '#CFA552',
    plText: '#3B2A0A',
  },
};
