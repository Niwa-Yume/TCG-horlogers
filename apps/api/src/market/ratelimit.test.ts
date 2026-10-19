import { expect, it } from 'vitest';
import { Window } from './ratelimit';

it('laisse passer N actions par minute, puis refuse jusqu’à ce que la fenêtre glisse', () => {
  const w = new Window(3);
  const t = 1_000_000;
  expect([w.hit('a', t), w.hit('a', t + 1), w.hit('a', t + 2), w.hit('a', t + 3)]).toEqual([
    true,
    true,
    true,
    false,
  ]);
  expect(w.hit('b', t + 3)).toBe(true); // une autre clé n'est pas touchée
  expect(w.hit('a', t + 60_001)).toBe(true);
});
