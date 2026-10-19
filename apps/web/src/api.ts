import { useQuery } from '@tanstack/react-query';
import type {
  AuctionView,
  CardDetail,
  CardList,
  CardView,
  CollectionView,
  Lang,
  MeView,
  PullView,
  TradeView,
} from '@wm/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new HttpError(res.status, body?.message ?? res.statusText, body);
  }
  return res.json() as Promise<T>;
}

export const api = {
  cards: (lang: Lang, params: Record<string, string | undefined>, offset: number) => {
    const q = new URLSearchParams({ lang, offset: String(offset), limit: '48' });
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return request<CardList>(`/cards?${q}`);
  },
  card: (lang: Lang, slug: string) => request<CardDetail>(`/cards/${encodeURIComponent(slug)}?lang=${lang}`),
  me: () => request<MeView>('/me'),
  open: (lang: Lang) => request<PullView>(`/boosters/open?lang=${lang}`, { method: 'POST' }),
  collection: (lang: Lang) => request<CollectionView>(`/collection?lang=${lang}`),
  recycle: () => request<{ gained: number; recycled: number; me: MeView }>('/collection/recycle', post({})),
  daily: () => request<{ gained: number; me: MeView }>('/daily', { method: 'POST' }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  auctions: (lang: Lang, view: string, rarity?: string) =>
    request<AuctionView[]>(`/market/auctions?view=${view}&lang=${lang}${rarity ? `&rarity=${rarity}` : ''}`),
  sell: (instanceId: string, startPrice: number) =>
    request('/market/auctions', post({ instanceId, startPrice })),
  bid: (id: string, amount: number) => request(`/market/auctions/${id}/bid`, post({ amount })),
  cancelAuction: (id: string) => request(`/market/auctions/${id}/cancel`, post({})),
  myFreeCards: (lang: Lang) => request<FreeCard[]>(`/market/mine?lang=${lang}`),
  players: (q: string) =>
    request<{ id: string; name: string; rating: number }[]>(`/market/players?q=${encodeURIComponent(q)}`),
  playerCards: (id: string, lang: Lang) =>
    request<{ name: string; cards: FreeCard[] }>(`/market/players/${id}/cards?lang=${lang}`),
  trades: (lang: Lang) => request<TradeView[]>(`/market/trades?lang=${lang}`),
  propose: (toId: string, offerIds: string[], askIds: string[]) =>
    request('/market/trades', post({ toId, offerIds, askIds })),
  decide: (id: string, action: 'accept' | 'decline' | 'cancel') =>
    request(`/market/trades/${id}/${action}`, post({})),
};

export type FreeCard = CardView & { instanceId: string };

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me });

/** Partage natif (mobile), sinon copie du lien. Rend true si le lien a été copié. */
export async function shareLink(title: string, url: string): Promise<boolean> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return false;
    }
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false; // partage annulé
  }
}

export function admin<T>(token: string, path: string, method = 'GET', body?: unknown) {
  return request<T>(`/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const langOf = (l: string): Lang => (l.startsWith('en') ? 'en' : 'fr');

export const providerName = (p: string) => ({ google: 'Google', discord: 'Discord' })[p] ?? p;
