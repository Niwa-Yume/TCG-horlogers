// Le marché : enchères en Rubis (24 h, séquestre, taxe brûlée) et échanges à double confirmation.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Card, FluidCard } from '@wm/card-render';
import {
  auctionTax,
  minStartPrice,
  RARITIES,
  type AuctionView,
  type MeView,
  type TradeView,
} from '@wm/shared';
import { Balance, Button, buttonClass, Chip, SectionLabel, StateBox, StepTimer } from '@wm/ui';
import { api, HttpError, langOf, providerName, useMe, type FreeCard } from '../api';
import s from './market.module.css';

const TABS = ['open', 'mine', 'bids', 'trades'] as const;
type Tab = (typeof TABS)[number];

/** Message d'erreur lisible à partir du code renvoyé par l'API. */
function useErr() {
  const { t } = useTranslation();
  return (e: unknown) =>
    e instanceof HttpError
      ? t(`market.errors.${e.message}`, { defaultValue: t('catalogue.errorText') })
      : t('catalogue.errorText');
}

/** Après toute opération : soldes, collection et listes à jour. */
function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['me', 'auctions', 'free', 'trades', 'collection', 'player-cards'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

export function Market() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('onglet') ?? '')
    ? (params.get('onglet') as Tab)
    : 'open';
  const [rarity, setRarity] = useState<string | undefined>();
  const auctions = useQuery({
    queryKey: ['auctions', lang, tab, rarity],
    queryFn: () => api.auctions(lang, tab, rarity),
    enabled: tab !== 'trades',
  });

  // le titre s'affiche sans attendre la session ; seuls les blocs qui en dépendent attendent
  const m = me.data;
  const sellable = !!m?.sellableAt && Date.parse(m.sellableAt) <= Date.now();

  return (
    <div className={`wm-wrap ${s.page}`}>
      <div className={s.head}>
        <SectionLabel>{t('market.label')}</SectionLabel>
        {m?.exists && (
          <span className={`wm-mono ${s.rubis}`}>
            {t('market.rubis', { n: m.rubis.toLocaleString(lang) })}
          </span>
        )}
      </div>
      <h1 className={`wm-display ${s.title}`}>{t('market.title')}</h1>
      <p className={`wm-muted ${s.rules}`}>{t('market.rules')}</p>
      {m && <Gate me={m} />}

      <div className={s.chips} role="group" aria-label={t('market.label')}>
        {TABS.map((k) => (
          <Chip key={k} pressed={tab === k} onClick={() => setParams({ onglet: k }, { replace: true })}>
            {t(`market.tabs.${k}`)}
          </Chip>
        ))}
      </div>

      {tab === 'trades' ? (
        <Trades canTrade={sellable} />
      ) : (
        <>
          {tab !== 'bids' && sellable && <Sell />}
          {tab === 'open' && (
            <div className={s.chips} role="group" aria-label={t('catalogue.rarityFilter')}>
              <Chip pressed={!rarity} onClick={() => setRarity(undefined)}>
                {t('catalogue.allRarities')}
              </Chip>
              {RARITIES.map((r) => (
                <Chip key={r} pressed={rarity === r} onClick={() => setRarity(r)}>
                  {t(`card:rarity.${r}`)}
                </Chip>
              ))}
            </div>
          )}
          {auctions.isPending ? (
            <Balance />
          ) : auctions.isError ? (
            <StateBox
              title={t('catalogue.errorTitle')}
              action={<Button onClick={() => auctions.refetch()}>{t('catalogue.retry')}</Button>}
            />
          ) : auctions.data.length === 0 ? (
            <StateBox
              title={t(
                tab === 'open' ? 'market.empty' : tab === 'mine' ? 'market.emptyMine' : 'market.emptyBids',
              )}
            />
          ) : (
            <ul className={s.list}>
              {auctions.data.map((a) => (
                <AuctionRow key={a.id} a={a} view={tab} canBid={!!m?.exists && !m.isGuest} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Invité : se connecter ; compte trop récent : la date à partir de laquelle on peut vendre. */
function Gate({ me }: { me: MeView }) {
  const { t, i18n } = useTranslation();
  if (me.isGuest)
    return (
      <div className={s.gate}>
        <p>{t('market.guest')}</p>
        <div className={s.row}>
          {me.providers.map((p) => (
            <a key={p} href={`/api/auth/${p}`} className={buttonClass('secondary')}>
              {t('album.with', { p: providerName(p) })}
            </a>
          ))}
        </div>
      </div>
    );
  if (me.sellableAt && Date.parse(me.sellableAt) > Date.now())
    return (
      <p className={s.gate}>
        {t('market.tooNew', {
          date: new Date(me.sellableAt).toLocaleString(i18n.language, {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
        })}
      </p>
    );
  return null;
}

function AuctionRow({ a, view, canBid }: { a: AuctionView; view: Tab; canBid: boolean }) {
  const { t } = useTranslation();
  const err = useErr();
  const refresh = useRefresh();
  const [amount, setAmount] = useState(String(a.minBid));
  const [confirm, setConfirm] = useState(false);
  const bid = useMutation({
    mutationFn: () => api.bid(a.id, Number(amount)),
    onSuccess: () => (setConfirm(false), refresh()),
  });
  const cancel = useMutation({ mutationFn: () => api.cancelAuction(a.id), onSuccess: refresh });
  const open = a.status === 'OPEN';
  const state =
    view === 'bids'
      ? open
        ? a.leading
          ? t('market.leading')
          : t('market.outbid')
        : a.status === 'SOLD' && a.leading
          ? t('market.won')
          : t('market.lost')
      : open
        ? a.leading
          ? t('market.leading')
          : ''
        : t(`market.status.${a.status}`);

  return (
    <li className={s.item}>
      <div className={s.thumb}>
        <FluidCard card={a.card} />
      </div>
      <div className={s.info}>
        <p className={`wm-serif ${s.name}`}>{a.card.name}</p>
        <p className="wm-mono wm-muted">
          {t(`card:rarity.${a.card.rarity}`)} · {t('market.seller', { name: a.seller })}
        </p>
        <p className="wm-mono">
          {a.bestBid != null
            ? t('market.best', { n: a.bestBid })
            : t('market.startPrice', { n: a.startPrice })}{' '}
          · {t('market.bids', { count: a.bids })}
        </p>
        <p className="wm-mono">
          {open ? (
            <>
              {t('market.left')} <StepTimer to={Date.parse(a.endsAt)} onDone={refresh} />
            </>
          ) : null}
          {state && <strong className={s.state}>{state}</strong>}
        </p>

        {open && !a.mine && !a.leading && canBid && (
          <form
            className={s.bid}
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(amount) >= a.minBid) setConfirm(true);
            }}
          >
            <label className={s.field}>
              <span className="wm-mono">{t('market.amount', { min: a.minBid })}</span>
              <input
                type="number"
                inputMode="numeric"
                min={a.minBid}
                step={1}
                value={amount}
                onChange={(e) => (setAmount(e.target.value), setConfirm(false))}
              />
            </label>
            {confirm ? (
              <div className={s.confirm} role="group">
                <span>{t('market.bidConfirm', { n: Number(amount), name: a.card.name })}</span>
                <Button variant="primary" disabled={bid.isPending} onClick={() => bid.mutate()}>
                  {t('market.confirm')}
                </Button>
                <Button onClick={() => setConfirm(false)}>{t('market.cancel')}</Button>
              </div>
            ) : (
              <Button type="submit" variant="primary">
                {t('market.bid')}
              </Button>
            )}
          </form>
        )}
        {open && a.mine && a.bids === 0 && (
          <Button variant="quiet" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {t('market.cancelSale')}
          </Button>
        )}
        {(bid.error || cancel.error) && <p role="alert">{err(bid.error ?? cancel.error)}</p>}
      </div>
    </li>
  );
}

function Sell() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const err = useErr();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<FreeCard | null>(null);
  const [price, setPrice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const free = useQuery({ queryKey: ['free', lang], queryFn: () => api.myFreeCards(lang), enabled: open });
  const sell = useMutation({
    mutationFn: () => api.sell(pick!.instanceId, Number(price)),
    onSuccess: () => (setOpen(false), setPick(null), setConfirm(false), refresh()),
  });
  if (!open)
    return (
      <Button big onClick={() => setOpen(true)}>
        {t('market.sell')}
      </Button>
    );
  const min = pick ? minStartPrice(pick.rarity) : 0;
  const n = Number(price);
  return (
    <section className={s.panel} aria-label={t('market.sell')}>
      <p>{pick ? pick.name : t('market.sellPick')}</p>
      {!pick &&
        (free.isPending ? (
          <Balance />
        ) : !free.data?.length ? (
          <p className="wm-muted">{t('market.noFree')}</p>
        ) : (
          <ul className={s.picker}>
            {free.data.map((c) => (
              <li key={c.instanceId}>
                <button
                  type="button"
                  aria-label={`${c.name}, ${t(`card:rarity.${c.rarity}`)}`}
                  onClick={() => (setPick(c), setPrice(String(minStartPrice(c.rarity))))}
                >
                  <FluidCard card={c} />
                </button>
              </li>
            ))}
          </ul>
        ))}
      {pick && (
        <form
          className={s.bid}
          onSubmit={(e) => {
            e.preventDefault();
            if (n >= min) setConfirm(true);
          }}
        >
          <label className={s.field}>
            <span className="wm-mono">{t('market.sellPrice', { min })}</span>
            <input
              type="number"
              inputMode="numeric"
              min={min}
              step={1}
              value={price}
              onChange={(e) => (setPrice(e.target.value), setConfirm(false))}
            />
          </label>
          {confirm ? (
            <div className={s.confirm} role="group">
              <span>{t('market.sellConfirm', { name: pick.name, n, net: n - auctionTax(n) })}</span>
              <Button variant="primary" disabled={sell.isPending} onClick={() => sell.mutate()}>
                {t('market.confirm')}
              </Button>
              <Button onClick={() => setConfirm(false)}>{t('market.cancel')}</Button>
            </div>
          ) : (
            <Button type="submit" variant="primary">
              {t('market.sell')}
            </Button>
          )}
        </form>
      )}
      {sell.error && <p role="alert">{err(sell.error)}</p>}
      <Button variant="quiet" onClick={() => (setOpen(false), setPick(null), setConfirm(false))}>
        {t('market.cancel')}
      </Button>
    </section>
  );
}

// ---------- Échanges ----------

function Trades({ canTrade }: { canTrade: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const me = useMe();
  const trades = useQuery({
    queryKey: ['trades', lang],
    queryFn: () => api.trades(lang),
    enabled: !!me.data?.exists && !me.data.isGuest,
  });
  if (!me.data?.exists || me.data.isGuest) return null;
  return (
    <div className={s.trades}>
      <p className="wm-muted">{t('trade.intro')}</p>
      {canTrade && <NewTrade />}
      {trades.isPending ? (
        <Balance />
      ) : !trades.data?.length ? (
        <StateBox title={t('trade.none')} />
      ) : (
        <ul className={s.list}>
          {trades.data.map((tr) => (
            <TradeRow key={tr.id} tr={tr} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Minis({ cards }: { cards: FreeCard[] }) {
  return (
    <ul className={s.minis}>
      {cards.map((c) => (
        <li key={c.instanceId} className={s.mini}>
          <Card card={c} width={72} />
          <span className="wm-mono">{c.name}</span>
        </li>
      ))}
    </ul>
  );
}

function TradeRow({ tr }: { tr: TradeView }) {
  const { t, i18n } = useTranslation();
  const err = useErr();
  const refresh = useRefresh();
  const [confirm, setConfirm] = useState(false);
  const act = useMutation({
    mutationFn: (a: 'accept' | 'decline' | 'cancel') => api.decide(tr.id, a),
    onSuccess: refresh,
  });
  const pending = tr.status === 'PENDING';
  return (
    <li className={s.trade}>
      <p className="wm-mono">
        <strong>
          {tr.incoming ? t('trade.incoming', { name: tr.from }) : t('trade.outgoing', { name: tr.to })}
        </strong>{' '}
        · {t(`trade.status.${tr.status}`)}
        {pending &&
          ` ${t('trade.until')} ${new Date(tr.expiresAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}`}
      </p>
      <div className={s.sides}>
        <div>
          <span className="wm-mono">
            {tr.from} → {tr.to}
          </span>
          <Minis cards={tr.offer} />
        </div>
        <div>
          <span className="wm-mono">
            {tr.to} → {tr.from}
          </span>
          <Minis cards={tr.ask} />
        </div>
      </div>
      {pending && tr.incoming && (
        <div className={s.row}>
          {confirm ? (
            <div className={s.confirm} role="group">
              <span>{t('trade.acceptConfirm')}</span>
              <Button variant="primary" disabled={act.isPending} onClick={() => act.mutate('accept')}>
                {t('market.confirm')}
              </Button>
              <Button onClick={() => setConfirm(false)}>{t('market.cancel')}</Button>
            </div>
          ) : (
            <>
              <Button variant="primary" onClick={() => setConfirm(true)}>
                {t('trade.accept')}
              </Button>
              <Button disabled={act.isPending} onClick={() => act.mutate('decline')}>
                {t('trade.decline')}
              </Button>
            </>
          )}
        </div>
      )}
      {pending && !tr.incoming && (
        <Button variant="quiet" disabled={act.isPending} onClick={() => act.mutate('cancel')}>
          {t('trade.cancel')}
        </Button>
      )}
      {act.error && <p role="alert">{err(act.error)}</p>}
    </li>
  );
}

function Picker({
  cards,
  chosen,
  onToggle,
}: {
  cards: FreeCard[];
  chosen: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className={s.picker}>
      {cards.map((c) => (
        <li key={c.instanceId}>
          <button
            type="button"
            aria-pressed={chosen.includes(c.instanceId)}
            aria-label={`${c.name}, ${t(`card:rarity.${c.rarity}`)}`}
            disabled={!chosen.includes(c.instanceId) && chosen.length >= 5}
            onClick={() => onToggle(c.instanceId)}
          >
            <FluidCard card={c} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewTrade() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const err = useErr();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [ask, setAsk] = useState<string[]>([]);
  const [offer, setOffer] = useState<string[]>([]);
  const players = useQuery({
    queryKey: ['players', q],
    queryFn: () => api.players(q),
    enabled: open && q.trim().length >= 2 && !who,
  });
  const theirs = useQuery({
    queryKey: ['player-cards', who?.id, lang],
    queryFn: () => api.playerCards(who!.id, lang),
    enabled: !!who,
  });
  const mine = useQuery({ queryKey: ['free', lang], queryFn: () => api.myFreeCards(lang), enabled: !!who });
  const propose = useMutation({
    mutationFn: () => api.propose(who!.id, offer, ask),
    onSuccess: () => (setOpen(false), setWho(null), setAsk([]), setOffer([]), setQ(''), refresh()),
  });
  const toggle = (list: string[], set: (x: string[]) => void) => (id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const names = (ids: string[], cards: FreeCard[] = []) =>
    ids
      .map((id) => cards.find((c) => c.instanceId === id)?.name)
      .filter(Boolean)
      .join(', ');

  if (!open)
    return (
      <Button big onClick={() => setOpen(true)}>
        {t('trade.new')}
      </Button>
    );
  return (
    <section className={s.panel} aria-label={t('trade.new')}>
      {!who ? (
        <>
          <label className={s.field}>
            <span className="wm-mono">{t('trade.search')}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {players.data &&
            (players.data.length ? (
              <ul className={s.players}>
                {players.data.map((p) => (
                  <li key={p.id}>
                    <Button onClick={() => setWho(p)}>
                      {p.name} · {t('duel.elo', { n: p.rating })}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wm-muted">{t('trade.noPlayer')}</p>
            ))}
        </>
      ) : (
        <>
          <p className="wm-serif">{who.name}</p>
          <SectionLabel count={ask.length} total={5}>
            {t('trade.theirs')}
          </SectionLabel>
          {theirs.isPending ? (
            <Balance />
          ) : (
            <Picker cards={theirs.data?.cards ?? []} chosen={ask} onToggle={toggle(ask, setAsk)} />
          )}
          <SectionLabel count={offer.length} total={5}>
            {t('trade.yours')}
          </SectionLabel>
          {mine.isPending ? (
            <Balance />
          ) : (
            <Picker cards={mine.data ?? []} chosen={offer} onToggle={toggle(offer, setOffer)} />
          )}
          {ask.length > 0 && offer.length > 0 && (
            <p className={s.summary}>
              {t('trade.summary', {
                give: names(offer, mine.data),
                get: names(ask, theirs.data?.cards),
                name: who.name,
              })}
            </p>
          )}
          <Button
            variant="primary"
            big
            disabled={!ask.length || !offer.length || propose.isPending}
            onClick={() => propose.mutate()}
          >
            {t('trade.propose')}
          </Button>
          {propose.error && <p role="alert">{err(propose.error)}</p>}
        </>
      )}
      <Button variant="quiet" onClick={() => (setOpen(false), setWho(null), setAsk([]), setOffer([]))}>
        {t('market.cancel')}
      </Button>
    </section>
  );
}
