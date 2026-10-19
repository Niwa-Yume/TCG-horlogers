// La table de duel (design/Duel.dc.html) : seul le critère en jeu s'affiche en grand sur les cartes.
// Sert au duel en direct comme au duel d'entraînement : elle ne fait qu'afficher un DuelPayload.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@wm/card-render';
import type { DuelEvent } from '@wm/engine';
import type { DuelPayload } from '@wm/shared';
import { Button, sound } from '@wm/ui';
import s from './duel.module.css';

type RoundMemo = {
  reveal: Extract<DuelEvent, { type: 'reveal' }>;
  end: Extract<DuelEvent, { type: 'roundEnd' }> | null;
  auto: boolean;
  answers: Partial<Record<0 | 1, boolean>>;
};

const fmt = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};

/** Horloge par crans : un rendu par quart de seconde suffit à afficher des secondes entières. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function DuelTable({
  p,
  onChoose,
  onAnswer,
  onReact,
  onForfeit,
  reaction,
  hint,
  end,
}: {
  p: DuelPayload;
  onChoose: (card: string, notches: number) => void;
  onAnswer: (index: number) => void;
  onReact?: (index: number) => void;
  onForfeit?: () => void;
  reaction?: { index: number; at: number } | null;
  hint?: ReactNode;
  /** Boutons de fin de partie. */
  end: ReactNode;
}) {
  const { t } = useTranslation();
  const v = p.view;
  const now = useNow();
  const [pick, setPick] = useState<string | null>(null);
  const [notches, setNotches] = useState(0);
  const [memo, setMemo] = useState<RoundMemo | null>(null);
  const [sent, setSent] = useState<string>('');
  const [confirm, setConfirm] = useState(false);
  const lastTick = useRef(-1);
  const reactions = t('duel.reactions', { returnObjects: true }) as string[];
  const crit = t(`card:criteria.${v.criterion}`);

  // mémoire de la dernière manche, pour la montrer pendant la pause qui suit la révélation
  useEffect(() => {
    let m = memo;
    // le moteur annonce la carte tirée au hasard juste avant la révélation
    const auto = p.events.some((e) => e.type === 'autoPick' && e.seat === v.seat);
    for (const e of p.events) {
      if (e.type === 'reveal') m = { reveal: e, end: null, auto, answers: {} };
      if (e.type === 'answered' && m) m = { ...m, answers: { ...m.answers, [e.seat]: e.correct } };
      if (e.type === 'roundEnd' && m) m = { ...m, end: e };
    }
    if (m !== memo) setMemo(m);
    if (p.events.some((e) => e.type === 'roundStart')) {
      setPick(null);
      setNotches(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const paused = !!p.pauseUntil && now < Date.parse(p.pauseUntil);
  const left = p.deadline
    ? Date.parse(p.deadline) - Math.max(now, p.pauseUntil ? Date.parse(p.pauseUntil) : now)
    : null;
  const fast = left != null && left <= 5_000;
  const locked = !!v.me.pick;

  // tic-tac : une seconde sur deux tic, l'autre tac ; deux fois plus vite dans les 5 dernières secondes
  useEffect(() => {
    if (v.phase !== 'choose' || paused || left == null || left <= 0) return;
    const beat = fast ? Math.floor(left / 500) : Math.floor(left / 1000);
    if (beat === lastTick.current) return;
    lastTick.current = beat;
    sound.play(beat % 2 ? 'tic' : 'tac', { caption: false });
  }, [now, v.phase, paused, left, fast]);

  if (v.phase === 'over')
    return (
      <div className={s.over}>
        <span className="wm-mono">({t('duel.label')})</span>
        <h1 className={`wm-display ${s.big}`}>
          {v.winner == null ? t('duel.draw') : v.winner === v.seat ? t('duel.won') : t('duel.lost')}
        </h1>
        <p className="wm-mono">
          {v.endReason === 'forfeit'
            ? v.winner === v.seat
              ? t('duel.forfeitWin')
              : t('duel.forfeitLoss')
            : v.endReason === 'exhausted'
              ? t('duel.exhausted')
              : ''}{' '}
          {t('duel.final', { me: v.me.score, op: v.opponent.score })}
        </p>
        {p.ranked && p.result && (
          <p className="wm-mono">
            {t('duel.ratingDelta', { d: (p.result.ratingDelta >= 0 ? '+' : '') + p.result.ratingDelta })}
            {p.result.rubis > 0 && ` · ${t('duel.rubis', { n: p.result.rubis })}`}
          </p>
        )}
        {end}
      </div>
    );

  const hand = v.me.hand;
  const chosen = pick && hand.includes(pick) ? pick : null;
  const base = chosen ? p.cards[chosen]!.stats[v.criterion] : 0;
  const reveal = memo && (paused || v.phase === 'question') ? memo : null;
  const oppStatus = !p.opponent.connected
    ? `${t('duel.oppGone')} ${fmt(Date.parse(p.opponent.reconnectBy!) - now)}`
    : v.phase === 'question'
      ? v.opponent.answering
        ? t('duel.answering')
        : t('duel.locked')
      : v.opponent.locked
        ? t('duel.locked')
        : t('duel.thinking') + '.'.repeat(Math.floor(now / 1000) % 4);

  return (
    <div className={s.table}>
      <div className={s.top}>
        <div className={s.who}>
          <span className="wm-mono">
            ({t('duel.opponent')}) {t('duel.elo', { n: p.opponent.rating.toLocaleString() })}
          </span>
          <span className={s.name}>{p.opponent.name}</span>
        </div>
        <div className={s.status}>
          <span aria-live="polite" className="wm-mono">
            {oppStatus}
          </span>
          <div role="img" aria-label={t('duel.reserveOf', { count: v.opponent.reserve })} className={s.pips}>
            {[0, 1, 2].map((i) => (
              <span key={i} data-on={i < v.opponent.reserve} />
            ))}
          </div>
        </div>
      </div>

      <div className={`wm-mono ${s.scoreRow}`}>
        <span>
          {t('duel.round', { n: v.round })}
          {memo?.end?.replay && v.phase === 'choose' && !paused ? ` · ${t('duel.replay')}` : ''}
        </span>
        <div
          role="img"
          aria-label={t('duel.scoreLabel', { me: v.me.score, op: v.opponent.score })}
          className={s.boxes}
        >
          {Array.from({ length: 5 }, (_, i) => {
            const kind =
              i < v.me.score
                ? 'won'
                : i < v.me.score + v.opponent.score
                  ? 'lost'
                  : i === v.me.score + v.opponent.score
                    ? 'now'
                    : 'next';
            return (
              <span key={i} data-kind={kind}>
                {kind === 'lost' ? '×' : ''}
              </span>
            );
          })}
        </div>
        <span>{t('duel.score', { me: v.me.score, op: v.opponent.score })}</span>
      </div>

      <div className={s.crit}>
        <span className="wm-mono">({t('duel.criterion')})</span>
        {/* pendant la révélation, on garde le critère de la manche qui vient de se jouer */}
        <h1 className={`wm-display ${s.critName}`}>
          {reveal ? t(`card:criteria.${reveal.reveal.criterion}`) : crit}
        </h1>
        <div className={s.timerRow}>
          {left != null && (
            <span className={`wm-mono ${s.timer}`} data-fast={fast} role="timer">
              {fmt(left)}
            </span>
          )}
          {left != null && (
            <span className="wm-mono wm-muted">{fast ? t('duel.tickFast') : t('duel.tick')}</span>
          )}
        </div>
        {hint && !reveal && <div className={s.hint}>{hint}</div>}
      </div>

      {reveal ? (
        <Reveal p={p} memo={reveal} />
      ) : (
        <>
          <div className={s.handHead}>
            <span className="wm-mono">
              ({t('duel.hand')}) {hand.length} — 5
            </span>
          </div>
          <div className={s.hand}>
            {hand.map((id) => {
              const c = p.cards[id]!;
              const on = chosen === id || v.me.pick?.card === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={s.handCard}
                  data-on={on}
                  aria-pressed={on}
                  disabled={locked}
                  aria-label={t('duel.cardLabel', {
                    name: c.name,
                    criterion: crit,
                    value: c.stats[v.criterion],
                  })}
                  onClick={() => setPick(id)}
                >
                  <Card card={c} width={111} focus={v.criterion} />
                </button>
              );
            })}
          </div>

          <div className={s.reserve}>
            <div className={s.reserveCol}>
              <span className="wm-mono">{t('duel.reserve').toUpperCase()}</span>
              <div className={s.pipsBig} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} data-on={i < v.me.reserve - (locked ? 0 : notches)} />
                ))}
              </div>
            </div>
            <div className={s.stepper}>
              <button
                type="button"
                aria-label={t('duel.less')}
                disabled={locked || notches === 0}
                onClick={() => setNotches(notches - 1)}
              >
                −
              </button>
              <span aria-live="polite" className="wm-mono">
                +{locked ? v.me.pick!.notches : notches}
              </span>
              <button
                type="button"
                aria-label={t('duel.more')}
                disabled={locked || notches >= v.me.reserve}
                onClick={() => setNotches(notches + 1)}
              >
                +
              </button>
            </div>
          </div>
          <p className="wm-mono">
            {chosen || locked
              ? t('duel.value', {
                  base: locked ? p.cards[v.me.pick!.card]!.stats[v.criterion] : base,
                  n: locked ? v.me.pick!.notches : notches,
                  total: locked
                    ? p.cards[v.me.pick!.card]!.stats[v.criterion] + v.me.pick!.notches
                    : base + notches,
                })
              : ' '}
          </p>
          {locked ? (
            <Button big disabled>
              {t('duel.lockedWait')}
            </Button>
          ) : (
            <Button
              big
              variant="primary"
              disabled={!chosen || paused}
              onClick={() => chosen && onChoose(chosen, notches)}
            >
              {t('duel.lock')}
            </Button>
          )}
        </>
      )}

      {v.phase === 'question' && <Question p={p} now={now} onAnswer={onAnswer} />}

      {onReact && (
        <div className={s.reactions} role="group" aria-label={t('duel.reactionsLabel')}>
          {reactions.map((r, i) => (
            <button
              key={r}
              type="button"
              className="wm-mono"
              aria-pressed={sent === r}
              onClick={() => {
                onReact(i);
                setSent(r);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <p aria-live="polite" className="wm-mono wm-muted">
        {reaction && now - reaction.at < 4000
          ? t('duel.received', { r: reactions[reaction.index] })
          : sent
            ? t('duel.sent', { r: sent })
            : ''}
      </p>

      {onForfeit &&
        (confirm ? (
          <div className={s.confirm} role="group">
            <span>{t('duel.forfeitConfirm')}</span>
            <Button onClick={onForfeit}>{t('duel.confirm')}</Button>
            <Button variant="primary" onClick={() => setConfirm(false)}>
              {t('duel.keep')}
            </Button>
          </div>
        ) : (
          <Button variant="quiet" onClick={() => setConfirm(true)}>
            {t('duel.forfeit')}
          </Button>
        ))}
    </div>
  );
}

function Reveal({ p, memo }: { p: DuelPayload; memo: RoundMemo }) {
  const { t } = useTranslation();
  const me = p.view.seat;
  const op = me === 0 ? 1 : 0;
  const { reveal, end } = memo;
  const side = (seat: 0 | 1) => {
    const c = p.cards[reveal.cards[seat]];
    const base = reveal.values[seat] - reveal.notches[seat];
    return (
      <figure className={s.revealCard} data-win={end?.winner === seat}>
        <figcaption className="wm-mono">{seat === me ? t('duel.you') : t('duel.them')}</figcaption>
        {c && <Card card={c} width={130} focus={reveal.criterion} />}
        <span className="wm-mono">
          {base} + {reveal.notches[seat]} = <strong>{reveal.values[seat]}</strong>
          {memo.answers[seat] != null && ` · ${memo.answers[seat] ? t('duel.right') : t('duel.wrong')}`}
        </span>
      </figure>
    );
  };
  return (
    <div className={s.reveal} aria-live="polite">
      <div className={s.revealRow}>
        {side(me)}
        {side(op)}
      </div>
      {memo.auto && <p className="wm-mono">{t('duel.autoPick')}</p>}
      {end && (
        <p className={`wm-serif ${s.verdict}`}>
          {end.winner == null
            ? t('duel.roundReplay')
            : end.winner === me
              ? t('duel.roundWon')
              : t('duel.roundLost')}{' '}
          {end.decidedBy === 'question'
            ? t('duel.byQuestion')
            : end.decidedBy === 'rarity'
              ? t('duel.byRarity')
              : ''}
        </p>
      )}
    </div>
  );
}

function Question({ p, now, onAnswer }: { p: DuelPayload; now: number; onAnswer: (i: number) => void }) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<number | null>(null);
  const v = p.view;
  const left = p.deadline ? Date.parse(p.deadline) - now : null;
  return (
    <div className={s.question} role="dialog" aria-labelledby="q-title">
      <span id="q-title" className="wm-mono">
        ({t('duel.question')}) {left != null && fmt(left)}
      </span>
      {p.question ? (
        <>
          <p className={`wm-serif ${s.prompt}`}>{p.question.prompt}</p>
          <div className={s.choices}>
            {p.question.choices.map((c, i) => (
              <Button
                key={c}
                aria-pressed={chosen === i}
                disabled={chosen != null}
                onClick={() => {
                  setChosen(i);
                  onAnswer(i);
                }}
              >
                {c}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="wm-muted">{v.me.question ? t('duel.lockedWait') : t('duel.questionNone')}</p>
      )}
      {v.opponent.answering && <p className="wm-mono wm-muted">{t('duel.questionWait')}</p>}
    </div>
  );
}
