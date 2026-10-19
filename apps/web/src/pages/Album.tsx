// L'établi (design/Album.dc.html) : cartes possédées par type ou par époque, doublons recyclés en Rubis.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FluidCard } from '@wm/card-render';
import { centuryOf, DAILY_RUBIS, RECYCLE_RUBIS, type CardType, type CollectionView } from '@wm/shared';
import { Balance, Button, buttonClass, Chip, SectionLabel, StateBox } from '@wm/ui';
import { api, langOf, useMe } from '../api';
import { once, track } from '../track';
import s from './album.module.css';

const TYPES: CardType[] = ['WATCHMAKER', 'MAISON', 'MODEL', 'INVENTION', 'COMPLICATION', 'EVENT'];
const ROMAN = [
  '',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
  'XVII',
  'XVIII',
  'XIX',
  'XX',
  'XXI',
];
const ordinal = (n: number) =>
  n +
  (n % 10 === 1 && n !== 11
    ? 'st'
    : n % 10 === 2 && n !== 12
      ? 'nd'
      : n % 10 === 3 && n !== 13
        ? 'rd'
        : 'th');

export function Album() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const qc = useQueryClient();
  const me = useMe();
  const col = useQuery({ queryKey: ['collection', lang], queryFn: () => api.collection(lang) });
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<CardType | null>(null);
  const [era, setEra] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');

  const refresh = (m: Awaited<ReturnType<typeof api.me>>) => {
    qc.setQueryData(['me'], m);
    void qc.invalidateQueries({ queryKey: ['collection'] });
  };
  const recycle = useMutation({
    mutationFn: api.recycle,
    onSuccess: (d) => {
      refresh(d.me);
      setConfirm(false);
      setNote(t('album.recycled', { count: d.recycled, n: d.gained }));
    },
  });
  const daily = useMutation({
    mutationFn: api.daily,
    onSuccess: (d) => (refresh(d.me), setNote(t('album.dailyDone', { n: d.gained }))),
  });
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => qc.invalidateQueries() });

  const welcome = params.get('bienvenue') === '1';
  useEffect(() => {
    if (welcome && me.data && !me.data.isGuest && me.data.boostersOpened > 0)
      once('wm-signup-tracked', () => track('signup_after_first_booster'));
  }, [welcome, me.data]);

  if (me.isPending || col.isPending) return <Balance />;
  if (col.isError)
    return (
      <div className="wm-wrap">
        <StateBox
          title={t('catalogue.errorTitle')}
          action={<Button onClick={() => col.refetch()}>{t('catalogue.retry')}</Button>}
        />
      </div>
    );

  const m = me.data;
  const c = col.data;
  const dupes = c.owned.filter((o) => o.count > 1);
  const dupeCount = dupes.reduce((a, o) => a + o.count - 1, 0);
  const dupeGain = dupes.reduce((a, o) => a + (o.count - 1) * RECYCLE_RUBIS[o.card.rarity], 0);
  const visible = c.owned.filter((o) => !type || o.card.type === type);

  const sections = era
    ? Object.keys(c.byCentury)
        .map(Number)
        .sort((a, b) => (a || 99) - (b || 99))
        .map((k) => ({
          key: `e${k}`,
          title:
            k === 0
              ? t('album.unknownEra')
              : lang === 'fr'
                ? t('album.century', { roman: ROMAN[k] ?? k })
                : t('album.century', { ordinal: ordinal(k) }),
          total: c.byCentury[k] ?? 0,
          items: visible.filter((o) => centuryOf(o.card.year) === k),
        }))
    : TYPES.filter((ty) => c.byType[ty] && (!type || ty === type)).map((ty) => ({
        key: ty,
        title: t(`album.types.${ty}`),
        total: c.byType[ty] ?? 0,
        items: visible.filter((o) => o.card.type === ty),
      }));

  return (
    <div className={`wm-wrap ${s.page}`}>
      <div className={s.head}>
        <SectionLabel count={c.owned.length} total={c.catalogue}>
          {t('album.label')}
        </SectionLabel>
        {m?.exists && (
          <span className={`wm-mono ${s.rubis}`}>
            {t('album.rubis', { n: m.rubis.toLocaleString(lang) })}
          </span>
        )}
      </div>
      <h1 className={`wm-display ${s.title}`}>{t('album.title')}</h1>

      {welcome && m && !m.isGuest && (
        <p className={s.banner} role="status">
          {t('album.welcome', { name: m.displayName })}
        </p>
      )}
      {params.get('connexion') === 'echec' && (
        <p className={s.banner} role="alert">
          {t('album.loginFailed')}
        </p>
      )}

      {m?.exists && (
        <div className={s.account}>
          {m.isGuest ? (
            m.providers.length > 0 && (
              <>
                <span className="wm-muted">{t('album.guest')}</span>
                {m.providers.map((p) => (
                  <a key={p} href={`/api/auth/${p}`} className={buttonClass('secondary')}>
                    {t('album.with', { p: p === 'google' ? 'Google' : 'Discord' })}
                  </a>
                ))}
              </>
            )
          ) : (
            <>
              <span className="wm-mono">{t('album.signedIn', { name: m.displayName })}</span>
              <Button variant="quiet" onClick={() => (logout.mutate(), setParams({}, { replace: true }))}>
                {t('album.logout')}
              </Button>
            </>
          )}
        </div>
      )}

      {c.owned.length === 0 ? (
        <StateBox
          title={t('album.emptyTitle')}
          action={
            <Link to="/remonter" className={buttonClass('primary', true)}>
              {t('nav2.wind')} →
            </Link>
          }
        >
          {t('album.emptyText')}
        </StateBox>
      ) : (
        <>
          <div className={s.actions}>
            {m?.dailyAvailable && (
              <Button variant="primary" disabled={daily.isPending} onClick={() => daily.mutate()}>
                {t('album.daily', { n: DAILY_RUBIS })}
              </Button>
            )}
            {dupeCount > 0 &&
              (confirm ? (
                <div className={s.confirm} role="group">
                  <span>{t('album.recycleConfirm', { count: dupeCount, n: dupeGain })}</span>
                  <Button variant="primary" disabled={recycle.isPending} onClick={() => recycle.mutate()}>
                    {t('album.confirm')}
                  </Button>
                  <Button onClick={() => setConfirm(false)}>{t('album.cancel')}</Button>
                </div>
              ) : (
                <Button onClick={() => setConfirm(true)}>{t('album.recycle', { n: dupeGain })}</Button>
              ))}
            <span role="status" className="wm-mono">
              {note}
            </span>
          </div>

          <div className={s.chips} role="group" aria-label={t('catalogue.typeFilter')}>
            <Chip pressed={!type} onClick={() => setType(null)}>
              {t('catalogue.all')}
            </Chip>
            {TYPES.filter((ty) => c.byType[ty]).map((ty) => (
              <Chip key={ty} pressed={type === ty} onClick={() => setType(ty)}>
                {t(`album.types.${ty}`)}
              </Chip>
            ))}
          </div>
          <div className={s.chips} role="group" aria-label={t('album.grouping')}>
            <Chip pressed={!era} onClick={() => setEra(false)}>
              {t('album.byType')}
            </Chip>
            <Chip pressed={era} onClick={() => setEra(true)}>
              {t('album.byEra')}
            </Chip>
          </div>

          {sections.map((sec) => (
            <Section key={sec.key} title={sec.title} total={sec.total} items={sec.items} hideEmpty={!!type} />
          ))}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  total,
  items,
  hideEmpty,
}: {
  title: string;
  total: number;
  items: CollectionView['owned'];
  hideEmpty: boolean;
}) {
  const { t } = useTranslation();
  if (hideEmpty && !items.length) return null;
  const id = `sec-${title.replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={s.section}>
      <div className={s.secHead}>
        <h2 id={id} className="wm-serif">
          {title}
        </h2>
        <span className="wm-mono">
          {items.length} — {total}
        </span>
      </div>
      {total <= 40 ? (
        <div
          className={s.segments}
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {Array.from({ length: total }, (_, i) => (
            <span key={i} data-on={i < items.length} />
          ))}
        </div>
      ) : (
        <div className={s.bar} aria-hidden="true">
          <span style={{ width: `${(items.length / total) * 100}%` }} />
        </div>
      )}
      <ul className={s.grid}>
        {items.map((o) => (
          <li key={o.card.slug}>
            <Link to={`/carte/${o.card.slug}`} className={s.cardLink}>
              <FluidCard card={o.card} />
              {o.count > 1 && (
                <span className={`wm-mono ${s.count}`} aria-label={t('album.copies', { n: o.count })}>
                  ×{o.count}
                </span>
              )}
            </Link>
          </li>
        ))}
        {items.length < total && (
          <li className={s.unknown}>
            <span className={s.q}>?</span>
            <span className="wm-mono">
              {t('album.undiscovered', { n: total - items.length }).toUpperCase()}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
