// Avis du marché : surenchéri, vente conclue, échange reçu… Les ouvrir les marque comme lus.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Balance, buttonClass, SectionLabel, StateBox } from '@wm/ui';
import { api, langOf, useMe } from '../api';
import s from './market.module.css';

/** Où mène chaque avis. */
const LINKS: Record<string, string> = {
  OUTBID: '/encheres?onglet=bids',
  AUCTION_WON: '/collection',
  AUCTION_SOLD: '/encheres?onglet=mine',
  AUCTION_EXPIRED: '/encheres?onglet=mine',
};

export function Notifications() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const qc = useQueryClient();
  const me = useMe();
  const signedIn = !!me.data?.exists && !me.data.isGuest;
  const list = useQuery({
    queryKey: ['notifications', lang],
    queryFn: () => api.notifications(lang),
    enabled: signedIn,
  });
  const read = useMutation({
    mutationFn: api.markRead,
    onSuccess: () => qc.setQueryData(['unread'], { unread: 0 }),
  });

  // lire la page vaut lecture des avis
  const unread = list.data?.some((n) => !n.read);
  useEffect(() => {
    if (unread) read.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <div className={`wm-wrap ${s.page}`}>
      <SectionLabel>{t('notif.label')}</SectionLabel>
      <h1 className={`wm-display ${s.title}`}>{t('notif.title')}</h1>
      {me.isPending || (signedIn && list.isPending) ? (
        <Balance />
      ) : !signedIn ? (
        <StateBox title={t('market.guest')} />
      ) : !list.data?.length ? (
        <StateBox title={t('notif.empty')} />
      ) : (
        <ul className={s.list}>
          {list.data.map((n) => (
            <li key={n.id} className={s.notif} data-unread={!n.read}>
              <p>
                {t(`notif.kinds.${n.kind}`, { card: n.card ?? '—', n: n.amount, net: n.net, from: n.from })}
              </p>
              <p className="wm-mono wm-muted">
                {new Date(n.createdAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}
                {!n.read && ` · ${t('notif.new')}`}
              </p>
              <Link to={LINKS[n.kind] ?? '/encheres?onglet=trades'} className={buttonClass('quiet')}>
                {t('notif.open')} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
