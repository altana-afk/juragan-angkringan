import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { prepareProducts } from '../src/systems/CookingSystem';
import { applyPurchase } from '../src/systems/EconomySystem';
import { totalQty } from '../src/systems/InventorySystem';
import { aggregateRequirements, findShortages, maxPortions, refreshUnlocks, requirementsFor } from '../src/systems/RecipeSystem';

function stocked(): GameState {
  const s = createInitialState();
  applyPurchase(s, CATALOG, ['beras', 'telur', 'minyak', 'bawang', 'cabai', 'kecap', 'tempe'].map((id) => ({ ingredientId: id, packs: 2 })));
  return s;
}

describe('resep', () => {
  it('menghitung kebutuhan bahan untuk 10 porsi nasi goreng', () => {
    expect(requirementsFor(CATALOG.recipe('nasi_goreng'), 10)).toEqual({ beras: 10, telur: 10, minyak: 10, bawang: 10, cabai: 10, kecap: 10 });
  });

  it('menggabungkan kebutuhan beberapa produk', () => {
    const req = aggregateRequirements(CATALOG, [{ recipeId: 'nasi_goreng', portions: 2 }, { recipeId: 'tempe_goreng', portions: 3 }]);
    expect(req.minyak).toBe(5);
    expect(req.tempe).toBe(3);
  });

  it('menemukan bahan yang kurang & porsi maksimum', () => {
    const s = stocked();
    // beras 2 kemasan × 8 = 16 porsi; cabai 2 × 10 = 20
    expect(maxPortions(s, CATALOG.recipe('nasi_goreng'))).toBe(16);
    const short = findShortages(s, requirementsFor(CATALOG.recipe('nasi_goreng'), 18));
    expect(short).toEqual([{ ingredientId: 'beras', need: 18, have: 16, missing: 2 }]);
  });
});

describe('memasak', () => {
  it('mengurangi bahan tepat sekali dan menambah stok produk matang', () => {
    const s = stocked();
    const telurBefore = totalQty(s.inventory.ingredients['telur']);
    const minyakBefore = totalQty(s.inventory.ingredients['minyak']);
    const result = prepareProducts(s, CATALOG, [{ recipeId: 'nasi_goreng', portions: 10 }, { recipeId: 'tempe_goreng', portions: 5 }]);
    expect(totalQty(s.inventory.ingredients['telur'])).toBe(telurBefore - 10);
    expect(totalQty(s.inventory.ingredients['minyak'])).toBe(minyakBefore - 15);
    expect(totalQty(s.inventory.products['nasi_goreng'])).toBe(10);
    expect(totalQty(s.inventory.products['tempe_goreng'])).toBe(5);
    expect(s.inventory.products['nasi_goreng']![0]!.expiresDay).toBe(1);
    expect(result.totalPortions).toBe(15);
    expect(result.totalCost).toBeGreaterThan(0);
    expect(s.ledger.prepared).toEqual({ nasi_goreng: 10, tempe_goreng: 5 });
    expect(s.ledger.cookingCost).toBeCloseTo(result.totalCost);
    // bahan mentah tidak berubah menjadi produk lain
    expect(s.inventory.products['beras']).toBeUndefined();
  });

  it('menolak seluruh pesanan jika satu bahan kurang (tidak ada stok yang berkurang)', () => {
    const s = stocked();
    const before = structuredClone(s);
    expect(() => prepareProducts(s, CATALOG, [{ recipeId: 'nasi_goreng', portions: 5 }, { recipeId: 'tahu_goreng', portions: 2 }])).toThrow(/Tahu/);
    expect(s).toEqual(before);
  });

  it('memeriksa total gabungan, bukan per pesanan', () => {
    const s = stocked(); // minyak 80 takar
    expect(() => prepareProducts(s, CATALOG, [{ recipeId: 'tempe_goreng', portions: 20 }, { recipeId: 'nasi_goreng', portions: 16 }])).not.toThrow();
    const t = stocked();
    // tempe 20 + nasi goreng 16 butuh minyak 36 (cukup) tapi tempe hanya 20
    expect(() => prepareProducts(t, CATALOG, [{ recipeId: 'tempe_goreng', portions: 21 }])).toThrow();
  });

  it('menolak resep terkunci & jumlah tidak valid', () => {
    const s = stocked();
    expect(() => prepareProducts(s, CATALOG, [{ recipeId: 'sate_ayam', portions: 1 }])).toThrow(/belum terbuka/);
    expect(() => prepareProducts(s, CATALOG, [{ recipeId: 'nasi_goreng', portions: 1.5 }])).toThrow();
    expect(() => prepareProducts(s, CATALOG, [])).toThrow();
  });
});

describe('unlock menu', () => {
  it('membuka resep sesuai popularitas dan kas, sekali terbuka tetap terbuka', () => {
    const s = createInitialState();
    expect(refreshUnlocks(s, CATALOG)).toEqual([]);
    s.player.popularity = 25;
    const opened = refreshUnlocks(s, CATALOG).map((r) => r.id);
    expect(opened).toEqual(expect.arrayContaining(['sate_usus', 'sate_ati_ampela', 'sosis_bakar']));
    expect(opened).not.toContain('sate_ayam');
    s.player.money = 2_000_000;
    expect(refreshUnlocks(s, CATALOG).map((r) => r.id)).toEqual(expect.arrayContaining(['mi_goreng', 'mi_rebus', 'bakso_bakar', 'sate_ayam']));
    s.player.popularity = 0;
    s.player.money = 0;
    expect(refreshUnlocks(s, CATALOG)).toEqual([]);
    expect(s.unlockedRecipes).toContain('sate_ayam');
  });
});
