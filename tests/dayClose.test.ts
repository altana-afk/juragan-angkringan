import { describe, expect, it } from 'vitest';
import { GameContext } from '../src/core/GameContext';
import { createInitialState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { activeAdEffect, ADS, buyAd, cancelAd } from '../src/systems/AdvertisingSystem';
import { closeDay } from '../src/systems/DayCloseSystem';
import { arrivalChancePerMinute } from '../src/systems/DemandSystem';
import { addStock } from '../src/systems/InventorySystem';
import { nextLoyalty, popularityDelta } from '../src/systems/PopularitySystem';
import { MemoryStorage, migrateSave } from '../src/systems/SaveSystem';

const zero = { served: 0, partial: 0, leftEmpty: 0, leftWaiting: 0, happy: 0, unhappy: 0, missedPortions: 0 };

describe('popularitas', () => {
  it('naik saat pelanggan terlayani & puas, turun saat kecewa', () => {
    expect(popularityDelta({ ...zero, served: 12, happy: 8 }, 10)).toBeGreaterThan(2);
    expect(popularityDelta({ ...zero, leftEmpty: 8, missedPortions: 10 }, 10)).toBeLessThan(-2);
  });

  it('satu pelanggan tidak mengubah popularitas secara ekstrem', () => {
    expect(Math.abs(popularityDelta({ ...zero, served: 1, happy: 1 }, 10))).toBeLessThan(0.5);
    expect(Math.abs(popularityDelta({ ...zero, leftEmpty: 1 }, 10))).toBeLessThan(0.5);
  });

  it('dibatasi ±6 per hari dan makin lambat naik saat sudah tinggi', () => {
    expect(popularityDelta({ ...zero, served: 500, happy: 500 }, 10)).toBe(6);
    expect(popularityDelta({ ...zero, leftEmpty: 500 }, 50)).toBe(-6);
    expect(popularityDelta({ ...zero, served: 10 }, 90)).toBeLessThan(popularityDelta({ ...zero, served: 10 }, 10));
  });

  it('loyalitas bergerak perlahan ke arah kepuasan', () => {
    const l = nextLoyalty(0, 90, 1, 20);
    expect(l).toBeGreaterThan(15);
    expect(l).toBeLessThan(30);
    expect(nextLoyalty(50, 0, 0, 0)).toBe(48);
  });
});

describe('iklan', () => {
  it('ada 5 jenis promosi sesuai desain', () => {
    expect(ADS.map((a) => [a.id, a.cost])).toEqual([
      ['selebaran', 10000], ['whatsapp', 20000], ['media_sosial', 35000], ['spanduk', 50000], ['influencer', 75000],
    ]);
  });

  it('memasang iklan memotong uang, menambah calon pelanggan, bisa dibatalkan', () => {
    const s = createInitialState();
    buyAd(s, 'media_sosial');
    expect(s.player.money).toBe(465_000);
    expect(s.ledger.promotionCost).toBe(35_000);
    expect(() => buyAd(s, 'media_sosial')).toThrow(/sudah dipasang/);
    const base = arrivalChancePerMinute(20 * 60, 10);
    const boosted = arrivalChancePerMinute(20 * 60, 10, { ...activeAdEffect(s.ledger.ads), loyalty: 0 });
    expect(boosted / base).toBeCloseTo(1.5);
    cancelAd(s, 'media_sosial');
    expect(s.player.money).toBe(500_000);
    expect(s.ledger.ads).toEqual([]);
  });

  it('efek beberapa iklan berkurang (tidak menumpuk penuh) & tidak menaikkan popularitas', () => {
    const both = activeAdEffect(['influencer', 'spanduk']).arrivalBonus;
    expect(both).toBeLessThan(0.95 + 0.65);
    expect(both).toBeGreaterThan(0.95);
    const s = createInitialState();
    buyAd(s, 'influencer');
    expect(s.player.popularity).toBe(10);
  });

  it('tidak bisa pasang iklan saat berjualan atau uang kurang', () => {
    const s = createInitialState();
    s.player.money = 5000;
    expect(() => buyAd(s, 'selebaran')).toThrow(/Uang/);
    s.player.money = 100_000;
    s.phase = 'berjualan';
    expect(() => buyAd(s, 'selebaran')).toThrow(/sebelum/);
  });
});

describe('tutup hari & laporan', () => {
  it('menghitung laporan keuangan yang konsisten', () => {
    const s = createInitialState();
    s.ledger.purchaseTotal = 120_000;
    s.player.money -= 120_000;
    buyAd(s, 'whatsapp');
    s.ledger.revenue = 350_000;
    s.player.money += 350_000;
    s.ledger.customers = 25;
    s.ledger.served = 21;
    s.ledger.leftEmpty = 4;
    s.ledger.satisfactionSum = 25 * 75;
    s.ledger.sold = { nasi_goreng: 20, es_teh: 30 };
    s.ledger.prepared = { nasi_goreng: 25, es_teh: 30, tempe_goreng: 10 };
    s.ledger.missed = { teh_hangat: 3 };
    addStock(s.inventory.products, 'nasi_goreng', 5, 1, 5000);
    const r = closeDay(s, CATALOG);
    expect(r.operationalCost).toBe(10_000);
    expect(r.netProfit).toBe(350_000 - 120_000 - 20_000 - 10_000);
    expect(r.moneyEnd).toBe(500_000 + 200_000);
    expect(s.player.money).toBe(700_000);
    expect(r.topSellers[0]).toEqual(['es_teh', 30]);
    expect(r.leastSold[0]?.[0]).toBe('tempe_goreng');
    expect(r.soldOut).toEqual([['teh_hangat', 3]]);
    expect(r.wasted).toEqual([['nasi_goreng', 5, 'produk']]);
    expect(r.wasteCost).toBe(25_000);
    expect(r.popularityAfter).toBeGreaterThan(r.popularityBefore);
    expect(s.history).toHaveLength(1);
    expect(s.lastReport).toEqual(r);
  });

  it('alur penuh lewat GameActions membuka menu baru saat popularitas ≥ 20', () => {
    const ctx = new GameContext({ storage: new MemoryStorage() });
    ctx.startNewGame();
    ctx.store.update('uji', (d) => {
      d.player.popularity = 18;
      d.phase = 'berjualan';
      d.ledger.served = 40;
      d.ledger.happy = 30;
      d.ledger.customers = 40;
      d.ledger.satisfactionSum = 40 * 90;
    });
    const report = ctx.actions.finishSelling();
    expect(report?.popularityAfter).toBeGreaterThanOrEqual(20);
    expect(ctx.store.get().unlockedRecipes).toContain('sate_usus');
    expect(ctx.actions.startNextDay().ok).toBe(true);
    expect(ctx.store.get().ledger.ads).toEqual([]);
  });

  it('save versi 3 dimigrasi ke versi 4', () => {
    const v3 = { version: 3, state: { ...createInitialState(), player: { money: 1000, popularity: 15 }, lastReport: undefined, history: undefined } };
    const s = migrateSave(v3);
    expect(s.player.loyalty).toBe(0);
    expect(s.history).toEqual([]);
    expect(s.ledger.ads).toEqual([]);
  });
});
