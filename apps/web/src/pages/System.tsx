// Vitrine du design system (composants de packages/ui) et des cinq raretés (design/Raretes.dc.html).
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BoosterBack, Card } from '@wm/card-render';
import { BOOSTER_ODDS } from '@wm/shared';
import { Balance, Button, buttonClass, Chip, Marquee, SectionLabel, sound, SOUNDS, StepTimer } from '@wm/ui';
import { api, langOf } from '../api';
import s from './system.module.css';

const FLAGSHIPS = ['echappement', 'chronometre', 'spiral', 'quantieme', 'tourbillon'];

export function System() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const cards = useQueries({
    queries: FLAGSHIPS.map((slug) => ({
      queryKey: ['card', lang, slug],
      queryFn: () => api.card(lang, slug),
    })),
  });
  const [until] = useState(() => Date.now() + 6 * 60_000 + 42_000);
  const [chip, setChip] = useState(true);
  const loaded = cards.every((c) => c.data);

  return (
    <>
      <Marquee text={t('system.marquee')} />
      <section className={`wm-wrap ${s.block}`}>
        <SectionLabel count={1} total={4}>
          {t('system.label')}
        </SectionLabel>
        <h1 className={`wm-display ${s.title}`}>{t('system.title')}</h1>
      </section>

      <section className={`wm-wrap wm-grid ${s.kit}`}>
        <div className={s.cell}>
          <h2 className="wm-mono">({t('system.buttons')})</h2>
          <a href="#raretes" className={buttonClass('primary', true)}>
            {t('system.primary')} <span aria-hidden="true">→</span>
          </a>
          <Button big>{t('system.secondary')}</Button>
          <div className={s.row}>
            <Chip pressed={chip} onClick={() => setChip(true)}>
              {t('catalogue.all')}
            </Chip>
            <Chip pressed={!chip} onClick={() => setChip(false)}>
              {t('catalogue.types.MAISON')}
            </Chip>
          </div>
        </div>
        <div className={s.cell}>
          <h2 className="wm-mono">({t('system.timer')})</h2>
          <StepTimer to={until} className={s.timer} />
        </div>
        <div className={s.cell}>
          <h2 className="wm-mono">({t('system.loader')})</h2>
          <Balance />
        </div>
        <div className={s.cell}>
          <h2 className="wm-mono">({t('system.sounds')})</h2>
          <div className={s.row}>
            {SOUNDS.map((n) => (
              <Chip key={n} pressed={false} onClick={() => sound.play(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className={`wm-wrap ${s.block}`}>
        <h2 className="wm-mono">({t('system.card')})</h2>
        {loaded ? (
          <div className={s.cards}>
            <Card card={cards[4]!.data!} live eager />
            <Card card={cards[4]!.data!} face="back" eager />
            <figure className={s.fig}>
              <Card card={cards[3]!.data!} focus="complication" eager />
              <figcaption className="wm-mono">{t('system.focus')}</figcaption>
            </figure>
            <BoosterBack />
          </div>
        ) : (
          <Balance />
        )}
      </section>

      <section id="raretes" className="wm-night" aria-labelledby="rare-title">
        <div className={`wm-wrap ${s.night}`}>
          <div className={s.nightHead}>
            <h2 id="rare-title" className={`wm-display ${s.title}`}>
              {t('rarities.title')}
            </h2>
            <p className="wm-muted">{t('rarities.text')}</p>
          </div>
          {loaded ? (
            <div className={s.tiers}>
              {cards.map(({ data: c }) => (
                <figure key={c!.slug} className={s.tier}>
                  <Card card={c!} eager />
                  <figcaption>
                    <span className={`wm-mono ${s.tierLine}`}>
                      <span>{t(`card:rarity.${c!.rarity}`)}</span>
                      <span className="wm-muted">{Math.round(BOOSTER_ODDS[c!.rarity] * 100)} %</span>
                    </span>
                    <span className="wm-muted">{t(`rarities.desc.${c!.rarity}`)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <Balance />
          )}
        </div>
      </section>
    </>
  );
}
