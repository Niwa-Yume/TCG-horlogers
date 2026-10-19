// Gestionnaire de sons : préchargement, déblocage au premier geste, muet mémorisé, sous-titre visuel pour chaque son.
// Les fichiers se remplacent par de vrais enregistrements sous les mêmes noms (assets/sounds/mp3).

export const SOUNDS = [
  'cliquet',
  'armage',
  'ressort',
  'tic',
  'tac',
  'timbre',
  'repetition-minutes',
  'revelation',
] as const;
export type SoundName = (typeof SOUNDS)[number];

export interface SoundState {
  muted: boolean;
  /** Dernier son joué, pour le sous-titre visuel (affiché même en muet : le son n'est jamais seul porteur d'information). */
  caption: { name: SoundName; at: number } | null;
}

const KEY = 'wm-muted';
const files = new Map<SoundName, Promise<ArrayBuffer | null>>();
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let base = '/sounds/';
let state: SoundState = { muted: read(), caption: null };

function read() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function set(next: Partial<SoundState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function buffer(name: SoundName) {
  if (!ctx) return Promise.resolve(null);
  if (!buffers.has(name)) {
    const c = ctx;
    buffers.set(
      name,
      fetchFile(name).then((b) => (b ? c.decodeAudioData(b.slice(0)).catch(() => null) : null)),
    );
  }
  return buffers.get(name)!;
}

function fetchFile(name: SoundName) {
  if (!files.has(name))
    files.set(
      name,
      fetch(`${base}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    );
  return files.get(name)!;
}

function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    SOUNDS.forEach((s) => void buffer(s));
  } catch {
    ctx = null;
  }
}

export const sound = {
  /** À appeler une fois au démarrage : précharge les fichiers et attend le premier geste pour ouvrir l'audio. */
  init(path = '/sounds/') {
    base = path;
    SOUNDS.forEach((s) => void fetchFile(s));
    for (const ev of ['pointerdown', 'keydown'] as const)
      addEventListener(ev, unlock, { once: true, capture: true, passive: true });
  },
  play(name: SoundName) {
    set({ caption: { name, at: Date.now() } });
    if (state.muted) return;
    unlock();
    void buffer(name).then((b) => {
      if (!b || !ctx || state.muted) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start();
    });
  },
  setMuted(muted: boolean) {
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
    set({ muted });
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  get: () => state,
};
