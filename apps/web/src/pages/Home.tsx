// Accueil (design/Main.dc.html) : une action, remonter sa première montre.
import { useEffect } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '@wm/card-render';
import { BOOSTER_MAX, BOOSTER_ODDS } from '@wm/shared';
import { buttonClass, Marquee, SectionLabel, StepTimer } from '@wm/ui';
import { api, langOf, useMe } from '../api';
import { CrownSvg } from '../Crown';
import s from './home.module.css';

const RARE = ['echappement', 'chronometre', 'spiral', 'quantieme', 'tourbillon'];

export function Home() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const me = useMe();
  const cards = useQueries({
    queries: RARE.map((slug) => ({ queryKey: ['card', lang, slug], queryFn: () => api.card(lang, slug) })),
  });
  const total = useQuery({
    queryKey: ['cards', lang, {}],
    queryFn: () => api.cards(lang, {}, 0),
    select: (d) => d.total,
  });
  const [, , spiral, quantieme, tourbillon] = cards.map((c) => c.data);
  const stock = me.data?.stock ?? 3;
  const first = !me.data?.boostersOpened;
  const steps = t('home.steps', { returnObjects: true }) as { title: string; text: string }[];
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <>
      <Marquee text={t('home.marquee')} />
      <section className={`wm-wrap ${s.hero}`} aria-labelledby="hero-title">
        <div className={s.heroText}>
          <p className="wm-mono">({t('home.kicker')})</p>
          <h1 id="hero-title" className={`wm-serif ${s.h1}`}>
            {t('home.title')}
          </h1>
          <p className={`wm-muted ${s.lead}`}>{t('home.lead', { n: total.data ?? '…' })}</p>
          <div className={s.ctas}>
            <Link to="/remonter" className={buttonClass('primary', true)}>
              {first ? t('nav2.windFirst') : t('nav2.wind')} <span aria-hidden="true">→</span>
            </Link>
            <a href="#comment" className={buttonClass('secondary', true)}>
              {t('nav2.how')}
            </a>
          </div>
          <p className="wm-mono wm-muted">{t('home.free')}</p>
        </div>
        <div className={s.heroCards}>
          {spiral && (
            <div className={s.c1}>
              <Card card={spiral} eager />
            </div>
          )}
          {quantieme && (
            <div className={s.c2}>
              <Card card={quantieme} eager />
            </div>
          )}
          {tourbillon && (
            <div className={s.c3}>
              <Card card={tourbillon} live eager />
            </div>
          )}
          <Link to="/remonter" className={s.crown}>
            <span className="wm-sr">{t('home.crownLabel')}</span>
            <span className={s.crownSpin}>
              <CrownSvg size={140} />
            </span>
            <span className="wm-mono">({t('home.crown')})</span>
          </Link>
        </div>
      </section>

      <section className={s.drop} aria-labelledby="drop-title">
        <div className={`wm-wrap ${s.dropRow}`}>
          <div className={s.dropCol}>
            <h2 id="drop-title" className="wm-mono">
              ({t('home.next')})
            </h2>
            {me.data?.nextAt && stock < BOOSTER_MAX ? (
              <StepTimer
                to={Date.parse(me.data.nextAt)}
                className={s.timer}
                onDone={() => void me.refetch()}
              />
            ) : (
              <p className={`wm-mono ${s.timer}`}>{t('home.ready')}</p>
            )}
          </div>
          <p className={`wm-muted ${s.dropText}`}>{t('home.stockText')}</p>
          <div className={s.dropCol}>
            <span className="wm-mono">{t('home.stock', { n: stock })}</span>
            <div className={s.stock} aria-hidden="true">
              {Array.from({ length: BOOSTER_MAX }, (_, i) => (
                <span key={i} data-on={i < stock} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="comment" className={`wm-wrap ${s.how}`} aria-labelledby="how-title">
        <div className={s.howHead}>
          <h2 id="how-title" className={`wm-display ${s.h2}`}>
            {t('home.howTitle')}
          </h2>
          <SectionLabel count={1} total={4}>
            {t('nav2.how')}
          </SectionLabel>
        </div>
        <ol className={s.steps}>
          {steps.map((st, i) => (
            <li key={st.title}>
              <span className={s.n}>{String(i + 1).padStart(2, '0')}</span>
              <h3 className="wm-serif">{st.title}</h3>
              <p className="wm-muted">{st.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wm-night" aria-labelledby="rare-title">
        <div className={`wm-wrap ${s.rare}`}>
          <div className={s.howHead}>
            <h2 id="rare-title" className={`wm-display ${s.h2}`}>
              {t('home.rareTitle')}
            </h2>
            <p className={`wm-muted ${s.rareText}`}>{t('home.rareText')}</p>
          </div>
          <div className={s.tiers}>
            {cards.map(({ data: c }, i) =>
              c ? (
                <figure key={c.slug} className={s.tier}>
                  <Card card={c} />
                  <figcaption className="wm-mono">
                    <span>{t(`card:rarity.${c.rarity}`)}</span>
                    <span className="wm-muted">
                      {t('home.odds', { rate: `${Math.round(BOOSTER_ODDS[c.rarity] * 100)} %` })}
                    </span>
                  </figcaption>
                </figure>
              ) : (
                <div key={i} className={s.tierSlot} />
              ),
            )}
          </div>
        </div>
      </section>

      <section className={`wm-wrap ${s.duel}`} aria-labelledby="duel-title">
        <h2 id="duel-title" className={`wm-display ${s.duelTitle}`}>
          {t('home.duelTitle')}
        </h2>
        <div className={s.duelText}>
          <p className="wm-mono">({t('nav2.duel')})</p>
          <p className={s.lead}>{t('home.duelText')}</p>
          <p className="wm-muted">{t('home.duelMore')}</p>
          <span className={`${buttonClass('secondary', true)} ${s.soon}`} aria-disabled="true">
            {t('home.duelSoon')}
          </span>
        </div>
      </section>
    </>
  );
}
