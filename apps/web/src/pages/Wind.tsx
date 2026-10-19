// Remontage et révélation (design/Remontage.dc.html) : 12 crans à la couronne, le ressort se libère,
// les cartes sortent une à une ; la sonnerie annonce la rareté avant l'image.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BoosterBack, Card } from '@wm/card-render';
import { BOOSTER_ODDS, RECYCLE_RUBIS, type PulledCard } from '@wm/shared';
import { Balance, Button, buttonClass, sound, StateBox, StepTimer } from '@wm/ui';
import { providerName, api, HttpError, langOf, shareLink, useMe } from '../api';
import { CrownSvg } from '../Crown';
import { once, secondsSinceFirstVisit, track } from '../track';
import s from './wind.module.css';

const NOTCHES = 12;

export function Wind() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const me = useMe();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<'wind' | 'reveal' | 'ringing' | 'done'>('wind');
  const [notches, setNotches] = useState(0);
  const [rot, setRot] = useState(0);
  const [pull, setPull] = useState<PulledCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(false);
  const [caption, setCaption] = useState(() => t('wind.ready'));
  const [note, setNote] = useState('');
  const count = useRef(0);
  const hold = useRef<ReturnType<typeof setInterval>>(undefined);
  const ring = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drag = useRef({ on: false, moved: false, last: 0, acc: 0 });
  const crown = useRef<HTMLButtonElement>(null);
  const notchRef = useRef<() => void>(() => {});

  const open = useMutation({
    mutationFn: () => api.open(lang),
    onSuccess: (d) => {
      qc.setQueryData(['me'], d.me);
      void qc.invalidateQueries({ queryKey: ['collection'] });
      sound.play('ressort');
      setPull(d.cards);
      setIdx(0);
      setShown(false);
      setPhase('reveal');
      setCaption(t('wind.released'));
    },
  });

  const notch = () => {
    if (phase !== 'wind' || count.current >= NOTCHES || open.isPending) return;
    const n = ++count.current;
    setNotches(n);
    setRot((r) => r + 30);
    sound.play('cliquet');
    try {
      navigator.vibrate?.(10);
    } catch {
      /* Safari iOS : pas de vibration, le son et la jauge compensent */
    }
    setCaption(n < NOTCHES ? t('wind.notch', { n }) : t('wind.armed'));
    if (n === NOTCHES) {
      clearInterval(hold.current);
      setTimeout(() => open.mutate(), 260);
    }
  };
  notchRef.current = notch;

  // molette et trackpad : 40 px de défilement vers le bas = un cran, jamais en arrière
  useEffect(() => {
    const el = crown.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc = Math.max(0, acc + e.deltaY + e.deltaX);
      while (acc >= 40) {
        acc -= 40;
        notchRef.current();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [phase, me.data?.stock]);

  useEffect(
    () => () => {
      clearInterval(hold.current);
      clearTimeout(ring.current);
    },
    [],
  );

  const angle = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
    );
  };
  const crownDown = (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { on: true, moved: false, last: angle(e), acc: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* rien */
    }
  };
  const crownMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d.on) return;
    const a = angle(e);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    if (Math.abs(delta) > 0.5) d.moved = true;
    if (delta <= 0) {
      d.acc = Math.max(d.acc + delta, -10); // sens horaire seulement
      return;
    }
    d.acc += delta;
    while (d.acc >= 30) {
      d.acc -= 30;
      notch();
    }
  };
  const crownClick = () => {
    if (drag.current.moved) drag.current.moved = false;
    else notch();
  };
  const crownKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      notch();
    }
  };
  const holdStart = () => {
    notch();
    clearInterval(hold.current);
    hold.current = setInterval(() => notchRef.current(), 170);
  };
  const holdStop = () => clearInterval(hold.current);

  const current = pull[idx];
  const rate = (r: PulledCard['rarity']) => `${Math.round(BOOSTER_ODDS[r] * 100)} %`;
  const shownCaption = (c: PulledCard) =>
    [
      t('wind.shown', { rarity: t(`card:rarity.${c.rarity}`), rate: rate(c.rarity) }),
      c.duplicate ? t('wind.duplicate', { n: RECYCLE_RUBIS[c.rarity] }) : '',
    ]
      .filter(Boolean)
      .join(' ');

  const flip = () => {
    if (!current) return;
    once('wm-first-reveal', () => track('first_card_revealed', { seconds: secondsSinceFirstVisit() }));
    if (current.rarity === 'GRAND_FEU') {
      sound.play('repetition-minutes');
      setPhase('ringing');
      setCaption(t('wind.ringCaption'));
      ring.current = setTimeout(() => {
        setPhase('reveal');
        setShown(true);
        setCaption(shownCaption(current));
      }, 5600);
      return;
    }
    sound.play(current.rarity === 'CLOISONNE' ? 'timbre' : 'revelation');
    setShown(true);
    setCaption(
      current.rarity === 'CLOISONNE'
        ? `${t('wind.chime')}${current.duplicate ? ' ' + t('wind.duplicate', { n: RECYCLE_RUBIS.CLOISONNE }) : ''}`
        : shownCaption(current),
    );
  };
  const next = () => {
    if (idx >= pull.length - 1) return setPhase('done');
    setIdx(idx + 1);
    setShown(false);
    setCaption('');
  };
  const restart = () => {
    count.current = 0;
    setNotches(0);
    setRot(0);
    setPull([]);
    open.reset();
    setPhase('wind');
    setCaption(t('wind.ready'));
  };

  if (me.isPending) return <Balance />;
  const m = me.data;
  const first = (m?.boostersOpened ?? 0) === 0;
  const emptyErr = open.error instanceof HttpError && open.error.status === 409;

  if (phase === 'wind' && ((m && m.stock < 1 && notches === 0) || emptyErr)) {
    const nextAt = (emptyErr ? (open.error as HttpError).body?.nextAt : m?.nextAt) as
      string | null | undefined;
    return (
      <div className={s.screen}>
        <StateBox
          title={t('wind.empty')}
          action={
            <Link to="/collection" className={buttonClass('secondary')}>
              {t('wind.album')}
            </Link>
          }
        >
          {t('wind.emptyText')}
        </StateBox>
        {nextAt && (
          <div className={s.next}>
            <span className="wm-mono">({t('home.next')})</span>
            <StepTimer
              to={Date.parse(nextAt)}
              className={s.bigTimer}
              onDone={() => (restart(), void me.refetch())}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={s.screen}>
      {phase === 'wind' && (
        <>
          <div className={`wm-mono ${s.row}`}>
            <span>({first ? t('wind.gift') : t('wind.booster')})</span>
            <span>{first ? '1 — 1' : `${m?.stock ?? 0} — 10`}</span>
          </div>
          <h1 className={`wm-display ${s.title}`}>{first ? t('wind.titleFirst') : t('wind.title')}</h1>
          <p className="wm-muted">{t('wind.hint')}</p>
          <div className={s.stage}>
            <button
              ref={crown}
              type="button"
              className={s.crown}
              aria-label={t('wind.crownLabel')}
              disabled={open.isPending}
              onPointerDown={crownDown}
              onPointerMove={crownMove}
              onPointerUp={() => (drag.current.on = false)}
              onPointerCancel={() => (drag.current.on = false)}
              onClick={crownClick}
              onKeyDown={crownKey}
            >
              <CrownSvg size={236} rot={rot} pointer />
            </button>
          </div>
          <div className={s.gaugeBox}>
            <div className={`wm-mono ${s.row}`}>
              <span>{t('wind.reserve').toUpperCase()}</span>
              <span>
                {notches} — {NOTCHES}
              </span>
            </div>
            <div className={s.gauge} aria-hidden="true">
              {Array.from({ length: NOTCHES }, (_, i) => (
                <span key={i} data-on={i < notches} />
              ))}
            </div>
            <p aria-live="polite" className={`wm-mono wm-muted ${s.caption}`}>
              {caption}
            </p>
          </div>
          {open.isError && !emptyErr ? (
            <StateBox
              title={t('wind.error')}
              action={<Button onClick={() => open.mutate()}>{t('wind.retry')}</Button>}
            >
              {t('wind.errorText')}
            </StateBox>
          ) : (
            <Button
              big
              className={s.hold}
              disabled={open.isPending}
              onPointerDown={holdStart}
              onPointerUp={holdStop}
              onPointerLeave={holdStop}
              onPointerCancel={holdStop}
              onClick={(e) => e.detail === 0 && notch()} // clavier : Entrée maintenue répète le cran
            >
              {open.isPending ? t('wind.armed') : t('wind.hold')}
            </Button>
          )}
        </>
      )}

      {phase === 'reveal' && current && (
        <>
          <div className={`wm-mono ${s.row}`}>
            <span>({t('wind.pull')})</span>
            <span>
              {idx + 1} — {pull.length}
            </span>
          </div>
          <div className={s.stage}>
            {shown ? (
              <div className={s.reveal} key={current.instanceId}>
                <Card card={current} width={302} live eager />
              </div>
            ) : (
              <button
                type="button"
                className={s.back}
                onClick={flip}
                aria-label={t('wind.revealLabel', { pos: idx + 1 })}
              >
                <BoosterBack width={302} />
              </button>
            )}
          </div>
          <p aria-live="polite" className={`wm-mono wm-muted ${s.caption} ${s.center}`}>
            {caption}
          </p>
          {shown ? (
            <Button big onClick={next}>
              {idx >= pull.length - 1 ? t('wind.seeAll') : t('wind.next')}
            </Button>
          ) : (
            <Button big variant="primary" onClick={flip}>
              {t('wind.reveal')}
            </Button>
          )}
        </>
      )}

      {phase === 'ringing' && (
        <div className={s.ringing} role="alert">
          <span className="wm-mono">({t('wind.ringing')})</span>
          <p className={`wm-display ${s.ringTitle}`}>{t('wind.ringTitle')}</p>
          <p className={s.ringText}>{t('wind.ringText')}</p>
        </div>
      )}

      {phase === 'done' && pull.length > 0 && (
        <Done
          pull={pull}
          first={(m?.boostersOpened ?? 0) <= 1}
          stock={m?.stock ?? 0}
          providers={m?.isGuest ? (m.providers ?? []) : null}
          note={note}
          onShare={async () => {
            const best = pull.at(-1)!;
            if (await shareLink(best.name, `${location.origin}/partage/i/${best.instanceId}?lang=${lang}`))
              setNote(t('wind.copied'));
          }}
          onAgain={restart}
        />
      )}
    </div>
  );
}

function Done({
  pull,
  first,
  stock,
  providers,
  note,
  onShare,
  onAgain,
}: {
  pull: PulledCard[];
  first: boolean;
  stock: number;
  /** null : déjà connecté·e ; [] : aucune connexion configurée. */
  providers: string[] | null;
  note: string;
  onShare: () => void;
  onAgain: () => void;
}) {
  const { t } = useTranslation();
  const best = pull.at(-1)!;
  return (
    <div className={s.done}>
      <span className="wm-mono">({first ? t('wind.doneLabelFirst') : t('wind.doneLabel')})</span>
      <h1 className={`wm-display ${s.title}`}>
        {t('wind.doneTitle', { best: t(`wind.best.${best.rarity}`) })}
      </h1>
      <ul className={s.minis}>
        {pull.map((c) => (
          <li key={c.instanceId}>
            <Link to={`/carte/${c.slug}`} aria-label={`${c.name}, ${t(`card:rarity.${c.rarity}`)}`}>
              <Card card={c} width={106} eager />
            </Link>
          </li>
        ))}
      </ul>
      <div className={s.keep}>
        {providers && (
          <>
            <p>
              <strong>{t('wind.keep')}</strong> {providers.length ? t('wind.keepText') : t('wind.keepSoon')}
            </p>
            {providers.length > 0 && (
              <div className={s.pair}>
                {providers.map((p) => (
                  <a key={p} href={`/api/auth/${p}`} className={buttonClass('secondary')}>
                    {t('album.with', { p: providerName(p) })}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        <Button variant="primary" big onClick={onShare}>
          {t('wind.share')}
        </Button>
        <span role="status" className="wm-mono">
          {note}
        </span>
        {stock > 0 && <Button onClick={onAgain}>{t('wind.again', { n: stock })}</Button>}
        <div className={s.links}>
          <Link to={`/carte/${best.slug}?apprendre=1`}>{t('wind.inspect', { name: best.name })} →</Link>
          <Link to="/collection">{t('wind.album')}</Link>
          <Link to="/duel/tutoriel">{t('wind.tutorial')} →</Link>
        </div>
      </div>
    </div>
  );
}
