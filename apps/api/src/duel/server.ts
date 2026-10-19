// Duel en direct (Socket.IO, chemin /api/socket.io) : file d'attente, parties, minuteurs, automate, reconnexion.
// Le serveur fait autorité : chaque client ne reçoit que viewFor() de son siège, sa main et les cartes posées.
import { randomInt, randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Card, PrismaClient } from '@prisma/client';
import {
  botAnswer,
  botChoice,
  elo,
  init,
  step,
  viewFor,
  type Action,
  type DuelCard,
  type DuelEvent,
  type DuelState,
  type Seat,
} from '@wm/engine';
import {
  DUEL_REACTIONS,
  DUEL_WIN_RUBIS,
  rarityRank,
  seededRandom,
  type DuelPayload,
  type Lang,
} from '@wm/shared';
import { langOf, toView } from '../card-view';
import { sessionUserId } from '../session';

const CHOOSE_MS = 30_000;
const QUESTION_MS = 10_000;
const REVEAL_PAUSE_MS = 3_500;
const BOT_AFTER_MS = 20_000;
const RECONNECT_MS = 30_000;
const REACTION_GAP_MS = 1_500;
export const DECK_SIZE = 10;
export const MIN_CARDS = 5;

interface SeatInfo {
  userId: string | null; // null : l'automate
  name: string;
  rating: number;
  lang: Lang;
  socket: Socket | null;
  reconnectBy: number | null;
  reconnectTimer?: NodeJS.Timeout;
  lastReaction: number;
}

interface Room {
  id: string;
  ranked: boolean;
  state: DuelState;
  seats: [SeatInfo, SeatInfo];
  cards: Map<string, Card>;
  questions: Map<string, { promptFr: string; promptEn: string; choicesFr: string[]; choicesEn: string[] }>;
  deadline: number | null;
  pauseUntil: number | null;
  timer?: NodeJS.Timeout;
  botTimer?: NodeJS.Timeout;
  log: DuelEvent[];
  result: [DuelPayload['result'], DuelPayload['result']];
  total: number;
}

interface Waiting {
  userId: string;
  socket: Socket;
  timer: NodeJS.Timeout;
}

const toDuelCard = (c: Card, qs: { id: string; answerIndex: number }[]): DuelCard => ({
  id: c.id,
  stats: {
    precision: c.precision,
    complication: c.complication,
    innovation: c.innovation,
    prestige: c.prestige,
    heritage: c.heritage,
  },
  rarity: rarityRank(c.rarity),
  questions: qs,
});
const power = (c: Card) => c.precision + c.complication + c.innovation + c.prestige + c.heritage;

/** Le deck d'un joueur : ses 10 cartes distinctes les plus fortes (deck automatique). */
export async function deckOf(db: PrismaClient, userId: string): Promise<Card[]> {
  const owned = await db.cardInstance.findMany({
    where: { ownerId: userId, lock: null, card: { status: 'ACTIVE' } }, // pas de carte en vente ou en échange
    include: { card: true },
  });
  const distinct = [...new Map(owned.map((o) => [o.cardId, o.card])).values()];
  return distinct
    .sort((a, b) => power(b) - power(a) || rarityRank(b.rarity) - rarityRank(a.rarity))
    .slice(0, DECK_SIZE);
}

export class DuelServer {
  private io!: Server;
  private rooms = new Map<string, Room>();
  private byUser = new Map<string, string>(); // userId → roomId
  private waiting: Waiting | null = null;

  constructor(private db: PrismaClient) {}

  attach(http: HttpServer) {
    this.io = new Server(http, { path: '/api/socket.io', serveClient: false });
    this.io.on('connection', (socket) => void this.connect(socket).catch((e) => this.fail(socket, e)));
  }

  private deckOf(userId: string) {
    return deckOf(this.db, userId);
  }

  private async connect(socket: Socket) {
    const userId = await sessionUserId(socket.request);
    const lang = langOf(socket.handshake.query.lang);
    if (!userId) {
      socket.emit('duel:error', { code: 'no-session' });
      return socket.disconnect(true);
    }
    socket.data = { userId, lang };

    // reconnexion à une partie en cours
    const room = this.rooms.get(this.byUser.get(userId) ?? '');
    if (room) {
      const seat = room.seats.find((s) => s.userId === userId)!;
      seat.socket?.disconnect(true);
      seat.socket = socket;
      seat.lang = lang;
      seat.reconnectBy = null;
      clearTimeout(seat.reconnectTimer);
      this.send(room, []);
    } else socket.emit('duel:idle');

    socket.on(
      'queue:join',
      (m: { bot?: boolean }) => void this.join(socket, !!m?.bot).catch((e) => this.fail(socket, e)),
    );
    socket.on('queue:leave', () => this.leaveQueue(userId));
    socket.on('duel:choose', (a: { card?: unknown; notches?: unknown }) =>
      this.act(userId, (seat) => ({
        type: 'choose',
        seat,
        card: String(a?.card),
        notches: Number(a?.notches),
      })),
    );
    socket.on('duel:answer', (a: { index?: unknown }) =>
      this.act(userId, (seat) => ({ type: 'answer', seat, index: Number(a?.index) })),
    );
    socket.on('duel:forfeit', () => this.act(userId, (seat) => ({ type: 'forfeit', seat })));
    socket.on('duel:react', (a: { index?: unknown }) => this.react(userId, Number(a?.index)));
    socket.on('disconnect', () => this.disconnect(userId, socket));
  }

  private fail(socket: Socket, e: unknown) {
    socket.emit('duel:error', { code: e instanceof Error ? e.message : 'error' });
  }

  private async join(socket: Socket, bot: boolean) {
    const userId = socket.data.userId as string;
    if (this.byUser.has(userId)) return;
    if ((await this.deckOf(userId)).length < MIN_CARDS) throw new Error('not-enough-cards');
    if (bot) return this.start([userId, null], [socket, null]);
    const other = this.waiting;
    if (other && other.userId !== userId) {
      clearTimeout(other.timer);
      this.waiting = null;
      return this.start([other.userId, userId], [other.socket, socket], true);
    }
    if (other) clearTimeout(other.timer);
    // personne ? l'automate prend le relais après 20 s
    this.waiting = {
      userId,
      socket,
      timer: setTimeout(() => {
        this.waiting = null;
        void this.start([userId, null], [socket, null]).catch((e) => this.fail(socket, e));
      }, BOT_AFTER_MS),
    };
    socket.emit('queue:waiting', { botAt: new Date(Date.now() + BOT_AFTER_MS).toISOString() });
  }

  private leaveQueue(userId: string) {
    if (this.waiting?.userId !== userId) return;
    clearTimeout(this.waiting.timer);
    this.waiting = null;
  }

  private async start(users: [string, string | null], sockets: [Socket, Socket | null], ranked = false) {
    const [a, b] = users;
    const deckA = await this.deckOf(a);
    // l'automate reçoit un deck de mêmes raretés, tiré au hasard dans le catalogue
    const deckB = b
      ? await this.deckOf(b)
      : await (async () => {
          const pool = await this.db.card.findMany({
            where: { status: 'ACTIVE', id: { notIn: deckA.map((c) => c.id) } },
          });
          return deckA.map((c) => {
            const same = pool.filter((p) => p.rarity === c.rarity);
            const pick = (same.length ? same : pool)[randomInt((same.length ? same : pool).length)]!;
            pool.splice(pool.indexOf(pick), 1);
            return pick;
          });
        })();
    const all = [...deckA, ...deckB];
    const qs = await this.db.question.findMany({
      where: { verified: true, cardId: { in: all.map((c) => c.id) } },
    });
    const users2 = await this.db.user.findMany({ where: { id: { in: [a, ...(b ? [b] : [])] } } });
    const seat = (id: string | null, socket: Socket | null): SeatInfo => {
      const u = users2.find((x) => x.id === id);
      return {
        userId: id,
        name: u?.displayName ?? 'Automate Jaquet-Droz',
        rating: u?.rating ?? 1000,
        lang: socket ? (socket.data.lang as Lang) : 'fr',
        socket,
        reconnectBy: null,
        lastReaction: 0,
      };
    };
    const seed = randomUUID();
    const { state, events } = init({
      seed,
      cards: Object.fromEntries(
        all.map((c) => [
          c.id,
          toDuelCard(
            c,
            qs.filter((q) => q.cardId === c.id),
          ),
        ]),
      ),
      decks: [deckA.map((c) => c.id), deckB.map((c) => c.id)],
    });
    const room: Room = {
      id: seed,
      ranked,
      state,
      seats: [seat(a, sockets[0]), seat(b, sockets[1])],
      cards: new Map(all.map((c) => [c.id, c])),
      questions: new Map(qs.map((q) => [q.id, q])),
      deadline: null,
      pauseUntil: null,
      log: [],
      result: [null, null],
      total: await this.db.card.count({ where: { status: 'ACTIVE' } }),
    };
    this.rooms.set(room.id, room);
    for (const u of users) if (u) this.byUser.set(u, room.id);
    this.advance(room, events, 1_500);
  }

  private act(userId: string, make: (seat: Seat) => Action) {
    const room = this.rooms.get(this.byUser.get(userId) ?? '');
    if (!room) return;
    const seat = room.seats.findIndex((s) => s.userId === userId) as Seat;
    this.apply(room, make(seat));
  }

  private apply(room: Room, action: Action) {
    const r = step(room.state, action);
    if (r.events[0]?.type === 'error') {
      const seat = r.events[0].seat;
      if (seat != null) room.seats[seat].socket?.emit('duel:error', { code: r.events[0].message });
      return;
    }
    room.state = r.state;
    this.advance(room, r.events, REVEAL_PAUSE_MS);
  }

  /** Après chaque pas : minuteurs, automate, envoi ; fin de partie le cas échéant. */
  private advance(room: Room, events: DuelEvent[], pause: number) {
    room.log.push(...events);
    clearTimeout(room.timer);
    clearTimeout(room.botTimer);
    const s = room.state;
    if (s.phase === 'over') {
      room.deadline = room.pauseUntil = null;
      return void this.finish(room, events).catch((e) => console.error('duel: enregistrement impossible', e));
    }
    const newRound = events.some((e) => e.type === 'roundStart');
    if (s.phase === 'choose' && newRound) {
      room.pauseUntil = Date.now() + pause;
      room.deadline = room.pauseUntil + CHOOSE_MS;
    } else if (s.phase === 'question' && events.some((e) => e.type === 'question')) {
      room.pauseUntil = Date.now() + 1_500;
      room.deadline = room.pauseUntil + QUESTION_MS;
    }
    if (room.deadline)
      room.timer = setTimeout(() => this.apply(room, { type: 'timeout' }), room.deadline - Date.now());
    this.scheduleBot(room);
    this.send(room, events);
  }

  private scheduleBot(room: Room) {
    const seat = room.seats.findIndex((x) => x.userId === null) as Seat | -1;
    if (seat === -1) return;
    const s = room.state;
    const p = s.players[seat];
    const rnd = seededRandom(`${room.id}:${s.turn}:${s.phase}`);
    const wait = Math.max(0, (room.pauseUntil ?? 0) - Date.now()) + 2_000 + rnd() * 4_000;
    if (s.phase === 'choose' && !p.pick) {
      const decisive = s.players.some((x) => x.score === 2);
      const pick = botChoice(p.hand, p.reserve, decisive, s.cfg.cards, s.criterion, rnd);
      room.botTimer = setTimeout(() => this.apply(room, { type: 'choose', seat, ...pick }), wait);
    } else if (s.phase === 'question' && p.question && p.question.answer == null) {
      const q = s.cfg.cards[s.table!.cards[seat]]!.questions.find((x) => x.id === p.question!.id)!;
      room.botTimer = setTimeout(
        () => this.apply(room, { type: 'answer', seat, index: botAnswer(q.answerIndex, rnd) }),
        wait,
      );
    }
  }

  private payload(room: Room, seat: Seat, events: DuelEvent[]): DuelPayload {
    const s = room.state;
    const me = room.seats[seat];
    const v = viewFor(s, seat);
    const L = me.lang;
    const visible = new Set([
      ...v.me.hand,
      ...(v.table?.cards ?? []),
      ...(v.me.pick ? [v.me.pick.card] : []),
    ]);
    for (const e of events) if (e.type === 'reveal') e.cards.forEach((c) => visible.add(c));
    const q = v.me.question && !v.me.question.answered ? room.questions.get(v.me.question.id) : null;
    const info = (x: SeatInfo) => ({
      name: x.name,
      rating: x.rating,
      bot: x.userId === null,
      connected: x.userId === null || !!x.socket,
      reconnectBy: x.reconnectBy ? new Date(x.reconnectBy).toISOString() : null,
    });
    return {
      id: room.id,
      ranked: room.ranked,
      view: v,
      deadline: room.deadline ? new Date(room.deadline).toISOString() : null,
      pauseUntil: room.pauseUntil ? new Date(room.pauseUntil).toISOString() : null,
      me: info(me),
      opponent: info(room.seats[seat === 0 ? 1 : 0]),
      cards: Object.fromEntries([...visible].map((id) => [id, toView(room.cards.get(id)!, L, room.total)])),
      question: q
        ? { prompt: L === 'fr' ? q.promptFr : q.promptEn, choices: L === 'fr' ? q.choicesFr : q.choicesEn }
        : null,
      // l'adversaire ne voit pas quelle carte l'automate a tirée au hasard avant la révélation
      events: events.filter((e) => e.type !== 'autoPick' || e.seat === seat),
      result: room.result[seat],
    };
  }

  private send(room: Room, events: DuelEvent[]) {
    room.seats.forEach((x, i) => x.socket?.emit('duel:state', this.payload(room, i as Seat, events)));
  }

  private react(userId: string, index: number) {
    const room = this.rooms.get(this.byUser.get(userId) ?? '');
    if (!room || !Number.isInteger(index) || index < 0 || index >= DUEL_REACTIONS) return;
    const me = room.seats.find((s) => s.userId === userId)!;
    if (Date.now() - me.lastReaction < REACTION_GAP_MS) return;
    me.lastReaction = Date.now();
    room.seats.find((s) => s !== me)?.socket?.emit('duel:reaction', { index });
  }

  private disconnect(userId: string, socket: Socket) {
    if (this.waiting?.socket === socket) this.leaveQueue(userId);
    const room = this.rooms.get(this.byUser.get(userId) ?? '');
    if (!room) return;
    const seat = room.seats.findIndex((s) => s.userId === userId) as Seat;
    const me = room.seats[seat];
    if (me.socket !== socket) return; // déjà remplacé par une reconnexion
    me.socket = null;
    me.reconnectBy = Date.now() + RECONNECT_MS;
    // 30 s pour revenir, sinon défaite
    me.reconnectTimer = setTimeout(() => this.apply(room, { type: 'forfeit', seat }), RECONNECT_MS);
    this.send(room, []);
  }

  private async finish(room: Room, events: DuelEvent[]) {
    const s = room.state;
    for (const x of room.seats) {
      clearTimeout(x.reconnectTimer);
      if (x.userId) this.byUser.delete(x.userId);
    }
    this.rooms.delete(room.id);
    const [a, b] = room.seats;
    const winnerId = s.winner == null ? null : room.seats[s.winner].userId;
    try {
      await this.db.$transaction(async (tx) => {
        await tx.match.create({
          data: { playerA: a.userId!, playerB: b.userId, winnerId, seed: room.id, log: room.log as object[] },
        });
        if (!room.ranked || !a.userId || !b.userId) return;
        // Elo et récompense : entre joueurs seulement
        const [ra, rb] = elo(a.rating, b.rating, s.winner == null ? 0.5 : s.winner === 0 ? 1 : 0);
        await tx.user.update({ where: { id: a.userId }, data: { rating: ra } });
        await tx.user.update({ where: { id: b.userId }, data: { rating: rb } });
        room.result = [
          { ratingDelta: ra - a.rating, rubis: s.winner === 0 ? DUEL_WIN_RUBIS : 0 },
          { ratingDelta: rb - b.rating, rubis: s.winner === 1 ? DUEL_WIN_RUBIS : 0 },
        ];
        if (winnerId) {
          await tx.user.update({ where: { id: winnerId }, data: { rubis: { increment: DUEL_WIN_RUBIS } } });
          await tx.ledgerEntry.create({
            data: { userId: winnerId, delta: DUEL_WIN_RUBIS, reason: 'DUEL_WIN' },
          });
        }
      });
    } finally {
      if (!room.result[0])
        room.result = [
          { ratingDelta: 0, rubis: 0 },
          { ratingDelta: 0, rubis: 0 },
        ];
      this.send(room, events);
    }
  }
}
