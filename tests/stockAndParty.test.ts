import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { CUSTOMER_TYPES } from '../src/data/customers';
import { planCustomer } from '../src/systems/DemandSystem';
import { addStock, totalQty } from '../src/systems/InventorySystem';
import { setPrice } from '../src/systems/PricingSystem';
import { discardIngredient } from '../src/systems/StorageSystem';
import { SeededRandom } from '../src/utils/random';
import { boardItems } from '../src/ui/StockBoard';

describe('papan siap dijual', () => {
  it('produk yang habis tetap tampil dengan jumlah 0', () => {
    const s = createInitialState();
    addStock(s.inventory.products, 'es_teh', 4, 1, 900);
    s.ledger.prepared['nasi_goreng'] = 5;
    s.ledger.sold['nasi_goreng'] = 5; // habis terjual
    const items = boardItems(s, CATALOG.recipes);
    expect(items.map((i) => [i.recipe.id, i.qty])).toEqual([
      ['nasi_goreng', 0],
      ['es_teh', 4],
    ]);
    expect(boardItems(createInitialState(), CATALOG.recipes)).toEqual([]);
  });
});

describe('buang bahan gudang', () => {
  it('mengurangi stok (yang paling cepat basi dulu), menolak jumlah tidak valid', () => {
    const s = createInitialState();
    addStock(s.inventory.ingredients, 'telur', 6, null, 2000);
    addStock(s.inventory.ingredients, 'telur', 4, 2, 1800);
    const r = discardIngredient(s, CATALOG, 'telur', 5);
    expect(r.qty).toBe(5);
    expect(r.cost).toBe(4 * 1800 + 2000);
    expect(totalQty(s.inventory.ingredients['telur'])).toBe(5);
    expect(s.inventory.ingredients['telur']?.every((b) => b.expiresDay === null)).toBe(true);
    expect(discardIngredient(s, CATALOG, 'telur', 99).qty).toBe(5); // dibatasi stok
    expect(s.inventory.ingredients['telur']).toBeUndefined();
    expect(() => discardIngredient(s, CATALOG, 'telur', 1)).toThrow(/tidak ada/);
    addStock(s.inventory.ingredients, 'gula', 3, null, 100);
    expect(() => discardIngredient(s, CATALOG, 'gula', 0)).toThrow(/positif/);
    s.phase = 'evaluasi';
    expect(() => discardIngredient(s, CATALOG, 'gula', 1)).toThrow(/persiapan/);
    expect(s.player.money).toBe(500_000); // tidak ada pengembalian uang
  });
});

describe('pesanan rombongan', () => {
  it('jumlah pesanan selalu ≥ jumlah orang di rombongan, kadang lebih', () => {
    const rng = new SeededRandom('rombongan');
    const s = createInitialState();
    s.player.popularity = 70;
    let more = 0;
    let groups = 0;
    for (let i = 0; i < 600; i++) {
      const plan = planCustomer(rng, CUSTOMER_TYPES, s, CATALOG, 18 * 60 + (i % 400));
      expect(plan.wants.length).toBeGreaterThanOrEqual(plan.partySize);
      if (plan.partySize > 1) groups++;
      if (plan.wants.length > plan.partySize) more++;
    }
    expect(groups).toBeGreaterThan(50);
    expect(more).toBeGreaterThan(100);
  });

  it('tetap ≥ jumlah orang walau harga mahal; anggaran cukup untuk satu menu per orang', () => {
    const rng = new SeededRandom('mahal');
    const s = createInitialState();
    for (const id of s.unlockedRecipes) setPrice(s, CATALOG.recipe(id), CATALOG.recipe(id).salePrice * 2);
    for (let i = 0; i < 300; i++) {
      const plan = planCustomer(rng, CUSTOMER_TYPES, s, CATALOG, 20 * 60);
      expect(plan.wants.length).toBeGreaterThanOrEqual(plan.partySize);
      expect(plan.budget / plan.partySize).toBeGreaterThanOrEqual(7000);
    }
  });
});
