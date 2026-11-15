import { describe, expect, it } from 'vitest';
import { BALANCE_CONFIG } from '../src/config/balanceConfig';
import { ECONOMY_CONFIG } from '../src/config/economyConfig';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents, StateChange } from '../src/core/GameEvents';
import { createInitialState } from '../src/core/GameState';
import { GameStore } from '../src/core/GameStore';

function setup() {
  const bus = new EventBus<GameEvents>();
  const store = new GameStore(bus);
  const changes: StateChange[] = [];
  bus.on('state:changed', (c) => changes.push(c));
  return { bus, store, changes };
}

describe('GameStore', () => {
  it('state awal mengikuti konfigurasi', () => {
    const { store } = setup();
    const s = store.get();
    expect(s.player.money).toBe(ECONOMY_CONFIG.startingMoney);
    expect(s.player.money).toBe(500_000);
    expect(s.player.popularity).toBe(BALANCE_CONFIG.startingPopularity);
    expect(s.calendar.day).toBe(1);
    expect(s.calendar.clockMinutes).toBe(GAME_CONFIG.dayCycle.openMinutes);
    expect(s.phase).toBe('persiapan');
    expect(s.weather).toBe('cerah');
  });

  it('update memicu event dengan state sebelum & sesudah', () => {
    const { store, changes } = setup();
    store.update('uji', (d) => {
      d.player.money -= 25_000;
    });
    expect(store.get().player.money).toBe(475_000);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.prev.player.money).toBe(500_000);
    expect(changes[0]?.state.player.money).toBe(475_000);
    expect(changes[0]?.reason).toBe('uji');
  });

  it('menolak perubahan tidak valid dan mempertahankan state lama', () => {
    const { store, changes } = setup();
    expect(() => store.update('x', (d) => void (d.player.money = Number.NaN))).toThrow();
    expect(() => store.update('x', (d) => void (d.player.money = 10.5))).toThrow();
    expect(() => store.update('x', (d) => void (d.player.popularity = 120))).toThrow();
    expect(() => store.update('x', (d) => void (d.calendar.day = 0))).toThrow();
    expect(() => store.update('x', (d) => void (d.calendar.clockMinutes = -1))).toThrow();
    expect(store.get()).toEqual(createInitialState());
    expect(changes).toHaveLength(0);
  });

  it('state yang dikembalikan tidak ikut berubah oleh mutasi draft berikutnya', () => {
    const { store } = setup();
    const before = store.get();
    store.update('uji', (d) => {
      d.player.popularity = 15;
    });
    expect(before.player.popularity).toBe(10);
    const snap = store.snapshot();
    snap.player.money = 1;
    expect(store.get().player.money).toBe(500_000);
  });

  it('reset mengembalikan state awal', () => {
    const { store, changes } = setup();
    store.update('uji', (d) => {
      d.calendar.day = 5;
    });
    store.reset();
    expect(store.get()).toEqual(createInitialState());
    expect(changes.at(-1)?.reason).toBe('new-game');
  });
});
