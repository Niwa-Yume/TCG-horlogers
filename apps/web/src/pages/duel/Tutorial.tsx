// Duel d'entraînement scénarisé (premier contact) : le moteur tourne dans le navigateur,
// main et critères fixés, automate sans minuteur. Tes cinq cartes phares contre cinq Gravures.
import { useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { botChoice, init, step, viewFor, type Criterion, type DuelEvent, type DuelState } from '@wm/engine';
import { rarityRank, seededRandom, type CardView, type DuelPayload } from '@wm/shared';
import { Button, buttonClass, StateBox } from '@wm/ui';
import { api, langOf } from '../../api';
import { once, track } from '../../track';
import { DuelTable } from './DuelTable';
import s from './duel.module.css';

const MINE = ['echappement', 'chronometre', 'spiral', 'quantieme', 'tourbillon'];
const CRITERIA: Criterion[] = [
  'complication',
  'precision',
  'innovation',
  'prestige',
  'heritage',
  'complication',
  'precision',
];
const PAUSE = 2_500;

export default function Tutorial() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const mine = useQueries({
    queries: MINE.map((slug) => ({ queryKey: ['card', lang, slug], queryFn: () => api.card(lang, slug) })),
  });
  const theirs = useQuery({
    queryKey: ['cards', lang, { rarity: 'GRAVURE' }],
    queryFn: () => api.cards(lang, { rarity: 'GRAVURE' }, 0),
  });
  const [game, setGame] = useState<{
    state: DuelState;
    events: DuelEvent[];
    pauseUntil: number | null;
  } | null>(null);
  const bot = useRef<ReturnType<typeof setTimeout>>(undefined);

  const myCards = mine.map((q) => q.data).filter((c): c is NonNullable<typeof c> => !!c);
  const botCards = theirs.data?.items.slice(0, 5) ?? [];
  const all = new Map<string, CardView>([...myCards, ...botCards].map((c) => [c.slug, c]));

  const start = () => {
    const r = init({
      seed: 'tutoriel',
      cards: Object.fromEntries(
        [...all.values()].map((c) => [
          c.slug,
          { id: c.slug, stats: c.stats, rarity: rarityRank(c.rarity), questions: [] },
        ]),
      ),
      decks: [myCards.map((c) => c.slug), botCards.map((c) => c.slug)],
      script: { criteria: CRITERIA, noShuffle: true },
    });
    setGame({ ...r, pauseUntil: null });
  };

  const apply = (prev: DuelState, action: Parameters<typeof step>[1]) => {
    const r = step(prev, action);
    if (r.events[0]?.type === 'error') return;
    setGame({ ...r, pauseUntil: r.events.some((e) => e.type === 'reveal') ? Date.now() + PAUSE : null });
    if (r.state.phase === 'over')
      once('wm-tutorial-done', () => track('tutorial_duel_finished', { won: r.state.winner === 0 }));
  };

  // l'automate choisit après le joueur, sans se presser
  useEffect(() => {
    const st = game?.state;
    if (!st || st.phase !== 'choose' || !st.players[0].pick || st.players[1].pick) return;
    const p = st.players[1];
    const pick = botChoice(
      p.hand,
      p.reserve,
      st.players.some((x) => x.score === 2),
      st.cfg.cards,
      st.criterion,
      seededRandom(`tuto:${st.turn}`),
    );
    bot.current = setTimeout(() => apply(st, { type: 'choose', seat: 1, ...pick }), 900);
    return () => clearTimeout(bot.current);
  }, [game]);

  const loading = mine.some((q) => q.isPending) || theirs.isPending;
  if (!loading && (myCards.length < 5 || botCards.length < 5))
    return (
      <div className={s.page}>
        <StateBox
          title={t('catalogue.errorTitle')}
          action={<Button onClick={() => location.reload()}>{t('catalogue.retry')}</Button>}
        />
      </div>
    );

  // l'introduction s'affiche tout de suite ; le bouton attend les cartes
  if (!game)
    return (
      <div className={s.page}>
        <div className={s.lobbyHead}>
          <h1 className="wm-display">{t('duel.tuto.title')}</h1>
        </div>
        <p>{t('duel.tuto.intro')}</p>
        <ul className={s.rules}>
          {(t('duel.rules', { returnObjects: true }) as string[]).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <Button variant="primary" big disabled={loading} onClick={start}>
          {loading ? t('ui:loading') : t('duel.tuto.start')}
        </Button>
      </div>
    );

  const st = game.state;
  const v = viewFor(st, 0);
  const info = (name: string) => ({ name, rating: 1000, bot: true, connected: true, reconnectBy: null });
  const payload: DuelPayload = {
    id: 'tutoriel',
    ranked: false,
    view: v,
    deadline: null,
    pauseUntil: game.pauseUntil ? new Date(game.pauseUntil).toISOString() : null,
    me: info(t('duel.you')),
    opponent: info(t('duel.tuto.bot')),
    cards: Object.fromEntries([...all].filter(([id]) => id)),
    question: null,
    events: game.events,
    result: { ratingDelta: 0, rubis: 0 },
  };
  const hints = t('duel.tuto.hints', {
    returnObjects: true,
    criterion: t(`card:criteria.${st.criterion}`),
  }) as string[];

  return (
    <div className={s.page}>
      <DuelTable
        p={payload}
        hint={hints[Math.min(st.turn, hints.length - 1)]}
        onChoose={(card, notches) => apply(st, { type: 'choose', seat: 0, card, notches })}
        onAnswer={(index) => apply(st, { type: 'answer', seat: 0, index })}
        end={
          <div className={s.actions}>
            <Link to="/duel" className={buttonClass('primary', true)}>
              {t('duel.tuto.real')} →
            </Link>
            <Button big onClick={start}>
              {t('duel.again')}
            </Button>
          </div>
        }
      />
    </div>
  );
}
