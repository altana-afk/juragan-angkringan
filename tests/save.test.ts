import { describe, expect, it } from 'vitest';
import { GameContext } from '../src/core/GameContext';
import { createInitialState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { applyPurchase } from '../src/systems/EconomySystem';
import { MemoryStorage, SAVE_KEY, SAVE_VERSION, SaveError, SaveSystem, migrateSave } from '../src/systems/SaveSystem';

describe('SaveSystem', () => {
  it('menyimpan dan memuat ulang state yang sama persis', () => {
    const storage = new MemoryStorage();
    const saves = new SaveSystem(storage);
    const state = createInitialState();
    applyPurchase(state, CATALOG, [{ ingredientId: 'telur', packs: 1 }]);
    state.calendar.day = 4;
    expect(saves.hasSave()).toBe(false);
    expect(saves.save(state)).toBe(true);
    expect(saves.load()).toEqual(state);
    expect(saves.summary()).toMatchObject({ day: 4, money: state.player.money });
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  });

  it('memigrasi save versi 1 (Stage 1) ke versi terbaru', () => {
    const v1 = { version: 1, savedAt: '', state: { player: { money: 123_000, popularity: 30 }, calendar: { day: 7, clockMinutes: 1020 }, weather: 'hujan', phase: 'persiapan' } };
    const state = migrateSave(v1);
    expect(state.player.money).toBe(123_000);
    expect(state.calendar.day).toBe(7);
    expect(state.weather).toBe('hujan');
    expect(state.inventory).toEqual({ ingredients: {}, products: {} });
    expect(state.ledger.day).toBe(7);
    expect(state.unlockedRecipes.length).toBeGreaterThan(0);
  });

  it('menolak data rusak atau dari versi lebih baru', () => {
    const storage = new MemoryStorage();
    const saves = new SaveSystem(storage);
    storage.setItem(SAVE_KEY, '{bukan json');
    expect(() => saves.load()).toThrow(SaveError);
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION + 1, state: {} }));
    expect(() => saves.load()).toThrow(/lebih baru/);
    const bad = createInitialState();
    bad.player.money = -0.5;
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: bad }));
    expect(() => saves.load()).toThrow(/tidak valid/);
    saves.quarantine();
    expect(saves.hasSave()).toBe(false);
    expect(storage.getItem(`${SAVE_KEY}:rusak`)).not.toBeNull();
  });

  it('GameContext: mulai baru menyimpan, lanjutkan memuat, autosave setelah aksi', async () => {
    const storage = new MemoryStorage();
    const ctx = new GameContext({ storage });
    ctx.startNewGame();
    expect(ctx.saves.hasSave()).toBe(true);
    const res = ctx.actions.buyIngredients([{ ingredientId: 'teh', packs: 1 }]);
    expect(res.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1700));
    ctx.leaveToTitle();
    const other = new GameContext({ storage });
    expect(other.continueGame()).toEqual({ ok: true });
    expect(other.store.get().player.money).toBe(ctx.store.get().player.money);
    expect(other.store.get().inventory.ingredients['teh']).toBeDefined();
  });

  it('aksi yang gagal mengembalikan pesan tanpa mengubah state', () => {
    const ctx = new GameContext({ storage: new MemoryStorage() });
    ctx.startNewGame();
    const before = ctx.store.snapshot();
    const res = ctx.actions.prepare([{ recipeId: 'nasi_goreng', portions: 1 }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('ingredients-short');
    expect(ctx.store.get()).toEqual(before);
  });
});
