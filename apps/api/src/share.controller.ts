// Images de partage (carré 1080 et story 1080 × 1920) rendues par resvg depuis le SVG de la carte,
// et page de partage avec balises Open Graph (/partage/… → /api/partage/… via Caddy ou Vite).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Controller, Get, Header, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Resvg } from '@resvg/resvg-js';
import { cardSvg, wrap } from '@wm/card-render/svg';
import { cardResources } from '@wm/card-render/i18n';
import { BOOSTER_ODDS, type CardView, type Lang } from '@wm/shared';
import { langOf, toView } from './card-view';
import { PrismaService } from './prisma';
import { publicUrl } from './session';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FONTS = [
  'Belleza-Regular',
  'IMFeENrm28P',
  'IMFeENit28P',
  'PinyonScript-Regular',
  'BigShoulders-Black',
  'JetBrainsMono-Medium',
  'InstrumentSans-Medium',
].map((f) => join(ROOT, 'assets', 'fonts', `${f}.ttf`));
const TEXT = {
  fr: {
    by: 'Tiré par',
    tagline: 'Le jeu de cartes de l’horlogerie',
    odds: 'des tirages',
    pulled: '{{rarity}}, tirée par {{name}}.',
  },
  en: {
    by: 'Pulled by',
    tagline: 'The trading card game of watchmaking',
    odds: 'of pulls',
    pulled: '{{rarity}}, pulled by {{name}}.',
  },
};
const PAPER = '#F2ECDF',
  INK = '#121114',
  STEEL = '#213A9C';
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ponytail: cache mémoire borné à 200 images ; un stockage objet si le trafic grossit
const cache = new Map<string, Buffer>();
const remember = (key: string, png: Buffer) => {
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, png);
  return png;
};

async function dialHref(dialImage: string | null) {
  if (!dialImage || !/^\/dials\/[a-z0-9-]+$/.test(dialImage)) return null;
  try {
    return `data:image/jpeg;base64,${(await readFile(join(ROOT, 'assets', `${dialImage}.jpg`))).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderShare(
  c: CardView,
  format: 'square' | 'story',
  lang: Lang,
  by: string | null,
): Promise<Buffer> {
  const L = cardResources[lang];
  const T = TEXT[lang];
  const rarity = L.rarity[c.rarity];
  const rate = `${Math.round(BOOSTER_ODDS[c.rarity] * 100)} % ${T.odds}`;
  const card = (x: number, y: number, width: number, href: string | null) =>
    cardSvg(c, {
      x,
      y,
      width,
      dialHref: href,
      series: L.series.replace('{{type}}', L.type[c.type].toLocaleUpperCase(lang)),
      rarityLabel: rarity,
    });
  const t = (x: number, y: number, s: string, attrs: string) =>
    `<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
  const display = (size: number) =>
    `font-family="Big Shoulders" font-weight="900" font-size="${size}" fill="${INK}"`;
  const mono = (size: number, fill = INK) =>
    `font-family="JetBrains Mono" font-size="${size}" fill="${fill}"`;
  const sans = (size: number) => `font-family="Instrument Sans" font-size="${size}" fill="${INK}"`;
  const host = publicUrl().replace(/^https?:\/\//, '');
  const who = by ? `(${T.by}) ${by}` : `(${T.tagline})`;
  const href = await dialHref(c.dialImage);

  let body: string, W: number, H: number;
  if (format === 'square') {
    [W, H] = [1080, 1080];
    const rarityLines = wrap(rarity.toLocaleUpperCase(lang), 1); // un mot par ligne
    // Big Shoulders 900 : environ 0,5 em par capitale ; le mot le plus long tient dans 344 px
    const rs = Math.min(110, Math.floor(344 / (Math.max(...rarityLines.map((l) => l.length)) * 0.5)));
    body =
      t(64, 118, 'WRISTMASTERS', display(72)) +
      t(64 + 452, 118, 'TCG', mono(22)) +
      `<rect x="64" y="150" width="952" height="2" fill="${INK}"/>` +
      card(64, 200, 560, href) +
      t(672, 270, who.slice(0, 34), mono(22)) +
      rarityLines.map((l, i) => t(668, 300 + rs + i * rs * 0.88, l, display(rs))).join('') +
      t(672, 340 + rs + rarityLines.length * rs * 0.88, rate, mono(24, STEEL)) +
      wrap(c.name, 18)
        .slice(0, 4)
        .map((l, i) => t(672, 420 + rs + rarityLines.length * rs * 0.88 + i * 44, l, sans(36)))
        .join('') +
      t(672, 1016, host, mono(22));
  } else {
    [W, H] = [1080, 1920];
    body =
      t(540, 230, 'WRISTMASTERS', `${display(170)} text-anchor="middle"`) +
      t(540, 300, who.slice(0, 48), `${mono(30)} text-anchor="middle"`) +
      card(160, 370, 760, href) +
      t(540, 1610, rarity.toLocaleUpperCase(lang), `${display(150)} text-anchor="middle"`) +
      t(540, 1670, rate, `${mono(30, STEEL)} text-anchor="middle"`) +
      wrap(c.name, 34)
        .slice(0, 2)
        .map((l, i) => t(540, 1740 + i * 52, l, `${sans(44)} text-anchor="middle"`))
        .join('') +
      t(540, 1870, host, `${mono(26)} text-anchor="middle"`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>${body}</svg>`;
  return new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Instrument Sans' },
  })
    .render()
    .asPng();
}

@Controller()
export class ShareController {
  constructor(@Inject(PrismaService) private db: PrismaService) {}

  /** kind = i (exemplaire tiré : avec le pseudo) ou c (carte du catalogue). */
  private async load(kind: string, id: string, lang: Lang) {
    if (kind === 'i') {
      const inst = await this.db.cardInstance.findUnique({
        where: { id },
        include: { card: true, owner: { select: { displayName: true } } },
      });
      if (!inst || inst.card.status !== 'ACTIVE') throw new NotFoundException();
      return { card: toView(inst.card, lang, 0), by: inst.owner.displayName };
    }
    if (kind === 'c') {
      const card = await this.db.card.findFirst({ where: { slug: id, status: 'ACTIVE' } });
      if (!card) throw new NotFoundException();
      return { card: toView(card, lang, 0), by: null };
    }
    throw new NotFoundException();
  }

  @Get('share/:kind/:file')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400')
  async image(
    @Param('kind') kind: string,
    @Param('file') file: string,
    @Query('format') f?: string,
    @Query('lang') l?: string,
  ) {
    const id = file.replace(/\.png$/, '');
    const format = f === 'story' ? 'story' : 'square';
    const lang = langOf(l);
    const key = `${kind}/${id}/${format}/${lang}`;
    if (cache.has(key)) return cache.get(key);
    const { card, by } = await this.load(kind, id, lang);
    return remember(key, await renderShare(card, format, lang, by));
  }

  @Get('partage/:kind/:id')
  async page(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('lang') l: string | undefined,
    @Res() res: Response,
  ) {
    const lang = langOf(l);
    const { card, by } = await this.load(kind, id, lang);
    const T = TEXT[lang];
    const base = publicUrl();
    const target = `${base}/carte/${encodeURIComponent(card.slug)}`;
    const image = `${base}/api/share/${kind}/${encodeURIComponent(id)}.png?format=square&lang=${lang}`;
    const rarity = cardResources[lang].rarity[card.rarity];
    const desc = by
      ? T.pulled.replace('{{rarity}}', rarity).replace('{{name}}', by)
      : `${rarity}. ${T.tagline}.`;
    res.type('html').set('Cache-Control', 'public, max-age=300').send(`<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(card.name)} — WristMasters TCG</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WristMasters TCG">
<meta property="og:title" content="${esc(card.name)} — WristMasters TCG">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${base}/partage/${kind}/${id}`)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1080"><meta property="og:image:height" content="1080">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body><a href="${esc(target)}">${esc(card.name)}</a></body></html>`);
  }
}
