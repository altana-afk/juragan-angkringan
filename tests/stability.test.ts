import { describe, expect, it } from 'vitest';
import { parseQuality, resolveLowPower } from '../src/config/graphicsSettings';
import { validateState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { totalQty } from '../src/systems/InventorySystem';
import { MemoryStorage, SaveSystem } from '../src/systems/SaveSystem';
import { runBot } from './helpers/bot';

describe('stabilitas jangka panjang (bot 60 hari)', () => {
  it('state selalu valid: uang bulat, stok tidak negatif, riwayat dibatasi, simpan-muat identik', () => {
    const { ctx, log } = runBot(60);
    const s = ctx.store.get();
    expect(() => validateState(s, CATALOG)).not.toThrow();
    expect(Number.isInteger(s.player.money)).toBe(true);
    expect(s.player.popularity).toBeGreaterThanOrEqual(0);
    expect(s.player.popularity).toBeLessThanOrEqual(100);
    for (const batches of [...Object.values(s.inventory.ingredients), ...Object.values(s.inventory.products)]) {
      expect(totalQty(batches)).toBeGreaterThanOrEqual(0);
      for (const b of batches) expect(b.qty).toBeGreaterThan(0);
    }
    expect(s.history.length).toBeLessThanOrEqual(60);
    for (const d of log) expect(Number.isFinite(d.money)).toBe(true);
    // Simpan & muat ulang menghasilkan state yang sama persis.
    const storage = new MemoryStorage();
    const saves = new SaveSystem(storage, CATALOG);
    saves.save(s);
    expect(saves.load()).toEqual(JSON.parse(JSON.stringify(s)));
    // Ukuran save tetap kecil (LocalStorage ±5 MB).
    expect(JSON.stringify(s).length).toBeLessThan(200_000);
  }, 120_000);

  it('hasil deterministik untuk seed yang sama', () => {
    const a = runBot(5).log;
    const b = runBot(5).log;
    expect(a).toEqual(b);
  }, 60_000);
});

describe('kualitas grafis', () => {
  it('otomatis memilih hemat hanya untuk perangkat sentuh yang lemah', () => {
    expect(resolveLowPower('auto', { touch: true, cores: 4 })).toBe(true);
    expect(resolveLowPower('auto', { touch: true, cores: 8, memoryGb: 2 })).toBe(true);
    expect(resolveLowPower('auto', { touch: true, cores: 8, memoryGb: 8 })).toBe(false);
    expect(resolveLowPower('auto', { touch: false, cores: 2 })).toBe(false);
    expect(resolveLowPower('hemat', {})).toBe(true);
    expect(resolveLowPower('tinggi', { touch: true, cores: 2 })).toBe(false);
    expect(parseQuality('aneh')).toBe('auto');
  });
});
