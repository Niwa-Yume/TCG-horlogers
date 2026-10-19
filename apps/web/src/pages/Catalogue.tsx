import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FluidCard } from '@wm/card-render';
import { RARITIES } from '@wm/shared';
import { Balance, Button, Chip, Marquee, SectionLabel, StateBox } from '@wm/ui';
import { api, langOf } from '../api';
import s from './catalogue.module.css';

const TYPES = ['WATCHMAKER', 'MAISON', 'MODEL', 'INVENTION', 'COMPLICATION'] as const;

export function Catalogue() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const [params, setParams] = useSearchParams();
  const filters = {
    type: params.get('type') ?? undefined,
    rarity: params.get('rarity') ?? undefined,
    q: params.get('q') ?? undefined,
  };
  const set = (k: string, v?: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const query = useInfiniteQuery({
    queryKey: ['cards', lang, filters],
    queryFn: ({ pageParam }) => api.cards(lang, filters, pageParam),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    getNextPageParam: (last, pages) => {
      const n = pages.reduce((a, p) => a + p.items.length, 0);
      return n < last.total ? n : undefined;
    },
  });
  const cards = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const catalogue = cards[0]?.total ?? total;

  return (
    <>
      <Marquee text={t('catalogue.marquee')} />
      <section className={`wm-wrap ${s.head}`} aria-labelledby="cat-title">
        <SectionLabel count={total} total={catalogue}>
          {t('catalogue.label')}
        </SectionLabel>
        <h1 id="cat-title" className={`wm-display ${s.title}`}>
          {t('catalogue.title')}
        </h1>
        <p className={`wm-muted ${s.intro}`}>{t('catalogue.intro')}</p>
      </section>

      <div className={`wm-wrap ${s.filters}`}>
        <div role="group" aria-label={t('catalogue.typeFilter')} className={s.chips}>
          <Chip pressed={!filters.type} onClick={() => set('type')}>
            {t('catalogue.all')}
          </Chip>
          {TYPES.map((ty) => (
            <Chip key={ty} pressed={filters.type === ty} onClick={() => set('type', ty)}>
              {t(`catalogue.types.${ty}`)}
            </Chip>
          ))}
        </div>
        <div className={s.row}>
          <label className={s.field}>
            <span className="wm-mono">{t('catalogue.rarityFilter')}</span>
            <select value={filters.rarity ?? ''} onChange={(e) => set('rarity', e.target.value || undefined)}>
              <option value="">{t('catalogue.allRarities')}</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {t(`card:rarity.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span className="wm-mono">{t('catalogue.search')}</span>
            <input
              type="search"
              defaultValue={filters.q}
              onChange={(e) => set('q', e.target.value.trim() || undefined)}
            />
          </label>
        </div>
      </div>

      <section className="wm-wrap" aria-live="polite" aria-busy={query.isPending}>
        {query.isPending ? (
          <Balance />
        ) : query.isError ? (
          <StateBox
            title={t('catalogue.errorTitle')}
            action={<Button onClick={() => query.refetch()}>{t('catalogue.retry')}</Button>}
          >
            {t('catalogue.errorText')}
          </StateBox>
        ) : cards.length === 0 ? (
          <StateBox
            title={t('catalogue.emptyTitle')}
            action={<Button onClick={() => setParams({}, { replace: true })}>{t('catalogue.reset')}</Button>}
          >
            {t('catalogue.emptyText')}
          </StateBox>
        ) : (
          <>
            <ul className={`wm-grid ${s.grid}`}>
              {cards.map((c, i) => (
                <li key={c.slug} className={s.item}>
                  <Link to={`/carte/${c.slug}`} className={s.link}>
                    <FluidCard card={c} eager={i < 6} />
                    <span className={`wm-mono ${s.caption}`}>
                      <span>{t(`card:rarity.${c.rarity}`)}</span>
                      <span className="wm-muted">
                        {t('catalogue.serial', { n: String(c.number).padStart(4, '0') })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <div className={s.more}>
                {query.isFetchingNextPage ? (
                  <Balance />
                ) : (
                  <Button big onClick={() => query.fetchNextPage()}>
                    {t('catalogue.more')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
