import { dayDemand } from './LocationSystem';
import { effectsOf } from './UpgradeSystem';
import { DEMAND_CONFIG } from '../config/demandConfig';
import { GAME_CONFIG } from '../config/gameConfig';
import type { GameState } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import type { CustomerTypeDef } from '../data/customers';
import type { Point } from '../iso/IsoMath';
import type { CustomerAnchors, SeatAnchor } from '../world/MapData';
import { SeededRandom } from '../utils/random';
import { activeAdEffect } from './AdvertisingSystem';
import { arrivalChancePerMinute, planCustomer, type CustomerPlan, type DemandModifiers } from './DemandSystem';
import type { OrderOutcome } from './SalesSystem';

/**
 * Simulasi berjualan tanpa ketergantungan Phaser (bisa diuji di Node):
 * jam berjalan, rombongan pelanggan datang, mencari kursi atau mengantre, memesan,
 * makan, lalu pergi. Perubahan data (penjualan) dilakukan lewat callback ke GameActions.
 */

export type GroupState = 'arriving' | 'queueing' | 'seating' | 'ordering' | 'eating' | 'leaving' | 'gone';
export type Emote = 'wait' | 'happy' | 'ok' | 'angry' | null;

export interface Member {
  readonly id: string;
  readonly groupId: number;
  readonly index: number;
  x: number;
  y: number;
  path: Point[];
  /** Menit permainan sebelum mulai berjalan (barisan rombongan). */
  delay: number;
  seat: SeatAnchor | null;
  sitting: boolean;
  moving: boolean;
  /** true jika arah gerak terakhir ke kiri layar (untuk membalik sprite). */
  facingLeft: boolean;
  gone: boolean;
}

export interface Group {
  readonly id: number;
  readonly plan: CustomerPlan;
  readonly members: Member[];
  state: GroupState;
  /** Menit permainan saat mulai menunggu tempat. */
  waitStart: number;
  /** Sisa menit untuk tahap saat ini (memesan / makan). */
  timer: number;
  outcome: OrderOutcome | null;
  emote: Emote;
  /** Produk yang sedang dinikmati (ikon gelembung). */
  showing: string | null;
  exitPath: Point[];
}

export type SimEvent =
  | { type: 'arrive'; group: Group }
  | { type: 'order'; group: Group; outcome: OrderOutcome }
  | { type: 'walk-away'; group: Group; reason: 'full' | 'impatient' | 'closing' }
  | { type: 'pay'; group: Group; amount: number }
  | { type: 'gone'; group: Group }
  | { type: 'closed' }
  | { type: 'ended' };

export interface SimHooks {
  getState(): Readonly<GameState>;
  /** Selesaikan pesanan & terapkan penjualan; kembalikan hasilnya. */
  order(plan: CustomerPlan, waitedMinutes: number, rng: SeededRandom): OrderOutcome;
  walkAway(plan: CustomerPlan): void;
  /** Dipanggil setiap jam permainan bertambah 1 menit. */
  setClock(minutes: number): void;
}

export const SIM_CONFIG = {
  /** Menit permainan per detik nyata pada kecepatan 1×. */
  minutesPerSecond: 1.5,
  /** Kecepatan jalan (ubin per menit permainan). */
  walkSpeed: 1.6,
  /** Batas langkah simulasi agar tetap stabil saat frame tersendat (menit). */
  maxStep: 0.5,
  /** Setelah tutup, pelanggan yang belum dilayani diberi waktu ini untuk pergi. */
  closingGraceMinutes: 30,
} as const;

let memberSeq = 0;

export class SalesSimulation {
  readonly groups: Group[] = [];
  private readonly rng: SeededRandom;
  private clock: number;
  private lastWholeMinute: number;
  private closedAt: number | null = null;
  private ended = false;
  private nextGroupId = 1;
  private readonly occupied = new Set<string>();
  private queueOrder: number[] = [];

  constructor(
    private readonly anchors: CustomerAnchors,
    private readonly catalog: Catalog,
    private readonly types: readonly CustomerTypeDef[],
    private readonly hooks: SimHooks,
    options: { seed: string; startMinutes: number },
  ) {
    this.rng = new SeededRandom(options.seed);
    this.clock = options.startMinutes;
    this.lastWholeMinute = Math.floor(options.startMinutes);
  }

  get minutes(): number {
    return this.clock;
  }

  get isClosed(): boolean {
    return this.closedAt !== null;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get seatsTotal(): number {
    return this.anchors.seats.length;
  }

  get seatsTaken(): number {
    return this.occupied.size;
  }

  /** Majukan simulasi sejumlah menit permainan. */
  advance(gameMinutes: number): SimEvent[] {
    const events: SimEvent[] = [];
    let remaining = Math.max(0, gameMinutes);
    while (remaining > 0 && !this.ended) {
      const step = Math.min(SIM_CONFIG.maxStep, remaining);
      remaining -= step;
      this.step(step, events);
    }
    return events;
  }

  private step(dt: number, events: SimEvent[]): void {
    const close = GAME_CONFIG.dayCycle.closeMinutes;
    this.clock += dt;
    if (this.closedAt === null) this.clock = Math.min(this.clock, close);

    // Kedatangan: satu undian per menit permainan.
    while (this.lastWholeMinute + 1 <= Math.floor(this.clock)) {
      this.lastWholeMinute++;
      if (this.closedAt === null) {
        this.hooks.setClock(this.lastWholeMinute);
        const state = this.hooks.getState();
        if (this.lastWholeMinute < close && this.rng.chance(arrivalChancePerMinute(this.lastWholeMinute, state.player.popularity, modifiersOf(state)))) {
          events.push({ type: 'arrive', group: this.spawn() });
        }
      }
    }

    if (this.closedAt === null && this.clock >= close) {
      this.closedAt = this.clock;
      events.push({ type: 'closed' });
      for (const g of this.groups) {
        if (g.state === 'arriving' || g.state === 'queueing') {
          this.hooks.walkAway(g.plan);
          events.push({ type: 'walk-away', group: g, reason: 'closing' });
          this.leave(g, 'angry');
        }
      }
    }

    for (const group of this.groups) this.updateGroup(group, dt, events);
    for (let i = this.groups.length - 1; i >= 0; i--) if (this.groups[i]?.state === 'gone') this.groups.splice(i, 1);

    if (this.closedAt !== null && (this.groups.length === 0 || this.clock - this.closedAt > SIM_CONFIG.closingGraceMinutes)) {
      this.groups.length = 0;
      this.occupied.clear();
      this.ended = true;
      events.push({ type: 'ended' });
    }
  }

  private spawn(): Group {
    const state = this.hooks.getState();
    const plan = planCustomer(this.rng, this.types, state, this.catalog, this.lastWholeMinute, modifiersOf(state));
    const route = this.rng.pick(this.anchors.spawns);
    const id = this.nextGroupId++;
    const members: Member[] = [];
    for (let i = 0; i < plan.partySize; i++) {
      const start = route.path[0] as Point;
      members.push({
        id: `m${++memberSeq}`,
        groupId: id,
        index: i,
        x: start.x,
        y: start.y,
        path: [...route.path.slice(1), this.anchors.lotEntry].map((p, k) => (k === route.path.length - 1 ? jitter(p, i) : p)),
        delay: i * 0.7,
        seat: null,
        sitting: false,
        moving: false,
        facingLeft: false,
        gone: false,
      });
    }
    const exit = this.rng.pick(this.anchors.spawns);
    const group: Group = {
      id, plan, members, state: 'arriving', waitStart: 0, timer: 0, outcome: null, emote: null, showing: null,
      exitPath: [this.anchors.lotEntry, ...[...exit.path].reverse()],
    };
    this.groups.push(group);
    return group;
  }

  private freeSeats(count: number): SeatAnchor[] | null {
    const free = this.anchors.seats.filter((s) => !this.occupied.has(s.id));
    if (free.length < count) return null;
    // Rombongan duduk berdekatan: kelompokkan per area kursi (prefix id).
    const byArea = new Map<string, SeatAnchor[]>();
    for (const s of free) {
      const area = s.id.replace(/-\d+$/, '');
      byArea.set(area, [...(byArea.get(area) ?? []), s]);
    }
    for (const seats of byArea.values()) if (seats.length >= count) return seats.slice(0, count);
    return free.slice(0, count);
  }

  private tryTakeSeats(group: Group): boolean {
    const seats = this.freeSeats(group.members.length);
    if (!seats) return false;
    group.members.forEach((m, i) => {
      const seat = seats[i] as SeatAnchor;
      this.occupied.add(seat.id);
      m.seat = seat;
      m.path.push(...seat.approach, { x: seat.x, y: seat.y });
      m.delay = Math.max(m.delay, i * 0.4);
    });
    this.queueOrder = this.queueOrder.filter((id) => id !== group.id);
    group.state = 'seating';
    group.emote = null;
    return true;
  }

  private updateGroup(group: Group, dt: number, events: SimEvent[]): void {
    for (const m of group.members) this.moveMember(m, dt);
    const allIdle = group.members.every((m) => m.path.length === 0 && m.delay <= 0);

    switch (group.state) {
      case 'arriving':
        if (group.members[0]?.path.length === 0) {
          if (this.tryTakeSeats(group)) break;
          const queueSlot = this.queueOrder.length;
          if (queueSlot < this.anchors.queue.length) {
            this.queueOrder.push(group.id);
            group.state = 'queueing';
            group.waitStart = this.clock;
            group.emote = 'wait';
            const spot = this.anchors.queue[queueSlot] as Point;
            group.members.forEach((m, i) => m.path.push(jitter(spot, i)));
          } else {
            this.hooks.walkAway(group.plan);
            events.push({ type: 'walk-away', group, reason: 'full' });
            this.leave(group, 'angry');
          }
        }
        break;
      case 'queueing':
        if (this.tryTakeSeats(group)) break;
        if (this.clock - group.waitStart > group.plan.patience) {
          this.hooks.walkAway(group.plan);
          events.push({ type: 'walk-away', group, reason: 'impatient' });
          this.leave(group, 'angry');
        }
        break;
      case 'seating':
        if (allIdle) {
          for (const m of group.members) m.sitting = true;
          group.state = 'ordering';
          group.timer = DEMAND_CONFIG.orderMinutes * (1 - effectsOf(this.hooks.getState()).serviceSpeed);
        }
        break;
      case 'ordering':
        group.timer -= dt;
        if (group.timer <= 0) {
          const waited = group.waitStart > 0 ? this.clock - group.waitStart - DEMAND_CONFIG.orderMinutes * (1 - effectsOf(this.hooks.getState()).serviceSpeed) : 0;
          const outcome = this.hooks.order(group.plan, Math.max(0, waited), this.rng);
          group.outcome = outcome;
          events.push({ type: 'order', group, outcome });
          if (outcome.kind === 'left-empty') {
            this.leave(group, 'angry');
          } else {
            group.state = 'eating';
            const items = outcome.sold.reduce((s, l) => s + l.qty, 0);
            group.timer = Math.min(
              DEMAND_CONFIG.eatMinutesMax,
              Math.max(DEMAND_CONFIG.eatMinutesMin, (items / group.members.length) * DEMAND_CONFIG.eatMinutesPerItem + this.rng.range(0, 4)),
            );
            group.showing = outcome.sold[0]?.recipeId ?? null;
            group.emote = outcome.satisfaction >= 70 ? 'happy' : outcome.satisfaction >= 45 ? 'ok' : 'angry';
          }
        }
        break;
      case 'eating':
        group.timer -= dt;
        // Ganti ikon gelembung bergiliran antar pesanan.
        if (group.outcome && group.outcome.sold.length > 1) {
          const idx = Math.floor((group.timer / 2) % group.outcome.sold.length);
          group.showing = group.outcome.sold[Math.abs(idx)]?.recipeId ?? group.showing;
        }
        if (group.timer <= 0) {
          events.push({ type: 'pay', group, amount: group.outcome?.total ?? 0 });
          this.leave(group, group.emote);
        }
        break;
      case 'leaving':
        if (group.members.every((m) => m.gone)) {
          group.state = 'gone';
          events.push({ type: 'gone', group });
        }
        break;
      case 'gone':
        break;
    }
  }

  private leave(group: Group, emote: Emote): void {
    this.queueOrder = this.queueOrder.filter((id) => id !== group.id);
    group.state = 'leaving';
    group.emote = emote;
    group.showing = null;
    group.members.forEach((m, i) => {
      if (m.seat) this.occupied.delete(m.seat.id);
      const back = m.seat ? [...m.seat.approach].reverse() : [];
      m.seat = null;
      m.sitting = false;
      m.path = [...back, ...group.exitPath];
      m.delay = i * 0.5;
    });
  }

  private moveMember(m: Member, dt: number): void {
    if (m.gone) return;
    if (m.delay > 0) {
      m.delay -= dt;
      m.moving = false;
      return;
    }
    let budget = SIM_CONFIG.walkSpeed * dt;
    m.moving = m.path.length > 0;
    while (budget > 0 && m.path.length > 0) {
      const target = m.path[0] as Point;
      const dx = target.x - m.x;
      const dy = target.y - m.y;
      const dist = Math.hypot(dx, dy);
      // Arah layar: x_layar ∝ (x − y) → ke kiri jika dx − dy < 0.
      if (Math.abs(dx - dy) > 1e-3) m.facingLeft = dx - dy < 0;
      if (dist <= budget) {
        m.x = target.x;
        m.y = target.y;
        m.path.shift();
        budget -= dist;
      } else {
        m.x += (dx / dist) * budget;
        m.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (m.path.length === 0) {
      m.moving = false;
      const group = this.groups.find((g) => g.id === m.groupId);
      if (group?.state === 'leaving') m.gone = true;
    }
  }
}

/** Geser sedikit titik berdiri anggota rombongan agar tidak bertumpuk. */
function jitter(p: Point, index: number): Point {
  if (index === 0) return p;
  const offsets = [[0, 0], [0.35, 0.25], [-0.3, 0.35], [0.3, -0.3]] as const;
  const o = offsets[index % offsets.length] as readonly [number, number];
  return { x: p.x + o[0], y: p.y + o[1] };
}

/** Pengubah permintaan dari iklan hari ini & loyalitas pemain. */
export function modifiersOf(state: Readonly<GameState>): DemandModifiers {
  const ad = activeAdEffect(state.ledger.ads);
  const fx = effectsOf(state);
  return {
    arrivalBonus: ad.arrivalBonus + fx.arrivalBonus,
    newCustomerBonus: ad.newCustomerBonus + fx.newCustomerBonus,
    loyalty: state.player.loyalty,
    weather: state.weather,
    rainShelter: fx.rainShelter,
    ...dayDemand(state),
  };
}
