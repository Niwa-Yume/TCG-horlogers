// Duel en direct : salle d'attente, file, partie. Socket.IO n'est chargé que sur cette page.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { io, type Socket } from 'socket.io-client';
import { FluidCard } from '@wm/card-render';
import type { CardView, DuelPayload } from '@wm/shared';
import { Balance, Button, buttonClass, SectionLabel, StateBox, StepTimer } from '@wm/ui';
import { langOf, shareLink } from '../../api';
import { DuelTable } from './DuelTable';
import s from './duel.module.css';

type Status = 'connecting' | 'idle' | 'waiting' | 'playing' | 'error';

function useDuel(enabled: boolean, lang: string) {
  const [status, setStatus] = useState<Status>('connecting');
  const [online, setOnline] = useState(true);
  const [payload, setPayload] = useState<DuelPayload | null>(null);
  const [botAt, setBotAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState<{ index: number; at: number } | null>(null);
  const sock = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const s = io({ path: '/api/socket.io', query: { lang } });
    sock.current = s;
    s.on('connect', () => setOnline(true));
    s.on('disconnect', () => setOnline(false));
    s.on('duel:idle', () => setStatus((x) => (x === 'waiting' ? x : 'idle')));
    s.on('queue:waiting', (w: { botAt: string }) => (setBotAt(w.botAt), setStatus('waiting')));
    s.on('duel:state', (p: DuelPayload) => (setPayload(p), setStatus('playing')));
    s.on('duel:reaction', (r: { index: number }) => setReaction({ index: r.index, at: Date.now() }));
    s.on('duel:error', (e: { code: string }) => {
      setError(e.code);
      setStatus((x) => (x === 'playing' ? x : 'error'));
    });
    return () => void s.close();
  }, [enabled, lang]);

  const emit = (ev: string, data?: unknown) => sock.current?.emit(ev, data);
  return {
    status,
    online,
    payload,
    botAt,
    error,
    reaction,
    join: (bot: boolean) => (
      setError(null),
      setPayload(null),
      setStatus(bot ? 'connecting' : 'waiting'),
      emit('queue:join', { bot })
    ),
    leave: () => (emit('queue:leave'), setStatus('idle')),
    choose: (card: string, notches: number) => emit('duel:choose', { card, notches }),
    answer: (index: number) => emit('duel:answer', { index }),
    react: (index: number) => emit('duel:react', { index }),
    forfeit: () => emit('duel:forfeit'),
    reset: () => (setPayload(null), setStatus('idle')),
  };
}

export default function DuelPage() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const qc = useQueryClient();
  const deck = useQuery({
    queryKey: ['duel-deck', lang],
    queryFn: async () =>
      (await fetch(`/api/duel/deck?lang=${lang}`)).json() as Promise<{
        cards: CardView[];
        min: number;
        rating: number;
      }>,
  });
  const board = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () =>
      (await fetch('/api/duel/leaderboard')).json() as Promise<{ name: string; rating: number }[]>,
  });
  const ready = !!deck.data && deck.data.cards.length >= deck.data.min;
  const d = useDuel(ready, lang);
  const [note, setNote] = useState('');

  // partie finie : Elo, Rubis et classement ont bougé
  const over = d.payload?.view.phase === 'over';
  useEffect(() => {
    if (over)
      void qc
        .invalidateQueries({ queryKey: ['me'] })
        .then(() => qc.invalidateQueries({ queryKey: ['leaderboard'] }));
  }, [over, qc]);

  if (deck.isPending) return <Balance />;

  if (d.status === 'playing' && d.payload) {
    const p = d.payload;
    const won = p.view.winner === p.view.seat;
    return (
      <div className={s.page}>
        {!d.online && (
          <p role="status" className={`wm-mono ${s.banner}`}>
            {t('duel.offline')}
          </p>
        )}
        <DuelTable
          p={p}
          onChoose={d.choose}
          onAnswer={d.answer}
          onReact={d.react}
          onForfeit={d.forfeit}
          reaction={d.reaction}
          end={
            <div className={s.actions}>
              <Button variant="primary" big onClick={() => d.join(false)}>
                {t('duel.again')}
              </Button>
              {won && (
                <Button
                  big
                  onClick={async () => {
                    if (
                      await shareLink(
                        t('duel.shareText', { me: p.view.me.score, op: p.view.opponent.score }),
                        `${location.origin}/duel`,
                      )
                    )
                      setNote(t('duel.copied'));
                  }}
                >
                  {t('duel.share')}
                </Button>
              )}
              <Link to="/collection" className={buttonClass('quiet')}>
                {t('duel.album')}
              </Link>
              <span role="status" className="wm-mono">
                {note}
              </span>
            </div>
          }
        />
      </div>
    );
  }

  const cards = deck.data?.cards ?? [];
  return (
    <div className={s.page}>
      <div className={s.lobbyHead}>
        <SectionLabel>{t('duel.label')}</SectionLabel>
        <h1 className="wm-display">{t('duel.title')}</h1>
        <p className="wm-mono">{t('duel.tagline')}</p>
      </div>
      <ul className={s.rules}>
        {(t('duel.rules', { returnObjects: true }) as string[]).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {!ready ? (
        <StateBox
          title={t('duel.notEnough', { min: deck.data?.min ?? 5 })}
          action={
            <div className={s.actions}>
              <Link to="/remonter" className={buttonClass('primary')}>
                {t('nav2.wind')} →
              </Link>
              <Link to="/duel/tutoriel" className={buttonClass('secondary')}>
                {t('duel.tutorial')}
              </Link>
            </div>
          }
        >
          {t('duel.notEnoughText', { n: cards.length })}
        </StateBox>
      ) : d.status === 'waiting' ? (
        <div className={s.actions} aria-live="polite">
          <Balance label={t('duel.waiting')} />
          {d.botAt && (
            <p className="wm-mono">
              {t('duel.botIn')} <StepTimer to={Date.parse(d.botAt)} />
            </p>
          )}
          <Button onClick={d.leave}>{t('duel.cancel')}</Button>
        </div>
      ) : (
        <>
          {d.error && (
            <p role="alert" className={s.banner}>
              {t(`duel.errors.${d.error}`, { defaultValue: t('duel.error') })}
            </p>
          )}
          <div className={s.actions}>
            <Button variant="primary" big disabled={d.status === 'connecting'} onClick={() => d.join(false)}>
              {t('duel.find')}
            </Button>
            <Button big disabled={d.status === 'connecting'} onClick={() => d.join(true)}>
              {t('duel.vsBot')}
            </Button>
            <Link to="/duel/tutoriel" className={buttonClass('quiet')}>
              {t('duel.tutorial')}
            </Link>
          </div>
        </>
      )}

      {cards.length > 0 && (
        <section aria-label={t('duel.deck')}>
          <SectionLabel as="h2" count={cards.length} total={10}>
            {t('duel.deck')}
          </SectionLabel>
          <p className="wm-muted">
            {t('duel.deckNote')} {t('duel.elo', { n: deck.data!.rating })}
          </p>
          <ul className={s.deck}>
            {cards.map((c) => (
              <li key={c.slug}>
                <Link to={`/carte/${c.slug}`} aria-label={c.name}>
                  <FluidCard card={c} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!board.data?.length && (
        <section aria-label={t('duel.leaderboard')}>
          <SectionLabel as="h2">{t('duel.leaderboard')}</SectionLabel>
          <ol className={s.board}>
            {board.data.map((b, i) => (
              <li key={i} className="wm-mono">
                <span>
                  {String(i + 1).padStart(2, '0')} · {b.name}
                </span>
                <span>{b.rating}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
