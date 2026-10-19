// Loupe ×2,4 (design/Loupe.dc.html) : appui long au doigt, survol à la souris, flèches au clavier.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardView } from '@wm/shared';
import { Card } from './Card';
import { HALLMARK } from './geometry';
import s from './card.module.css';

const ZOOM = 2.4;
const R = 62; // rayon de la lentille (124 px, bordure 5 px)
const LONG_PRESS_MS = 280;

export function Loupe({
  card,
  width = 320,
  pinned = false,
  onFound,
}: {
  card: CardView;
  width?: number;
  /** Lentille posée sur le poinçon (bouton « Montrer »). */
  pinned?: boolean;
  onFound?: () => void;
}) {
  const { t } = useTranslation('card');
  const s0 = width / 252;
  const [pos, setPos] = useState({ cx: 126, cy: 176 });
  const [active, setActive] = useState(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const found = useRef(false);

  const moveTo = (cx: number, cy: number) => {
    cx = Math.max(0, Math.min(252, cx));
    cy = Math.max(0, Math.min(352, cy));
    setPos({ cx, cy });
    if (!found.current && Math.hypot(cx - HALLMARK.x, cy - HALLMARK.y) < 14) {
      found.current = true;
      onFound?.();
    }
  };
  const fromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    moveTo((e.clientX - r.left) / s0, (e.clientY - r.top) / s0);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const target = e.currentTarget;
    const id = e.pointerId;
    const { clientX, clientY } = e;
    press.current = setTimeout(() => {
      setActive(true);
      try {
        target.setPointerCapture(id);
      } catch {
        /* pointeur déjà relâché */
      }
      const r = target.getBoundingClientRect();
      moveTo((clientX - r.left) / s0, (clientY - r.top) / s0);
    }, LONG_PRESS_MS);
  };
  const end = () => {
    if (press.current) clearTimeout(press.current);
    setActive(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 8;
    const d = (
      { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<
        string,
        [number, number]
      >
    )[e.key];
    if (!d) return;
    e.preventDefault();
    setActive(true);
    moveTo(pos.cx + d[0], pos.cy + d[1]);
  };

  const at = pinned && !active ? { cx: HALLMARK.x, cy: HALLMARK.y } : pos;
  const show = active || pinned;
  const S = s0 * ZOOM;

  return (
    <div
      className={s.loupe}
      style={{ width, height: (width * 352) / 252 }}
      tabIndex={0}
      role="group"
      aria-label={t('loupe')}
      onPointerEnter={(e) => e.pointerType === 'mouse' && (setActive(true), fromEvent(e))}
      onPointerMove={(e) => (e.pointerType === 'mouse' || active) && fromEvent(e)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && end()}
      onPointerDown={onPointerDown}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onBlur={end}
    >
      <Card card={card} width={width} live eager />
      {show && (
        <div
          className={s.lens}
          aria-hidden="true"
          style={{ left: Math.round(at.cx * s0 - R), top: Math.round(at.cy * s0 - R) }}
        >
          <div
            className={s.lensInner}
            style={{
              transform: `translate(${Math.round(R - 5 - at.cx * S)}px, ${Math.round(R - 5 - at.cy * S)}px)`,
            }}
          >
            <Card card={card} width={252 * S} eager />
          </div>
        </div>
      )}
    </div>
  );
}
