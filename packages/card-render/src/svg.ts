// Recto de la carte en SVG pur, pour les images de partage rendues par resvg côté serveur.
// Même géométrie et mêmes thèmes que <Card /> ; les textes HTML de la maquette deviennent des <text>.
import type { CardView } from '@wm/shared';
import { G, THEMES } from './geometry';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Découpe en lignes d'au plus `max` caractères, sans couper les mots. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const w of text.split(/\s+/)) {
    const last = lines.at(-1);
    if (last != null && (last + ' ' + w).length <= max) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  return lines;
}

export interface CardSvgOptions {
  x: number;
  y: number;
  width: number;
  /** Cadran (data URI JPEG) ou null pour l'émail uni. */
  dialHref: string | null;
  series: string; // « SÉRIE I · COMPLICATION »
  rarityLabel: string; // signature en script
}

export function cardSvg(c: CardView, o: CardSvgOptions): string {
  const t = THEMES[c.rarity];
  const k = 'k';
  const u = (id: string) => `url(#${id}-${k})`;
  const capSize = c.caption.length > 34 ? 9.5 : c.caption.length > 20 ? 11.5 : 13.5;
  const capLines = wrap(c.caption, Math.floor(180 / (capSize * 0.42)));
  const halo = (color: string, blur: number, body: string) =>
    `<g filter="url(#halo${blur}-${k})" fill="${color}" stroke="${color}" stroke-width="0.6">${body}</g>${body}`;
  const text = (x: number, y: number, s: string, attrs: string) =>
    `<text x="${x}" y="${y}" text-anchor="middle" ${attrs}>${esc(s)}</text>`;
  const haloColor = (shadow: string) => shadow.replace(/^0 0 3px /, '');

  const brand =
    text(126 + 1.1, 57.6, 'WRISTMASTERS', `font-family="Belleza" font-size="8" letter-spacing="2.24"`) +
    text(
      126 + 1.15,
      66.4,
      o.series,
      `font-family="Belleza" font-size="4.6" letter-spacing="2.3" opacity="0.9"`,
    );
  const capY = 272 + capSize * 0.86;
  const caption =
    capLines
      .map((l, i) =>
        text(
          126,
          capY + i * capSize * 1.05,
          l,
          `font-family="IM FELL English, IM Fell English" font-size="${capSize}"`,
        ),
      )
      .join('') +
    (c.dialPlace
      ? text(
          126,
          capY + (capLines.length - 1) * capSize * 1.05 + 10,
          c.dialPlace,
          `font-family="IM FELL English, IM Fell English" font-style="italic" font-size="8.6"`,
        )
      : '');
  const signature = `<text x="150" y="260.5" transform="rotate(-7 150 256.5)" font-family="Pinyon Script" font-size="11">${esc(o.rarityLabel)}</text>`;

  const dial = o.dialHref
    ? `<rect x="24.5" y="32.7" width="203" height="286.6" fill="${t.ground}"/><image href="${o.dialHref}" x="24.5" y="32.7" width="203" height="286.6" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="24.5" y="32.7" width="203" height="286.6" fill="${t.ground}"/>`;

  return `<svg x="${o.x}" y="${o.y}" width="${o.width}" height="${(o.width * 352) / 252}" viewBox="0 0 252 352">
<defs>
<clipPath id="round-${k}"><rect width="252" height="352" rx="12"/></clipPath>
<linearGradient id="cs-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bz1}"/><stop offset="0.08" stop-color="${t.bz0}"/><stop offset="0.2" stop-color="${t.bz1}"/><stop offset="0.36" stop-color="${t.bz3}"/><stop offset="0.47" stop-color="${t.bz2}"/><stop offset="0.56" stop-color="${t.bz0}"/><stop offset="0.66" stop-color="${t.bz1}"/><stop offset="0.84" stop-color="${t.bz3}"/><stop offset="1" stop-color="${t.bz2}"/></linearGradient>
<linearGradient id="cb-${k}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bz3}"/><stop offset="0.3" stop-color="${t.bz1}"/><stop offset="0.5" stop-color="${t.bz0}"/><stop offset="0.7" stop-color="${t.bz2}"/><stop offset="1" stop-color="${t.bz0}"/></linearGradient>
<linearGradient id="cr-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bz2}"/><stop offset="0.25" stop-color="${t.bz0}"/><stop offset="0.5" stop-color="${t.bz1}"/><stop offset="1" stop-color="${t.bz3}"/></linearGradient>
<radialGradient id="spot-${k}" cx="70" cy="40" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="1" stop-color="#000000" stop-opacity="0.28"/></radialGradient>
<linearGradient id="sheen-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/><stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0.03"/><stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<filter id="leather-${k}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.28"/></filter>
<filter id="pebble-${k}" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.32" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -0.9 0.42"/></filter>
<filter id="soft-${k}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="hsh-${k}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.9"/></filter>
<filter id="ish-${k}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.6"/></filter>
<filter id="halo1-${k}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
<mask id="hole-${k}" maskUnits="userSpaceOnUse" x="0" y="0" width="252" height="352"><rect width="252" height="352" fill="#FFFFFF"/><path d="${G.dial}" fill="#000000"/></mask>
<clipPath id="dc-${k}"><path d="${G.dial}"/></clipPath>
</defs>
<g clip-path="${u('round')}">
${dial}
<g mask="${u('hole')}">
<rect width="252" height="352" fill="${t.box}"/>
<rect width="252" height="352" filter="${u('pebble')}" opacity="0.07"/>
<rect width="252" height="352" filter="${u('leather')}" opacity="0.5"/>
<rect width="252" height="352" fill="${u('spot')}"/>
<rect x="7.5" y="7.5" width="237" height="337" rx="10" fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="0.9" stroke-dasharray="2.6 1.7" transform="translate(0.4 0.7)"/>
<rect x="7.5" y="7.5" width="237" height="337" rx="10" fill="none" stroke="${t.stitch}" stroke-width="0.8" stroke-dasharray="2.6 1.7" stroke-linecap="round"/>
<path d="${G.caseOuter}" fill="#000000" opacity="0.6" filter="${u('soft')}" transform="translate(2 6)"/>
<path d="M236 171.4L241 171.4L241 180.6L236 180.6Z" fill="${u('cr')}"/>
<path d="${G.crown}" fill="${u('cr')}"/>
<path d="${G.crownFlutes}" stroke="${t.bz3}" stroke-width="0.5" opacity="0.75" fill="none"/>
<path d="${G.crownFlutesHi}" stroke="${t.bz0}" stroke-width="0.35" opacity="0.8" fill="none"/>
<path d="${G.caseOuter}" fill="${u('cs')}"/>
<path d="${G.caseOuter}" fill="none" stroke="${t.bz3}" stroke-width="0.6"/>
<path d="${G.caseBevel}" fill="${u('cb')}"/>
<path d="${G.caseFacet}" fill="${u('cs')}"/>
<path d="${G.caseFacet}" fill="none" stroke="${t.bz0}" stroke-width="0.45" opacity="0.9"/>
<path d="${G.flange}" fill="${t.bz3}"/>
<path d="${G.caseHi}" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round" opacity="0.55" filter="${u('hsh')}"/>
</g>
<g clip-path="${u('dc')}">
<path d="${G.dial}" fill="none" stroke="#000000" stroke-width="7" opacity="0.55" filter="${u('ish')}"/>
<g fill="${t.ink}">${halo(haloColor(t.halo), 1, brand)}</g>
<g fill="${t.inkB}">${halo(haloColor(t.haloB), 1, signature + caption)}</g>
<g transform="translate(1.2 2.4)" filter="${u('hsh')}" opacity="0.4"><path d="${G.hour.all}" fill="#000000"/><path d="${G.min.all}" fill="#000000"/></g>
<path d="${G.hour.L}" fill="${t.hand0}"/><path d="${G.hour.R}" fill="${t.hand1}"/>
<path d="${G.min.L}" fill="${t.hand0}"/><path d="${G.min.R}" fill="${t.hand1}"/>
<circle cx="126" cy="176" r="3.4" fill="${t.hand1}"/><circle cx="126" cy="176" r="2.2" fill="${t.hand0}"/>
<circle cx="125.4" cy="175.4" r="0.7" fill="#FFFFFF" opacity="0.7"/>
<rect width="252" height="352" fill="${u('sheen')}"/>
</g>
</g>
</svg>`;
}
