// L'automate (adversaire de secours après 20 s d'attente) et le classement Elo.
import type { Criterion, DuelCard } from './index';

/** Meilleure carte sur le critère (20 % de hasard) ; crans : 2 aux moments décisifs, sinon 1 de temps en temps. */
export function botChoice(
  hand: string[],
  reserve: number,
  decisive: boolean,
  cards: Record<string, DuelCard>,
  criterion: Criterion,
  rnd: () => number,
) {
  const best = [...hand].sort((a, b) => cards[b]!.stats[criterion] - cards[a]!.stats[criterion])[0]!;
  const card = rnd() < 0.2 ? hand[Math.floor(rnd() * hand.length)]! : best;
  const notches = Math.min(reserve, decisive ? 2 : rnd() < 0.25 ? 1 : 0);
  return { card, notches };
}

/** Bonne réponse 6 fois sur 10. */
export const botAnswer = (answerIndex: number, rnd: () => number) =>
  rnd() < 0.6 ? answerIndex : (answerIndex + 1 + Math.floor(rnd() * 3)) % 4;

/** Elo simple, K = 32. scoreA : 1 victoire, 0,5 nul, 0 défaite. */
export function elo(ra: number, rb: number, scoreA: number, k = 32): [number, number] {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const d = Math.round(k * (scoreA - ea));
  return [ra + d, rb - d];
}
