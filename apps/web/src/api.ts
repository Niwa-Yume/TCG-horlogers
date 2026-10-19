import type { CardDetail, CardList, Lang } from '@wm/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new HttpError(res.status, body?.message ?? res.statusText);
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
};

export function admin<T>(token: string, path: string, method = 'GET', body?: unknown) {
  return request<T>(`/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const langOf = (l: string): Lang => (l.startsWith('en') ? 'en' : 'fr');
