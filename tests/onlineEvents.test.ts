import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/core/GameState';
import { ONLINE_EVENT_GAP, ONLINE_EVENTS } from '../src/data/online';
import { activeOnlineEvent, rollOnlineEvent } from '../src/systems/OnlineEventSystem';
import { expectedOrders } from '../src/systems/OnlineOrderSystem';

describe('event pesanan online', () => {
  it('tidak ada event sebelum memilih cara mengantar', () => {
    const s = createInitialState();
    for (let d = 2; d < 40; d++) {
      s.calendar.day = d;
      expect(rollOnlineEvent(s)).toBeNull();
    }
  });

  it('berlaku satu hari, jeda minimal antar event, Diskon Toko Online paling sering', () => {
    const s = createInitialState();
    s.online.mode = 'ojol';
    s.online.rating = 80;
    const days: number[] = [];
    const count: Record<string, number> = {};
    for (let d = 2; d < 300; d++) {
      s.calendar.day = d;
      const ev = rollOnlineEvent(s);
      if (ev) {
        days.push(d);
        count[ev.id] = (count[ev.id] ?? 0) + 1;
        expect(activeOnlineEvent(s)?.id).toBe(ev.id);
        s.calendar.day = d + 1;
        expect(activeOnlineEvent(s)).toBeNull();
        s.calendar.day = d;
      }
    }
    for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBeGreaterThanOrEqual(ONLINE_EVENT_GAP);
    expect(days.length).toBeGreaterThan(30);
    expect(count.diskon_toko).toBeGreaterThan(count.aplikasi_gangguan ?? 0);
  });

  it('Diskon Toko Online: pesanan +50%, harga −15%; Ulasan Viral butuh rating ≥ 70', () => {
    const s = createInitialState();
    s.online.mode = 'ojol';
    const base = expectedOrders(s);
    s.online.event = { id: 'diskon_toko', day: s.calendar.day };
    expect(expectedOrders(s)).toBeCloseTo(base * 1.5);
    expect(ONLINE_EVENTS.find((e) => e.id === 'diskon_toko')!.price).toBe(0.85);
    expect(ONLINE_EVENTS.find((e) => e.id === 'ulasan_viral')!.minRating).toBe(70);
  });
});
