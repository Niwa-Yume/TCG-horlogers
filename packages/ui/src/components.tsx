import { useEffect, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { sound } from './sound';
import s from './ui.module.css';

/** Bandeau défilant (figé en prefers-reduced-motion). Décoratif : le texte doit exister ailleurs sur la page. */
export function Marquee({ text, repeat = 4 }: { text: string; repeat?: number }) {
  return (
    <div className={s.marquee} aria-hidden="true">
      <div className={s.track}>
        {Array.from({ length: repeat }, (_, i) => (
          <span key={i}>{text} —</span>
        ))}
      </div>
    </div>
  );
}

/** Étiquette de section « (Collection) », avec compteur optionnel « 1 — 4 ». */
export function SectionLabel({
  children,
  count,
  total,
  as: Tag = 'span',
}: {
  children: ReactNode;
  count?: number;
  total?: number;
  as?: 'span' | 'h2' | 'p';
}) {
  return (
    <Tag className={`wm-mono ${s.label}`}>
      ({children}){total != null && <Counter value={count ?? 0} total={total} />}
    </Tag>
  );
}

export function Counter({ value, total }: { value: number; total: number }) {
  const { i18n } = useTranslation();
  const f = (n: number) => n.toLocaleString(i18n.language);
  return (
    <span className="wm-mono">
      {f(value)} — {f(total)}
    </span>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export const buttonClass = (variant: ButtonVariant = 'secondary', big = false) =>
  `${s.button} ${s[variant]} ${big ? s.big : ''}`;

export function Button({
  variant,
  big,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  big?: boolean;
}) {
  return <button type="button" className={`${buttonClass(variant, big)} ${className}`} {...rest} />;
}

/** Filtre en puce (Tout, Horlogers…) : bascule à deux états. */
export function Chip({ pressed, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return <button type="button" aria-pressed={pressed} className={`wm-mono ${s.chip}`} {...rest} />;
}

/** Minuteur par crans : avance d'une seconde à la fois, comme une trotteuse. */
export function StepTimer({
  to,
  onDone,
  className = '',
}: {
  to: number;
  onDone?: () => void;
  className?: string;
}) {
  const left = () => Math.max(0, Math.ceil((to - Date.now()) / 1000));
  const [sec, setSec] = useState(left);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const l = left();
      setSec(l);
      if (l === 0) return onDone?.();
      id = setTimeout(tick, ((to - Date.now()) % 1000) + 5);
    };
    tick();
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  const two = (n: number) => String(n).padStart(2, '0');
  const hh = Math.floor(sec / 3600);
  const text = `${hh ? `${two(hh)}:` : ''}${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)}`;
  return (
    <span role="timer" aria-live="off" className={`wm-mono ${className}`}>
      {text}
    </span>
  );
}

/** Balancier de chargement : oscille par crans d'une seconde. */
export function Balance({ label }: { label?: string }) {
  const { t } = useTranslation('ui');
  return (
    <div className={s.balance} role="status">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <g className={s.wheel}>
          <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M28 6v44M6 28h44" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="28" cy="28" r="4" fill="currentColor" />
        </g>
        <path
          d="M28 28m-9 0a9 9 0 1 1 9 9a6 6 0 1 1 -6-6"
          fill="none"
          stroke="var(--steel-blue)"
          strokeWidth="1"
        />
      </svg>
      <span className="wm-mono">{label ?? t('loading')}</span>
    </div>
  );
}

export function useSound() {
  return useSyncExternalStore(sound.subscribe, sound.get);
}

export function MuteButton() {
  const { t } = useTranslation('ui');
  const { muted } = useSound();
  return (
    <button
      type="button"
      className={s.icon}
      aria-pressed={muted}
      aria-label={muted ? t('unmute') : t('mute')}
      onClick={() => sound.setMuted(!muted)}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {muted ? (
          <path d="M17 9l5 6M22 9l-5 6" />
        ) : (
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        )}
      </svg>
    </button>
  );
}

/** Sous-titre visuel du dernier son (région live polie). */
export function SoundCaption() {
  const { t } = useTranslation('ui');
  const { caption } = useSound();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!caption) return;
    setShown(true);
    const id = setTimeout(() => setShown(false), 2600);
    return () => clearTimeout(id);
  }, [caption]);
  return (
    <p className={`wm-mono ${s.caption}`} aria-live="polite" data-shown={shown}>
      {caption && shown ? t(`sound.${caption.name}`) : ''}
    </p>
  );
}

/** États obligatoires : vide, erreur (avec action), hors ligne. */
export function StateBox({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.state}>
      <p className="wm-serif" style={{ fontSize: 28 }}>
        {title}
      </p>
      {children && <p className="wm-muted">{children}</p>}
      {action}
    </div>
  );
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      addEventListener('online', cb);
      addEventListener('offline', cb);
      return () => {
        removeEventListener('online', cb);
        removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}
