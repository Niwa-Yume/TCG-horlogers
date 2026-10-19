export { botAnswer, botChoice, elo } from './bot';

// Moteur de duel : fonctions pures (state, action) => { state, events }, RNG semé, aucune dépendance.
// Le serveur fait autorité ; viewFor() rend ce qu'un joueur a le droit de voir.

export const CRITERIA = ['precision', 'complication', 'innovation', 'prestige', 'heritage'] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Seat = 0 | 1;

export const HAND_SIZE = 5;
export const RESERVE = 3;
export const WIN_SCORE = 3;
export const QUESTION_BONUS = 2;

export interface DuelCard {
  id: string;
  stats: Record<Criterion, number>;
  /** 0 = Gravure … 4 = Grand Feu (départage). */
  rarity: number;
  /** Questions vérifiées sur la carte (le texte reste au serveur). */
  questions: { id: string; answerIndex: number }[];
}

export interface DuelConfig {
  seed: string;
  cards: Record<string, DuelCard>;
  decks: [string[], string[]];
  /** Duel scénarisé : critères imposés, decks non mélangés. */
  script?: { criteria?: Criterion[]; noShuffle?: boolean };
}

export interface Pick {
  card: string;
  notches: number;
}

export interface PlayerState {
  deck: string[];
  hand: string[];
  reserve: number;
  score: number;
  pick: Pick | null;
  /** Phase question : la question posée et la réponse (null = pas encore ; -1 = temps écoulé). */
  question: { id: string; answer: number | null } | null;
}

export interface Table {
  cards: [string, string];
  notches: [number, number];
  values: [number, number];
}

export interface DuelState {
  cfg: DuelConfig;
  rng: number;
  /** Manches comptées (les manches rejouées ne comptent pas). */
  round: number;
  /** Nombre de manches jouées, rejouées comprises. */
  turn: number;
  criterion: Criterion;
  phase: 'choose' | 'question' | 'over';
  players: [PlayerState, PlayerState];
  table: Table | null;
  winner: Seat | null;
  endReason: 'score' | 'forfeit' | 'exhausted' | null;
}

export type Action =
  | { type: 'choose'; seat: Seat; card: string; notches: number }
  | { type: 'answer'; seat: Seat; index: number }
  /** Fin des 30 s (choix) ou des 10 s (question) : le serveur l'envoie à l'échéance. */
  | { type: 'timeout' }
  | { type: 'forfeit'; seat: Seat };

export type DuelEvent =
  | { type: 'roundStart'; round: number; turn: number; criterion: Criterion }
  | { type: 'locked'; seat: Seat }
  | { type: 'autoPick'; seat: Seat; card: string }
  | ({ type: 'reveal'; criterion: Criterion } & Table)
  | { type: 'question'; seat: Seat; questionId: string | null }
  | { type: 'answered'; seat: Seat; correct: boolean }
  | {
      type: 'roundEnd';
      winner: Seat | null;
      replay: boolean;
      totals: [number, number];
      decidedBy: 'value' | 'question' | 'rarity' | 'replay';
      score: [number, number];
    }
  | {
      type: 'matchEnd';
      winner: Seat | null;
      reason: 'score' | 'forfeit' | 'exhausted';
      score: [number, number];
    }
  | { type: 'error'; seat: Seat | null; message: string };

export interface Step {
  state: DuelState;
  events: DuelEvent[];
}

// ---------- RNG (mulberry32, état entier dans l'état du duel) ----------

function hash(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
  return (h << 13) | (h >>> 19);
}

/** Tire un entier dans [0, n) et fait avancer le RNG de l'état (mutation sur une copie). */
function rand(s: DuelState, n: number): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
}

const clone = (s: DuelState): DuelState => structuredClone(s);
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const scores = (s: DuelState): [number, number] => [s.players[0].score, s.players[1].score];

function refill(p: PlayerState) {
  while (p.hand.length < HAND_SIZE && p.deck.length) p.hand.push(p.deck.shift()!);
}

function startRound(s: DuelState, events: DuelEvent[]) {
  if (!s.players[0].hand.length || !s.players[1].hand.length) return end(s, events, 'exhausted');
  const scripted = s.cfg.script?.criteria?.[s.turn];
  s.criterion = scripted ?? CRITERIA[rand(s, CRITERIA.length)]!;
  s.phase = 'choose';
  s.table = null;
  for (const p of s.players) {
    p.pick = null;
    p.question = null;
  }
  events.push({ type: 'roundStart', round: s.round, turn: s.turn, criterion: s.criterion });
}

function end(
  s: DuelState,
  events: DuelEvent[],
  reason: 'score' | 'forfeit' | 'exhausted',
  winner?: Seat | null,
) {
  const [a, b] = scores(s);
  s.phase = 'over';
  s.winner = winner !== undefined ? winner : a === b ? null : a > b ? 0 : 1;
  s.endReason = reason;
  events.push({ type: 'matchEnd', winner: s.winner, reason, score: scores(s) });
}

export function init(cfg: DuelConfig): Step {
  const s: DuelState = {
    cfg,
    rng: hash(cfg.seed),
    round: 1,
    turn: 0,
    criterion: 'precision',
    phase: 'choose',
    players: [0, 1].map((): PlayerState => ({
      deck: [],
      hand: [],
      reserve: RESERVE,
      score: 0,
      pick: null,
      question: null,
    })) as [PlayerState, PlayerState],
    table: null,
    winner: null,
    endReason: null,
  };
  cfg.decks.forEach((deck, i) => {
    const d = [...deck];
    if (!cfg.script?.noShuffle)
      for (let k = d.length - 1; k > 0; k--) {
        const j = rand(s, k + 1);
        [d[k], d[j]] = [d[j]!, d[k]!];
      }
    s.players[i]!.deck = d;
    refill(s.players[i]!);
  });
  const events: DuelEvent[] = [];
  startRound(s, events);
  return { state: s, events };
}

function reveal(s: DuelState, events: DuelEvent[]) {
  const [p0, p1] = s.players;
  const cards: [string, string] = [p0.pick!.card, p1.pick!.card];
  const notches: [number, number] = [p0.pick!.notches, p1.pick!.notches];
  const values = cards.map((c, i) => s.cfg.cards[c]!.stats[s.criterion] + notches[i]!) as [number, number];
  s.table = { cards, notches, values };
  s.players.forEach((p, i) => {
    p.reserve -= notches[i]!;
    p.hand = p.hand.filter((c) => c !== cards[i]);
  });
  events.push({ type: 'reveal', criterion: s.criterion, cards, notches, values });

  // question décisive : en cas d'égalité, et à 2-2
  const decisive = p0.score === WIN_SCORE - 1 && p1.score === WIN_SCORE - 1;
  if (values[0] !== values[1] && !decisive) return resolve(s, events);
  let asked = false;
  s.players.forEach((p, i) => {
    const qs = s.cfg.cards[cards[i]!]!.questions;
    const q = qs.length ? qs[rand(s, qs.length)]! : null;
    p.question = q ? { id: q.id, answer: null } : null;
    asked ||= !!q;
    events.push({ type: 'question', seat: i as Seat, questionId: q?.id ?? null });
  });
  if (!asked) return resolve(s, events);
  s.phase = 'question';
}

function correct(s: DuelState, seat: Seat) {
  const p = s.players[seat];
  if (!p.question || p.question.answer == null) return false;
  const q = s.cfg.cards[s.table!.cards[seat]]!.questions.find((x) => x.id === p.question!.id);
  return q?.answerIndex === p.question.answer;
}

function resolve(s: DuelState, events: DuelEvent[]) {
  const t = s.table!;
  const asked = s.players.some((p) => p.question);
  const totals = t.values.map((v, i) => v + (correct(s, i as Seat) ? QUESTION_BONUS : 0)) as [number, number];
  let winner: Seat | null = null;
  let decidedBy: 'value' | 'question' | 'rarity' | 'replay' = 'value';
  if (totals[0] !== totals[1]) {
    winner = totals[0] > totals[1] ? 0 : 1;
    if (asked && t.values[0] === t.values[1]) decidedBy = 'question';
    else if (asked && (t.values[0] > t.values[1] ? 0 : 1) !== winner) decidedBy = 'question';
  } else {
    const r = t.cards.map((c) => s.cfg.cards[c]!.rarity);
    if (r[0] !== r[1]) {
      winner = r[0]! > r[1]! ? 0 : 1;
      decidedBy = 'rarity';
    } else decidedBy = 'replay';
  }
  if (winner != null) s.players[winner].score++;
  events.push({ type: 'roundEnd', winner, replay: winner == null, totals, decidedBy, score: scores(s) });

  for (const p of s.players) refill(p);
  s.turn++;
  if (winner != null) {
    if (s.players[winner].score >= WIN_SCORE) return end(s, events, 'score', winner);
    s.round++;
  }
  startRound(s, events);
}

export function step(prev: DuelState, action: Action): Step {
  const events: DuelEvent[] = [];
  const fail = (seat: Seat | null, message: string): Step => ({
    state: prev,
    events: [{ type: 'error', seat, message }],
  });
  if (prev.phase === 'over') return fail(null, 'Partie terminée');
  const s = clone(prev);

  switch (action.type) {
    case 'forfeit':
      end(s, events, 'forfeit', other(action.seat));
      return { state: s, events };

    case 'choose': {
      const p = s.players[action.seat];
      if (s.phase !== 'choose') return fail(action.seat, 'Pas le moment de choisir');
      if (p.pick) return fail(action.seat, 'Choix déjà verrouillé');
      if (!p.hand.includes(action.card)) return fail(action.seat, 'Carte absente de la main');
      if (!Number.isInteger(action.notches) || action.notches < 0 || action.notches > p.reserve)
        return fail(action.seat, 'Crans invalides');
      p.pick = { card: action.card, notches: action.notches };
      events.push({ type: 'locked', seat: action.seat });
      if (s.players.every((x) => x.pick)) reveal(s, events);
      return { state: s, events };
    }

    case 'answer': {
      const p = s.players[action.seat];
      if (s.phase !== 'question' || !p.question) return fail(action.seat, 'Pas de question pour toi');
      if (p.question.answer != null) return fail(action.seat, 'Réponse déjà donnée');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index > 3)
        return fail(action.seat, 'Réponse invalide');
      p.question.answer = action.index;
      events.push({ type: 'answered', seat: action.seat, correct: correct(s, action.seat) });
      if (s.players.every((x) => !x.question || x.question.answer != null)) resolve(s, events);
      return { state: s, events };
    }

    case 'timeout':
      if (s.phase === 'choose') {
        // sans choix : carte au hasard, 0 cran
        s.players.forEach((p, i) => {
          if (p.pick) return;
          p.pick = { card: p.hand[rand(s, p.hand.length)]!, notches: 0 };
          events.push({ type: 'autoPick', seat: i as Seat, card: p.pick.card });
        });
        reveal(s, events);
      } else {
        s.players.forEach((p, i) => {
          if (p.question && p.question.answer == null) {
            p.question.answer = -1;
            events.push({ type: 'answered', seat: i as Seat, correct: false });
          }
        });
        resolve(s, events);
      }
      return { state: s, events };
  }
}

/** Ce qu'un joueur voit : sa main, sa question (sans la réponse), le reste de l'adversaire seulement s'il est public. */
export function viewFor(s: DuelState, seat: Seat) {
  const me = s.players[seat];
  const op = s.players[other(seat)];
  return {
    seat,
    round: s.round,
    turn: s.turn,
    criterion: s.criterion,
    phase: s.phase,
    winner: s.winner,
    endReason: s.endReason,
    table: s.table, // public : la dernière révélation
    me: {
      hand: me.hand,
      deckCount: me.deck.length,
      reserve: me.reserve,
      score: me.score,
      pick: me.pick,
      question: me.question && { id: me.question.id, answered: me.question.answer != null },
    },
    opponent: {
      handCount: op.hand.length,
      deckCount: op.deck.length,
      reserve: op.reserve,
      score: op.score,
      locked: !!op.pick,
      answering: !!op.question && op.question.answer == null,
    },
  };
}
export type DuelView = ReturnType<typeof viewFor>;
