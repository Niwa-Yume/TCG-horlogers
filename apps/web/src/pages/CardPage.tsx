import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card, Loupe } from '@wm/card-render';
import { BOOSTER_ODDS } from '@wm/shared';
import { Balance, Button, StateBox } from '@wm/ui';
import { api, HttpError, langOf, shareLink } from '../api';
import s from './card.module.css';

export function CardPage() {
  const { slug = '' } = useParams();
  const learn = useSearchParams()[0].get('apprendre') === '1';
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const q = useQuery({ queryKey: ['card', lang, slug], queryFn: () => api.card(lang, slug) });
  const [found, setFound] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [back, setBack] = useState(false);
  const [note, setNote] = useState('');
  const width = Math.min(320, typeof window === 'undefined' ? 320 : window.innerWidth - 40);

  useEffect(() => {
    if (q.data) document.title = `${q.data.name} — WristMasters TCG`;
  }, [q.data]);

  if (q.isPending) return <Balance />;
  if (q.isError)
    return (
      <div className={`wm-wrap ${s.page}`}>
        {q.error instanceof HttpError && q.error.status === 404 ? (
          <StateBox title={t('card.notFoundTitle')} action={<Link to="/catalogue">{t('card.back')}</Link>}>
            {t('card.notFoundText')}
          </StateBox>
        ) : (
          <StateBox
            title={t('catalogue.errorTitle')}
            action={<Button onClick={() => q.refetch()}>{t('catalogue.retry')}</Button>}
          />
        )}
      </div>
    );

  const c = q.data;
  const rarity = t(`card:rarity.${c.rarity}`);
  const share = async () => {
    if (await shareLink(c.name, `${location.origin}/partage/c/${c.slug}?lang=${lang}`))
      setNote(t('card.copied'));
  };

  return (
    <div className={`wm-wrap ${s.page}`}>
      <div className={s.bar}>
        <Link to="/catalogue" aria-label={t('card.back')} className={s.backLink}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="wm-mono">
          ({t('card.loupe')}) {c.name}
        </h1>
        <span className="wm-mono">×2,4</span>
      </div>

      <div className={s.layout}>
        <div className={s.stage}>
          <p className={`${learn && !found ? s.learn : 'wm-muted'} ${s.hint}`}>
            {learn && !found ? t('learn') : t('card.hint')}
          </p>
          {back ? (
            <Card card={c} face="back" width={width} eager />
          ) : (
            <Loupe card={c} width={width} pinned={pinned} onFound={() => setFound(true)} />
          )}
          <Button onClick={() => setBack(!back)} aria-pressed={back}>
            {back ? t('card.front') : t('card.backFace')}
          </Button>
        </div>

        <div className={s.text}>
          {c.anecdote ? (
            found ? (
              <div className={s.found}>
                <span className="wm-mono">({t('card.found')})</span>
                <p className="wm-serif">{c.anecdote}</p>
              </div>
            ) : (
              <div className={s.hidden}>
                <span>{t('card.hidden')}</span>
                <Button
                  onClick={() => {
                    setBack(false);
                    setPinned(true);
                    setFound(true);
                  }}
                >
                  {t('card.show')}
                </Button>
              </div>
            )
          ) : (
            <p className="wm-muted">{t('card.noAnecdote')}</p>
          )}
          <p className={s.summary}>{c.summary}</p>
          <p className="wm-mono wm-muted">
            {t('card.source', { license: c.license })}{' '}
            {c.sourceUrl && (
              <a href={c.sourceUrl} rel="noopener" target="_blank">
                {t('card.sourceLink')}
              </a>
            )}
          </p>
          <p className="wm-mono wm-muted">
            {t('card.odds', { rarity, rate: `${Math.round(BOOSTER_ODDS[c.rarity] * 100)} %` })}
          </p>
          <div className={s.actions}>
            <Button variant="primary" big onClick={share}>
              {t('card.share')}
            </Button>
            <span role="status" className="wm-mono">
              {note}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
