import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { CUSTOMER_TYPES } from '../src/data/customers';
import { LOCATIONS, locationById } from '../src/data/locations';
import { prepareProducts } from '../src/systems/CookingSystem';
import { arrivalChancePerMinute, planCustomer } from '../src/systems/DemandSystem';
import { applyPurchase } from '../src/systems/EconomySystem';
import { addStock } from '../src/systems/InventorySystem';
import { moveLocation, previewDemand } from '../src/systems/LocationSystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { modifiersOf } from '../src/systems/SalesSimulation';
import { buyUpgrade, upgradeById } from '../src/systems/UpgradeSystem';
import { SeededRandom } from '../src/utils/random';
import { getMap } from '../src/world/maps';
import { runBot } from './helpers/bot';

const at = (mapId: string, day = 2): GameState => {
  const s = createInitialState();
  s.mapId = mapId;
  s.calendar.day = day;
  return s;
};

describe('pindah lokasi saat persiapan', () => {
  it('bayar biaya, loyalitas turun, maksimal sekali sehari, hanya persiapan', () => {
    const s = createInitialState();
    s.player.loyalty = 50;
    moveLocation(s, CATALOG, 'pasar');
    expect(s.mapId).toBe('pasar');
    expect(s.player.money).toBe(500_000 - locationById('pasar').moveCost);
    expect(s.ledger.moveCost).toBe(locationById('pasar').moveCost);
    expect(s.player.loyalty).toBe(30);
    expect(() => moveLocation(s, CATALOG, 'stasiun')).toThrow(/sudah dipindah hari ini/);
    s.calendar.day = 2;
    expect(() => moveLocation(s, CATALOG, 'pasar')).toThrow(/sudah berada/);
    s.phase = 'berjualan';
    expect(() => moveLocation(s, CATALOG, 'stasiun')).toThrow(/persiapan/);
    const poor = createInitialState();
    poor.player.money = 1_000;
    expect(() => moveLocation(poor, CATALOG, 'stasiun')).toThrow(/tidak cukup/);
  });

  it('event & pesanan borongan disesuaikan lokasi baru; pratinjau tidak mengubah state', () => {
    for (let d = 2; d < 40; d++) {
      const s = createInitialState();
      s.calendar.day = d;
      const before = JSON.stringify(s);
      const p = previewDemand(s, CATALOG, 'kampus');
      expect(JSON.stringify(s)).toBe(before);
      moveLocation(s, CATALOG, 'kampus');
      expect(s.event).toEqual(p.event);
      if (s.event) expect(s.event.id).not.toBe('hajatan');
    }
  });

  it('semua peta punya kursi & jalur pelanggan sama lengkapnya', () => {
    const seats = getMap('main-street').customers?.seats.length;
    for (const l of LOCATIONS) {
      const map = getMap(l.mapId);
      expect(map.customers?.seats.length).toBe(seats);
      expect(map.objects.find((o) => o.id === 'cart')).toBeDefined();
    }
    expect(LOCATIONS.map((l) => l.id)).toEqual(['main-street', 'kampus', 'pasar', 'stasiun', 'pasar-malam']);
  });
});

describe('peta baru: Pinggir Pasar & Depan Stasiun', () => {
  it('pasar: bahan lebih murah, ramai sore, sepi setelah 21.30', () => {
    const a = at('main-street');
    const b = at('pasar');
    for (const s of [a, b]) {
      s.player.money = 1_000_000;
      applyPurchase(s, CATALOG, [{ ingredientId: 'beras', packs: 2 }, { ingredientId: 'telur', packs: 1 }]);
    }
    expect(b.ledger.purchaseTotal).toBeLessThan(a.ledger.purchaseTotal * 0.93);
    const ratio = (m: number): number => arrivalChancePerMinute(m, 40, modifiersOf(b)) / arrivalChancePerMinute(m, 40, modifiersOf(a));
    expect(ratio(18 * 60)).toBeGreaterThan(1.2);
    expect(ratio(23 * 60)).toBeLessThan(0.6);
  });

  it('stasiun: dua gelombang, pelanggan buru-buru tapi anggaran lebih besar, ojol & pekerja dominan', () => {
    const st = at('stasiun');
    const ms = at('main-street');
    const r = (m: number): number => arrivalChancePerMinute(m, 40, modifiersOf(st)) / arrivalChancePerMinute(m, 40, modifiersOf(ms));
    expect(r(18 * 60)).toBeGreaterThan(1.3);
    expect(r(24 * 60)).toBeGreaterThan(1.3);
    expect(r(21 * 60)).toBeLessThan(1.1);
    const plans = (s: GameState): { patience: number; budget: number; commuters: number } => {
      const rng = new SeededRandom('stasiun');
      let patience = 0;
      let budget = 0;
      let commuters = 0;
      for (let i = 0; i < 400; i++) {
        const p = planCustomer(rng, CUSTOMER_TYPES, s, CATALOG, 19 * 60, modifiersOf(s));
        patience += p.patience;
        budget += p.budget / p.partySize;
        if (p.typeId === 'ojol' || p.typeId === 'pekerja') commuters++;
      }
      return { patience, budget, commuters };
    };
    const a = plans(st);
    const b = plans(ms);
    expect(a.patience).toBeLessThan(b.patience);
    expect(a.commuters).toBeGreaterThan(b.commuters * 1.4);
    expect(locationById('stasiun').rent).toBeGreaterThan(locationById('kampus').rent);
  });

  it('keempat lokasi bisa dimainkan 20 hari tanpa bangkrut', () => {
    for (const l of LOCATIONS) {
      const { ctx, log } = runBot(20, { location: l.id });
      expect(log.length).toBe(20);
      expect(ctx.store.get().bankrupt).toBe(false);
    }
  }, 180_000);
});

describe('upgrade Kulkas', () => {
  it('minuman, es & bahan dingin, dan bahan mentah lebih awet', () => {
    const k = upgradeById('kulkas');
    expect(k.category).toBe('peralatan');
    const make = (withFridge: boolean): GameState => {
      const s = createInitialState();
      s.player.money = 2_000_000;
      if (withFridge) buyUpgrade(s, 'kulkas');
      applyPurchase(s, CATALOG, [{ ingredientId: 'es_batu', packs: 1 }, { ingredientId: 'tempe', packs: 1 }, { ingredientId: 'teh', packs: 1 }, { ingredientId: 'gula', packs: 1 }]);
      addStock(s.inventory.ingredients, 'air_minum', 10, null, 100);
      addStock(s.inventory.ingredients, 'minyak', 10, null, 100);
      prepareProducts(s, CATALOG, [{ recipeId: 'es_teh', portions: 3 }, { recipeId: 'tempe_goreng', portions: 2 }]);
      return s;
    };
    const plain = make(false);
    const cold = make(true);
    const exp = (s: GameState, group: 'ingredients' | 'products', id: string): number | null => s.inventory[group][id]?.[0]?.expiresDay ?? null;
    expect(exp(cold, 'ingredients', 'es_batu')! - exp(plain, 'ingredients', 'es_batu')!).toBe(4); // +3 dingin, +1 bahan
    expect(exp(cold, 'ingredients', 'tempe')! - exp(plain, 'ingredients', 'tempe')!).toBe(1);
    expect(exp(cold, 'products', 'es_teh')! - exp(plain, 'products', 'es_teh')!).toBe(2);
    expect(exp(cold, 'products', 'tempe_goreng')).toBe(exp(plain, 'products', 'tempe_goreng'));
  });
});

describe('save v8', () => {
  it('migrasi v7 menambah data pindah lokasi', () => {
    const st = createInitialState() as unknown as Record<string, unknown>;
    delete st.lastMoveDay;
    const ledger = st.ledger as Record<string, unknown>;
    delete ledger.moveCost;
    const out = migrateSave({ version: 7, savedAt: '', state: st });
    expect(out.lastMoveDay).toBe(0);
    expect(out.ledger.moveCost).toBe(0);
  });
});
