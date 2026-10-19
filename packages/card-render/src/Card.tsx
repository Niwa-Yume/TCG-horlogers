// <Card /> : port à l'identique de design/Card.dc.html (cadre SVG + cadran peint en WebP).
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { CRITERIA, type CardView, type Criterion } from '@wm/shared';
import { BACK_RAYS, G, subArc, THEMES } from './geometry';
import s from './card.module.css';

export interface CardProps {
  card: CardView;
  face?: 'front' | 'back';
  /** Duel : compteur gradué à 6 h avec la valeur du critère en jeu. */
  focus?: Criterion;
  /** Largeur affichée en px (252 par défaut) ; la carte est dessinée en 252 × 352 puis mise à l'échelle. */
  width?: number;
  /** L'aiguille des minutes ne tourne que sur la carte au premier plan. */
  live?: boolean;
  /** Cadran chargé tout de suite (cartes au-dessus de la ligne de flottaison). */
  eager?: boolean;
}

const abs: CSSProperties = { position: 'absolute' };

export function Card({
  card: c,
  face = 'front',
  focus,
  width = 252,
  live = false,
  eager = false,
}: CardProps) {
  const { t, i18n } = useTranslation('card');
  const k = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const th = THEMES[c.rarity];
  const scale = width / 252;
  const back = face === 'back';
  const fv = focus ? c.stats[focus] : null;
  const typeLabel = t(`type.${c.type}`);
  const rarityLabel = t(`rarity.${c.rarity}`);
  const yearText =
    c.year == null
      ? ''
      : c.yearCirca
        ? t('circa', { year: c.year })
        : c.yearEnd
          ? `${c.year}–${c.yearEnd}`
          : String(c.year);
  const byline = [c.author, yearText].filter(Boolean).join(', ');
  const capSize = c.caption.length > 34 ? '9.5px' : c.caption.length > 20 ? '11.5px' : '13.5px';
  const pad = (n: number) => String(n).padStart(4, '0');
  const aria = t('aria', {
    name: c.name,
    type: typeLabel.toLowerCase(),
    byline,
    place: c.dialPlace ?? '—',
    rarity: rarityLabel,
    stats: CRITERIA.map((q) => `${t(`criteria.${q}`)} ${c.stats[q]}`).join(', '),
  });
  const u = (id: string) => `url(#${id}-${k})`;

  return (
    <div
      role="img"
      aria-label={aria}
      style={{ position: 'relative', width, height: (width * 352) / 252, flex: 'none' }}
    >
      <div
        style={{
          position: 'relative',
          width: 252,
          height: 352,
          overflow: 'hidden',
          borderRadius: 12,
          background: th.box,
          color: th.ink,
          fontFamily: "'IM Fell English', 'Iowan Old Style', Georgia, serif",
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {!back &&
          (c.dialImage ? (
            <img
              src={`${c.dialImage}.webp`}
              srcSet={`${c.dialImage}-408.webp 408w, ${c.dialImage}.webp 816w`}
              sizes={`${Math.ceil(203 * scale)}px`}
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              fetchPriority={eager ? 'high' : 'auto'}
              decoding="async"
              style={{
                ...abs,
                left: 24.5,
                top: 32.7,
                width: 203,
                height: 286.6,
                objectFit: 'cover',
                background: th.ground,
              }}
            />
          ) : (
            <div
              style={{ ...abs, left: 24.5, top: 32.7, width: 203, height: 286.6, background: th.ground }}
            />
          ))}

        <svg width="252" height="352" viewBox="0 0 252 352" aria-hidden="true" style={{ ...abs, inset: 0 }}>
          <defs>
            <linearGradient id={`cs-${k}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={th.bz1} />
              <stop offset="0.08" stopColor={th.bz0} />
              <stop offset="0.2" stopColor={th.bz1} />
              <stop offset="0.36" stopColor={th.bz3} />
              <stop offset="0.47" stopColor={th.bz2} />
              <stop offset="0.56" stopColor={th.bz0} />
              <stop offset="0.66" stopColor={th.bz1} />
              <stop offset="0.84" stopColor={th.bz3} />
              <stop offset="1" stopColor={th.bz2} />
            </linearGradient>
            <linearGradient id={`cb-${k}`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={th.bz3} />
              <stop offset="0.3" stopColor={th.bz1} />
              <stop offset="0.5" stopColor={th.bz0} />
              <stop offset="0.7" stopColor={th.bz2} />
              <stop offset="1" stopColor={th.bz0} />
            </linearGradient>
            <linearGradient id={`cr-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={th.bz2} />
              <stop offset="0.25" stopColor={th.bz0} />
              <stop offset="0.5" stopColor={th.bz1} />
              <stop offset="1" stopColor={th.bz3} />
            </linearGradient>
            <linearGradient id={`pl-${k}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={th.pl0} />
              <stop offset="0.55" stopColor={th.pl1} />
              <stop offset="1" stopColor={th.pl0} />
            </linearGradient>
            <radialGradient id={`spot-${k}`} cx="70" cy="40" r="300" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
            </radialGradient>
            <linearGradient id={`sheen-${k}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
              <stop offset="0.34" stopColor="#FFFFFF" stopOpacity="0.03" />
              <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <filter id={`leather-${k}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={7} />
              <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.28" />
            </filter>
            <filter id={`pebble-${k}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="turbulence" baseFrequency="0.32" numOctaves={2} seed={3} />
              <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -0.9 0.42" />
            </filter>
            <filter id={`soft-${k}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id={`hsh-${k}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
            <filter id={`ish-${k}`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
            <mask id={`hole-${k}`} maskUnits="userSpaceOnUse" x="0" y="0" width="252" height="352">
              <rect width="252" height="352" fill="#FFFFFF" />
              <path d={G.dial} fill="#000000" />
            </mask>
            <clipPath id={`dc-${k}`}>
              <path d={G.dial} />
            </clipPath>
          </defs>

          <g mask={u('hole')}>
            <rect width="252" height="352" fill={th.box} />
            <rect width="252" height="352" filter={u('pebble')} opacity="0.07" />
            <rect width="252" height="352" filter={u('leather')} opacity="0.5" />
            <rect width="252" height="352" fill={u('spot')} />
            <rect
              x="7.5"
              y="7.5"
              width="237"
              height="337"
              rx="10"
              fill="none"
              stroke="#000000"
              strokeOpacity="0.5"
              strokeWidth="0.9"
              strokeDasharray="2.6 1.7"
              transform="translate(0.4 0.7)"
            />
            <rect
              x="7.5"
              y="7.5"
              width="237"
              height="337"
              rx="10"
              fill="none"
              stroke={th.stitch}
              strokeWidth="0.8"
              strokeDasharray="2.6 1.7"
              strokeLinecap="round"
            />
            <path
              d={G.caseOuter}
              fill="#000000"
              opacity="0.6"
              filter={u('soft')}
              transform="translate(2 6)"
            />
            <path d="M236 171.4L241 171.4L241 180.6L236 180.6Z" fill={u('cr')} />
            <path d={G.crown} fill={u('cr')} />
            <path d={G.crownFlutes} stroke={th.bz3} strokeWidth="0.5" opacity="0.75" fill="none" />
            <path d={G.crownFlutesHi} stroke={th.bz0} strokeWidth="0.35" opacity="0.8" fill="none" />
            <path d={G.caseOuter} fill={u('cs')} />
            <path d={G.caseOuter} fill="none" stroke={th.bz3} strokeWidth="0.6" />
            <path d={G.caseBevel} fill={u('cb')} />
            <path d={G.caseFacet} fill={u('cs')} />
            <path d={G.caseFacet} fill="none" stroke={th.bz0} strokeWidth="0.45" opacity="0.9" />
            <path d={G.flange} fill={th.bz3} />
            <path
              d={G.caseHi}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.55"
              filter={u('hsh')}
            />
          </g>

          {!back && (
            <g clipPath={u('dc')}>
              <path
                d={G.dial}
                fill="none"
                stroke="#000000"
                strokeWidth="7"
                opacity="0.55"
                filter={u('ish')}
              />
              <g transform="translate(206 236)" fill="none" stroke={th.ink} strokeWidth="0.4" opacity="0.7">
                <path d="M0 -4 L3.5 -2 L3.5 2 L0 4 L-3.5 2 L-3.5 -2 Z" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  fontSize="2.8"
                  fontFamily="Belleza, sans-serif"
                  fill={th.ink}
                  stroke="none"
                >
                  WM
                </text>
              </g>
              {fv != null && (
                <>
                  <circle cx="126" cy="270" r="30" fill={th.sub} opacity="0.94" />
                  <circle cx="126" cy="270" r="30" fill="none" stroke={th.hand1} strokeWidth="1.2" />
                  <circle cx="126" cy="270" r="26.5" fill="none" stroke={th.subInk} strokeWidth="0.3" />
                  <path d={G.subTicks} stroke={th.subInk} strokeWidth="0.6" fill="none" />
                  <path
                    d={subArc(fv)}
                    stroke={th.hand1}
                    strokeWidth="2.2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </>
              )}
              <g transform="translate(1.2 2.4)" filter={u('hsh')} opacity="0.4">
                <path d={G.hour.all} fill="#000000" />
                <g className={live ? s.min : undefined}>
                  <path d={G.min.all} fill="#000000" />
                </g>
              </g>
              <path d={G.hour.L} fill={th.hand0} />
              <path d={G.hour.R} fill={th.hand1} />
              <g className={live ? s.min : undefined}>
                <path d={G.min.L} fill={th.hand0} />
                <path d={G.min.R} fill={th.hand1} />
              </g>
              <circle cx="126" cy="176" r="3.4" fill={th.hand1} />
              <circle cx="126" cy="176" r="2.2" fill={th.hand0} />
              <circle cx="125.4" cy="175.4" r="0.7" fill="#FFFFFF" opacity="0.7" />
              <rect width="252" height="352" fill={u('sheen')} />
            </g>
          )}

          {back && (
            <>
              <g clipPath={u('dc')}>
                <rect width="252" height="352" fill={u('pl')} />
                <path d={G.guilloche} fill="none" stroke={th.plText} strokeWidth="0.32" opacity="0.26" />
                <path
                  d={G.dial}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="6"
                  opacity="0.35"
                  filter={u('ish')}
                />
                <rect width="252" height="352" fill={u('sheen')} />
              </g>
              <g transform="translate(126 296)" fill="none" stroke={th.plText} strokeWidth="0.5">
                <path d="M0 -6 L5.2 -3 L5.2 3 L0 6 L-5.2 3 L-5.2 -3 Z" />
                <text
                  x="0"
                  y="1.6"
                  textAnchor="middle"
                  fontSize="4.2"
                  fontFamily="Belleza, sans-serif"
                  fill={th.plText}
                  stroke="none"
                >
                  WM
                </text>
              </g>
            </>
          )}
        </svg>

        {!back && (
          <>
            <div
              style={{
                ...abs,
                left: 40,
                right: 40,
                top: 50,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                textAlign: 'center',
                fontFamily: "Belleza, 'Gill Sans', sans-serif",
                textShadow: th.halo,
              }}
            >
              <span style={{ fontSize: 8, letterSpacing: '0.28em', paddingLeft: '0.28em' }}>
                WRISTMASTERS
              </span>
              <span style={{ fontSize: 4.6, letterSpacing: '0.5em', paddingLeft: '0.5em', opacity: 0.9 }}>
                {t('series', { type: typeLabel.toLocaleUpperCase(i18n.language) })}
              </span>
            </div>
            {fv == null ? (
              <>
                <span
                  style={{
                    ...abs,
                    left: 150,
                    top: 252,
                    transform: 'rotate(-7deg)',
                    transformOrigin: 'left center',
                    fontFamily: "'Pinyon Script', cursive",
                    fontSize: 11,
                    lineHeight: 1,
                    color: th.inkB,
                    textShadow: th.haloB,
                  }}
                >
                  {rarityLabel}
                </span>
                <div
                  style={{
                    ...abs,
                    left: 36,
                    right: 36,
                    top: 272,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    textAlign: 'center',
                    color: th.inkB,
                    textShadow: th.haloB,
                  }}
                >
                  <span style={{ fontSize: capSize, lineHeight: 1.05, textWrap: 'balance' }}>
                    {c.caption}
                  </span>
                  {c.dialPlace && (
                    <span style={{ fontStyle: 'italic', fontSize: 8.6, fontVariantNumeric: 'oldstyle-nums' }}>
                      {c.dialPlace}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <span
                  style={{
                    ...abs,
                    left: 96,
                    width: 60,
                    top: 254,
                    textAlign: 'center',
                    fontSize: 30,
                    lineHeight: 1,
                    color: th.subInk,
                  }}
                >
                  {fv}
                </span>
                <span
                  style={{
                    ...abs,
                    left: 96,
                    width: 60,
                    top: 283,
                    textAlign: 'center',
                    fontFamily: 'Belleza, sans-serif',
                    fontSize: 4.4,
                    letterSpacing: '0.3em',
                    paddingLeft: '0.3em',
                    color: th.subInk,
                  }}
                >
                  {t(`criteria.${focus}`).toLocaleUpperCase(i18n.language)}
                </span>
              </>
            )}
          </>
        )}

        {back && (
          <div
            style={{
              ...abs,
              left: 44,
              right: 44,
              top: 58,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              textAlign: 'center',
              color: th.plText,
            }}
          >
            <span
              style={{
                fontFamily: 'Belleza, sans-serif',
                fontSize: 5.6,
                letterSpacing: '0.4em',
                paddingLeft: '0.4em',
              }}
            >
              N° {pad(c.number)} · {pad(c.total)}
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.1, textWrap: 'balance' }}>{c.name}</span>
            {byline && <span style={{ fontStyle: 'italic', fontSize: 9.5 }}>{byline}</span>}
            <div style={{ width: '100%', marginTop: 9, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CRITERIA.map((q) => (
                <div key={q} style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 10.5 }}>
                  <span>{t(`criteria.${q}`)}</span>
                  <span
                    style={{
                      flex: 1,
                      borderBottom: `0.5px dotted ${th.plText}`,
                      transform: 'translateY(-3px)',
                    }}
                  />
                  <span style={{ fontSize: 12.5 }}>{c.stats[q]}</span>
                </div>
              ))}
            </div>
            <span
              style={{ marginTop: 8, fontFamily: "'Pinyon Script', cursive", fontSize: 12, lineHeight: 1 }}
            >
              {rarityLabel}
            </span>
            <span style={{ fontSize: 6.5, opacity: 0.85 }}>
              {c.dialPlace ? t('credit', { place: c.dialPlace }) : t('creditText')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Carte qui prend la largeur de son conteneur (grilles fluides). */
export function FluidCard(props: Omit<CardProps, 'width'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: '100%', aspectRatio: '252 / 352' }}>
      {w > 0 && <Card {...props} width={w} />}
    </div>
  );
}

/** Dos de booster : carte face cachée avant révélation (design/Remontage.dc.html). */
export function BoosterBack({ width = 252 }: { width?: number }) {
  return (
    <svg
      width={width}
      height={(width * 352) / 252}
      viewBox="0 0 252 352"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect width="252" height="352" fill="#121114" />
      <path d={BACK_RAYS} stroke="#C9A24A" strokeWidth="0.6" opacity="0.55" />
      <rect x="6" y="6" width="240" height="340" fill="none" stroke="#C9A24A" strokeWidth="0.9" />
      <rect x="10" y="10" width="232" height="332" fill="none" stroke="#C9A24A" strokeWidth="0.4" />
      <circle cx="126" cy="176" r="46" fill="#121114" stroke="#C9A24A" strokeWidth="1" />
      <circle cx="126" cy="176" r="40" fill="none" stroke="#C9A24A" strokeWidth="0.5" />
      <text
        x="126"
        y="187"
        textAnchor="middle"
        fontFamily="Big Shoulders, Arial Narrow, sans-serif"
        fontWeight="900"
        fontSize="30"
        fill="#C9A24A"
      >
        WM
      </text>
    </svg>
  );
}
