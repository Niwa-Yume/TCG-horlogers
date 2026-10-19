// Tirage d'un booster : rareté selon BOOSTER_ODDS, carte au hasard dans la rareté, sans doublon dans le paquet.
import { BOOSTER_ODDS, BOOSTER_SIZE, RARITIES, rarityRank, type Rarity } from '@wm/shared';

export interface PoolCard {
  id: string;
  rarity: Rarity;
}

/** `randInt(n)` rend un entier uniforme dans [0, n) ; en production : crypto.randomInt. */
export function drawBooster(
  pool: PoolCard[],
  randInt: (n: number) => number,
  guarantee?: Rarity,
): PoolCard[] {
  const left = new Map<Rarity, PoolCard[]>(RARITIES.map((r) => [r, pool.filter((c) => c.rarity === r)]));
  const take = (wanted: Rarity): PoolCard | null => {
    // rareté vide : on descend d'un cran, puis on remonte
    const order = [
      ...RARITIES.slice(0, rarityRank(wanted) + 1).reverse(),
      ...RARITIES.slice(rarityRank(wanted) + 1),
    ];
    for (const r of order) {
      const bucket = left.get(r)!;
      if (bucket.length) return bucket.splice(randInt(bucket.length), 1)[0]!;
    }
    return null;
  };
  const rollRarity = (): Rarity => {
    let x = randInt(10_000);
    for (const r of RARITIES) if ((x -= Math.round(BOOSTER_ODDS[r] * 10_000)) < 0) return r;
    return 'GRAVURE';
  };

  const cards: PoolCard[] = [];
  for (let i = 0; i < BOOSTER_SIZE; i++) {
    const c = take(rollRarity());
    if (c) cards.push(c);
  }
  cards.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
  if (guarantee && cards.length && rarityRank(cards.at(-1)!.rarity) < rarityRank(guarantee)) {
    const best = take(guarantee);
    if (best && rarityRank(best.rarity) >= rarityRank(guarantee)) cards.splice(0, 1, best);
    cards.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
  }
  return cards; // la plus rare en dernier : elle se révèle à la fin
}
