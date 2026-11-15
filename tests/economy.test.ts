import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { applyPurchase, ingredientPrice, quotePurchase } from '../src/systems/EconomySystem';
import { addStock, consumeStock, removeExpired, totalQty } from '../src/systems/InventorySystem';
import { GameRuleError } from '../src/systems/rules';

const fresh = (): GameState => createInitialState();

describe('inventaris', () => {
  it('menambah & memakai stok dengan FEFO tanpa pernah negatif', () => {
    const group = {};
    addStock(group, 'telur', 5, 10, 1000);
    addStock(group, 'telur', 3, 4, 2000);
    expect(totalQty((group as Record<string, never>)['telur'])).toBe(8);
    // yang kedaluwarsa hari 4 dipakai lebih dulu
    expect(consumeStock(group, 'telur', 4)).toBe(3 * 2000 + 1 * 1000);
    expect(totalQty((group as Record<string, never>)['telur'])).toBe(4);
    expect(() => consumeStock(group, 'telur', 5)).toThrow(GameRuleError);
    expect(totalQty((group as Record<string, never>)['telur'])).toBe(4);
    consumeStock(group, 'telur', 4);
    expect('telur' in group).toBe(false);
  });

  it('membuang stok kedaluwarsa', () => {
    const group = {};
    addStock(group, 'tahu', 4, 2, 600);
    addStock(group, 'tahu', 2, 5, 600);
    addStock(group, 'gula', 10, null, 400);
    const removed = removeExpired(group, 3);
    expect(removed).toEqual({ tahu: { qty: 4, cost: 2400 } });
    expect(totalQty((group as Record<string, never>)['tahu'])).toBe(2);
    expect(totalQty((group as Record<string, never>)['gula'])).toBe(10);
  });

  it('menolak jumlah tidak valid', () => {
    expect(() => addStock({}, 'telur', 0, null, 1)).toThrow();
    expect(() => addStock({}, 'telur', 1.5, null, 1)).toThrow();
  });
});

describe('harga bahan', () => {
  it('deterministik, dibulatkan ke Rp100, dan bergerak bertahap', () => {
    const telur = CATALOG.ingredient('telur');
    expect(ingredientPrice(telur, 5)).toBe(ingredientPrice(telur, 5));
    for (let d = 1; d <= 60; d++) {
      const p = ingredientPrice(telur, d);
      expect(p % 100).toBe(0);
      expect(p).toBeGreaterThan(telur.basePrice * 0.8);
      expect(p).toBeLessThan(telur.basePrice * 1.5);
      if (d > 1) expect(Math.abs(p - ingredientPrice(telur, d - 1)) / p).toBeLessThan(0.12);
    }
    // inflasi jangka panjang
    expect(ingredientPrice(telur, 200)).toBeGreaterThan(ingredientPrice(telur, 1));
  });
});

describe('pembelian', () => {
  it('mengurangi uang, menambah stok sesuai ukuran kemasan, dan mencatat buku harian', () => {
    const s = fresh();
    const quote = applyPurchase(s, CATALOG, [{ ingredientId: 'telur', packs: 2 }, { ingredientId: 'beras', packs: 1 }, { ingredientId: 'gula', packs: 0 }]);
    expect(quote.lines).toHaveLength(2);
    expect(s.player.money).toBe(500_000 - quote.total);
    expect(totalQty(s.inventory.ingredients['telur'])).toBe(32);
    expect(totalQty(s.inventory.ingredients['beras'])).toBe(8);
    expect(s.inventory.ingredients['gula']).toBeUndefined();
    expect(s.ledger.purchaseTotal).toBe(quote.total);
    expect(s.inventory.ingredients['telur']![0]!.expiresDay).toBe(1 + 10 - 1);
    expect(s.inventory.ingredients['beras']![0]!.expiresDay).toBeNull();
  });

  it('menolak jika uang tidak cukup tanpa mengubah state', () => {
    const s = fresh();
    s.player.money = 1000;
    const before = structuredClone(s);
    expect(() => applyPurchase(s, CATALOG, [{ ingredientId: 'ayam', packs: 1 }])).toThrow(/Uang tidak cukup/);
    expect(s).toEqual(before);
  });

  it('menolak keranjang kosong & jumlah tidak valid', () => {
    expect(() => applyPurchase(fresh(), CATALOG, [])).toThrow(/kosong/);
    expect(() => quotePurchase(CATALOG, [{ ingredientId: 'telur', packs: -1 }], 1)).toThrow();
    expect(() => quotePurchase(CATALOG, [{ ingredientId: 'telur', packs: 999 }], 1)).toThrow();
    expect(() => quotePurchase(CATALOG, [{ ingredientId: 'emas', packs: 1 }], 1)).toThrow();
  });
});
