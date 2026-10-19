import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  init,
  step,
  viewFor,
  type Criterion,
  type DuelCard,
  type DuelConfig,
  type DuelState,
  type Seat,
} from './index';

// Cartes de test : la valeur est la même sur tous les critères, pour lire les scénarios d'un coup d'œil.
const card = (id: string, v: number, rarity = 0, answer?: number): DuelCard => ({
  id,
  stats: Object.fromEntries(CRITERIA.map((c) => [c, v])) as Record<Criterion, number>,
  rarity,
  questions: answer == null ? [] : [{ id: `q-${id}`, answerIndex: answer }],
});

function setup(a: DuelCard[], b: DuelCard[], extra: Partial<DuelConfig> = {}) {
  const cards = Object.fromEntries([...a, ...b].map((c) => [c.id, c]));
  return init({
    seed: 's',
    cards,
    decks: [a.map((c) => c.id), b.map((c) => c.id)],
    script: { noShuffle: true },
    ...extra,
  });
}
const play = (s: DuelState, seat: Seat, card: string, notches = 0) =>
  step(s, { type: 'choose', seat, card, notches });
const both = (s: DuelState, a: string, b: string, na = 0, nb = 0) => play(play(s, 0, a, na).state, 1, b, nb);

const five = (p: string, v: number, rarity = 0, answer?: number) =>
  Array.from({ length: 5 }, (_, i) => card(`${p}${i}`, v, rarity, answer));

describe('manche', () => {
  it('la valeur la plus haute gagne, les cartes sont défaussées, les crans perdus', () => {
    let { state } = setup(five('a', 7), five('b', 6));
    const r = both(state, 'a0', 'b0', 1, 0);
    state = r.state;
    expect(r.events.find((e) => e.type === 'reveal')).toMatchObject({ values: [8, 6], notches: [1, 0] });
    expect(r.events.find((e) => e.type === 'roundEnd')).toMatchObject({
      winner: 0,
      decidedBy: 'value',
      score: [1, 0],
    });
    expect(state.players[0].hand).not.toContain('a0');
    expect(state.players[0].reserve).toBe(2);
    expect(state.round).toBe(2);
  });

  it('les crans font passer devant, sans dépasser la réserve', () => {
    const { state } = setup(five('a', 5), five('b', 6));
    expect(both(state, 'a0', 'b0', 2, 0).events.find((e) => e.type === 'roundEnd')).toMatchObject({
      winner: 0,
    });
    expect(play(state, 0, 'a0', 4).events[0]).toMatchObject({ type: 'error', message: 'Crans invalides' });
    expect(play(state, 0, 'b0').events[0]).toMatchObject({ type: 'error' });
  });

  it('le choix adverse reste secret jusqu’à la révélation', () => {
    const { state } = setup(five('a', 5), five('b', 6));
    const v = viewFor(play(state, 0, 'a0', 2).state, 1);
    expect(v.opponent.locked).toBe(true);
    expect(JSON.stringify(v)).not.toContain('a0');
  });
});

describe('égalités', () => {
  it('égalité sans question : la rareté la plus haute gagne', () => {
    const { state } = setup(five('a', 6, 3), five('b', 6, 1));
    expect(both(state, 'a0', 'b0').events.find((e) => e.type === 'roundEnd')).toMatchObject({
      winner: 0,
      decidedBy: 'rarity',
    });
  });

  it('égalité parfaite : manche rejouée, non comptée, nouvelles cartes piochées', () => {
    const deckA = [...five('a', 6), ...five('x', 6)];
    const deckB = [...five('b', 6), ...five('y', 6)];
    const { state } = setup(deckA, deckB);
    const r = both(state, 'a0', 'b0');
    expect(r.events.find((e) => e.type === 'roundEnd')).toMatchObject({
      winner: null,
      replay: true,
      score: [0, 0],
    });
    expect(r.state.round).toBe(1);
    expect(r.state.turn).toBe(1);
    expect(r.state.players[0].hand).toHaveLength(5);
    expect(r.state.players[0].hand).toContain('x0');
  });

  it('égalité avec questions : la bonne réponse donne +2', () => {
    const { state } = setup(five('a', 6, 0, 1), five('b', 6, 0, 2));
    let r = both(state, 'a0', 'b0');
    expect(r.state.phase).toBe('question');
    expect(viewFor(r.state, 0).me.question).toEqual({ id: 'q-a0', answered: false });
    expect(JSON.stringify(viewFor(r.state, 0))).not.toContain('answerIndex');
    r = step(r.state, { type: 'answer', seat: 0, index: 1 });
    r = step(r.state, { type: 'answer', seat: 1, index: 0 });
    expect(r.events.find((e) => e.type === 'roundEnd')).toMatchObject({
      winner: 0,
      decidedBy: 'question',
      totals: [8, 6],
    });
  });
});

describe('manche décisive à 2-2', () => {
  // a gagne deux manches, b deux manches, puis la cinquième se joue avec question
  function twoAll() {
    const a = [card('a0', 9), card('a1', 9), card('a2', 1), card('a3', 1), card('a4', 5, 0, 0)];
    const b = [card('b0', 1), card('b1', 1), card('b2', 9), card('b3', 9), card('b4', 6, 0, 3)];
    let s = setup(a, b).state;
    for (const [x, y] of [
      ['a0', 'b0'],
      ['a1', 'b1'],
      ['a2', 'b2'],
      ['a3', 'b3'],
    ])
      s = both(s, x!, y!).state;
    expect([s.players[0].score, s.players[1].score]).toEqual([2, 2]);
    return s;
  }

  it('pose une question même sans égalité, et la bonne réponse peut renverser la manche', () => {
    let r = both(twoAll(), 'a4', 'b4');
    expect(r.state.phase).toBe('question');
    r = step(r.state, { type: 'answer', seat: 0, index: 0 });
    r = step(r.state, { type: 'timeout' });
    expect(r.events).toContainEqual({ type: 'answered', seat: 1, correct: false });
    expect(r.events.find((e) => e.type === 'roundEnd')).toMatchObject({
      winner: 0,
      totals: [7, 6],
      decidedBy: 'question',
    });
    expect(r.events.at(-1)).toMatchObject({ type: 'matchEnd', winner: 0, reason: 'score', score: [3, 2] });
    expect(r.state.phase).toBe('over');
  });
});

describe('fin de partie', () => {
  it('premier à 3 manches', () => {
    let s = setup(five('a', 9), five('b', 1)).state;
    for (let i = 0; i < 3; i++) s = both(s, `a${i}`, `b${i}`).state;
    expect([s.phase, s.winner, s.endReason]).toEqual(['over', 0, 'score']);
    expect(play(s, 0, 'a3').events[0]).toMatchObject({ type: 'error' });
  });

  it('abandon (et déconnexion non rattrapée, que le serveur traduit en abandon)', () => {
    const { state } = setup(five('a', 9), five('b', 1));
    const r = step(state, { type: 'forfeit', seat: 0 });
    expect(r.events.at(-1)).toMatchObject({ type: 'matchEnd', winner: 1, reason: 'forfeit' });
  });
});

describe('temps écoulé', () => {
  it('sans choix : carte au hasard de la main et 0 cran ; le choix déjà verrouillé est gardé', () => {
    const { state } = setup(five('a', 5), five('b', 5));
    const r = step(play(state, 0, 'a2', 1).state, { type: 'timeout' });
    const auto = r.events.find((e) => e.type === 'autoPick');
    expect(auto).toMatchObject({ seat: 1 });
    expect(r.events.find((e) => e.type === 'reveal')).toMatchObject({
      cards: ['a2', expect.stringMatching(/^b/)],
      notches: [1, 0],
    });
  });
});

describe('déterminisme', () => {
  const deck = (p: string) =>
    Array.from({ length: 10 }, (_, i) => card(`${p}${i}`, ((i * 7) % 10) + 1, i % 5, i % 4));
  const run = (seed: string) => {
    const a = deck('a'),
      b = deck('b');
    let r = init({
      seed,
      cards: Object.fromEntries([...a, ...b].map((c) => [c.id, c])),
      decks: [a.map((c) => c.id), b.map((c) => c.id)],
    });
    const log = [...r.events];
    for (let i = 0; i < 40 && r.state.phase !== 'over'; i++) {
      r = step(r.state, { type: 'timeout' });
      log.push(...r.events);
    }
    return { log, state: r.state };
  };
  it('même graine, même partie ; graine différente, autre partie', () => {
    expect(run('x')).toEqual(run('x'));
    expect(run('x').log).not.toEqual(run('y').log);
    expect(run('x').state.phase).toBe('over');
  });

  it('critères imposés par le scénario', () => {
    const r = setup(five('a', 9), five('b', 1), {
      script: { criteria: ['heritage', 'precision'], noShuffle: true },
    });
    expect(r.state.criterion).toBe('heritage');
    expect(both(r.state, 'a0', 'b0').state.criterion).toBe('precision');
  });
});

it('ne mute jamais l’état reçu', () => {
  const { state } = setup(five('a', 5), five('b', 6));
  const copy = structuredClone(state);
  both(state, 'a0', 'b0', 1);
  expect(state).toEqual(copy);
});
