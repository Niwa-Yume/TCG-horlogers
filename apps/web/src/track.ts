// Umami auto-hébergé : chargé seulement si VITE_UMAMI_WEBSITE_ID et VITE_UMAMI_SRC sont définis.
declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

const queue: [string, Record<string, unknown> | undefined][] = [];

export function track(event: string, data?: Record<string, unknown>) {
  if (window.umami) window.umami.track(event, data);
  else queue.push([event, data]);
}

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* navigation privée */
  }
};

/** Une seule fois par appareil. */
export function once(key: string, fn: () => void) {
  if (get(key)) return;
  set(key, '1');
  fn();
}

export const secondsSinceFirstVisit = () =>
  Math.round((Date.now() - Number(get('wm-first-visit') ?? Date.now())) / 1000);

export function initAnalytics() {
  if (!get('wm-first-visit')) {
    set('wm-first-visit', String(Date.now()));
    track('first_visit');
  }
  const id = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  const src = import.meta.env.VITE_UMAMI_SRC;
  if (!id || !src) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = src;
  s.dataset.websiteId = id;
  s.onload = () => queue.splice(0).forEach(([e, d]) => window.umami?.track(e, d));
  document.head.append(s);
}
