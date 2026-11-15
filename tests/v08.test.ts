import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { CUSTOMER_TYPES } from '../src/data/customers';
import { EVENTS } from '../src/data/events';
import { LOCATIONS, locationById } from '../src/data/locations';
import { ACHIEVEMENTS, unlockAchievements } from '../src/systems/AchievementSystem';
import { BANK_RULES, depositBalance, loanLimit, openDeposit, processBankAtClose, repayLoan, takeLoan, withdrawDeposit } from '../src/systems/BankSystem';
import { closeDay } from '../src/systems/DayCloseSystem';
import { arrivalChancePerMinute, planCustomer } from '../src/systems/DemandSystem';
import { applyPurchase } from '../src/systems/EconomySystem';
import { deliverBulkOrder, eligibleEvents, rollEvent } from '../src/systems/EventSystem';
import { addStock, totalQty } from '../src/systems/InventorySystem';
import { dayDemand, isWeekend, weekdayFactor } from '../src/systems/LocationSystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { modifiersOf } from '../src/systems/SalesSimulation';
import { SeededRandom } from '../src/utils/random';
import { getMap } from '../src/world/maps';
import { runBot } from './helpers/bot';

const prep = (): GameState => {
  const s = createInitialState();
  s.player.money = 1_000_000;
  return s;
};

describe('lokasi & peta baru', () => {
  it('peta Dekat Kampus punya gedung kampus', () => {
    expect(getMap('kampus').objects.some((o) => o.type === 'campus')).toBe(true);
    for (const l of LOCATIONS) expect(() => getMap(l.mapId)).not.toThrow();
  });

  it('akhir pekan ramai di kampung, sepi di kampus; hari kuliah sebaliknya', () => {
    const kampung = locationById('main-street');
    const kampus = locationById('kampus');
    // Hari 1 = Senin 6 Juli 2026; Hari 6 = Sabtu
    expect(isWeekend(1)).toBe(false);
    expect(isWeekend(6)).toBe(true);
    expect(weekdayFactor(kampung, 6)).toBeGreaterThan(weekdayFactor(kampung, 2));
    expect(weekdayFactor(kampus, 6)).toBeLessThan(weekdayFactor(kampus, 2));
    const s = createInitialState();
    s.calendar.day = 6;
    const sat = arrivalChancePerMinute(20 * 60, 40, modifiersOf(s));
    s.calendar.day = 2;
    const tue = arrivalChancePerMinute(20 * 60, 40, modifiersOf(s));
    expect(sat).toBeGreaterThan(tue * 1.3);
  });

  it('kampus: mahasiswa jauh lebih banyak, ramai larut malam, sewa lebih mahal', () => {
    const count = (mapId: string): number => {
      const s = createInitialState();
      s.mapId = mapId;
      s.player.popularity = 50;
      const rng = new SeededRandom('lokasi');
      let n = 0;
      for (let i = 0; i < 500; i++) if (planCustomer(rng, CUSTOMER_TYPES, s, CATALOG, 20 * 60, modifiersOf(s)).typeId === 'mahasiswa') n++;
      return n;
    };
    expect(count('kampus')).toBeGreaterThan(count('main-street') * 1.8);
    const s = createInitialState();
    s.mapId = 'kampus';
    s.calendar.day = 2;
    const late = arrivalChancePerMinute(23 * 60, 40, modifiersOf(s)) / arrivalChancePerMinute(23 * 60, 40, modifiersOf({ ...s, mapId: 'main-street' }));
    expect(late).toBeGreaterThan(1.3);
    const c = createInitialState();
    c.mapId = 'kampus';
    c.phase = 'evaluasi';
    closeDay(c, CATALOG);
    expect(c.lastReport?.operationalCost).toBe(15_000);
  });
});

describe('event acak harian', () => {
  it('deterministik, ±50% hari ada event, Hari 1 kosong, sesuai lokasi', () => {
    expect(rollEvent(1, 'main-street', ['nasi_goreng'], CATALOG)).toBeNull();
    const ids = createInitialState().unlockedRecipes;
    let n = 0;
    for (let d = 2; d < 202; d++) {
      const a = rollEvent(d, 'kampus', ids, CATALOG);
      expect(a).toEqual(rollEvent(d, 'kampus', ids, CATALOG));
      if (a) {
        n++;
        expect(['hajatan']).not.toContain(a.id);
      }
    }
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(130);
    // gajian hanya di tanggal gajian (Hari 1 = 6 Juli → tanggal 25 = Hari 20)
    expect(eligibleEvents(20, 'main-street').some((e) => e.id === 'gajian')).toBe(true);
    expect(eligibleEvents(10, 'main-street').some((e) => e.id === 'gajian')).toBe(false);
    expect(EVENTS.length).toBeGreaterThanOrEqual(10);
  });

  it('pengaruh event: kedatangan, harga bahan, ulasan', () => {
    const s = createInitialState();
    s.calendar.day = 2;
    const base = dayDemand(s).dayFactor;
    s.event = { id: 'nobar_bola', bulk: null };
    expect(dayDemand(s).dayFactor).toBeCloseTo(base * 1.3);
    const a = prep();
    const b = prep();
    b.event = { id: 'cabai_mahal', bulk: null };
    applyPurchase(a, CATALOG, [{ ingredientId: 'cabai', packs: 1 }]);
    applyPurchase(b, CATALOG, [{ ingredientId: 'cabai', packs: 1 }]);
    expect(b.ledger.purchaseTotal).toBeGreaterThan(a.ledger.purchaseTotal * 1.5);
    const v = createInitialState();
    v.event = { id: 'food_vlogger', bulk: null };
    v.ledger.customers = 10;
    v.ledger.satisfactionSum = 900;
    v.ledger.served = 10;
    v.phase = 'evaluasi';
    closeDay(v, CATALOG);
    expect(v.lastReport?.reviewDelta).toBe(4);
  });

  it('pesanan borongan: terkirim jika stok cukup, batal jika kurang', () => {
    const s = createInitialState();
    s.event = { id: 'hajatan', bulk: { recipeId: 'nasi_goreng', qty: 5, unitPrice: 15_000, status: 'menunggu' } };
    addStock(s.inventory.products, 'nasi_goreng', 8, 1, 5000);
    const r = deliverBulkOrder(s);
    expect(r?.delivered).toBe(true);
    expect(s.player.money).toBe(500_000 + 75_000);
    expect(totalQty(s.inventory.products['nasi_goreng'])).toBe(3);
    expect(s.ledger.sold['nasi_goreng']).toBe(5);
    expect(deliverBulkOrder(s)).toBeNull(); // hanya sekali
    const t = createInitialState();
    t.player.popularity = 20;
    t.event = { id: 'hajatan', bulk: { recipeId: 'nasi_goreng', qty: 5, unitPrice: 15_000, status: 'menunggu' } };
    expect(deliverBulkOrder(t)?.delivered).toBe(false);
    expect(t.event.bulk?.status).toBe('gagal');
    expect(t.player.popularity).toBeLessThan(20);
  });
});

describe('BANK', () => {
  it('deposito: bunga 0,5%/hari, bisa ditarik kapan saja, cair otomatis + bonus saat jatuh tempo', () => {
    const s = prep();
    const id = openDeposit(s, 200_000, 7);
    expect(s.player.money).toBe(800_000);
    processBankAtClose(s);
    expect(s.bank.deposits[0]?.interest).toBe(1_000);
    expect(s.ledger.bankIncome).toBe(1_000);
    expect(withdrawDeposit(s, id)).toBe(201_000);
    expect(s.player.money).toBe(1_001_000);
    // ditahan sampai jatuh tempo (7 kali tutup hari)
    const t = prep();
    openDeposit(t, 100_000, 7);
    for (let d = 1; d <= 7; d++) {
      t.calendar.day = d;
      processBankAtClose(t);
    }
    expect(t.bank.deposits).toEqual([]);
    expect(t.player.money).toBe(900_000 + 100_000 + 7 * 500 + 1_000);
    expect(t.bank.depositsMatured).toBe(1);
  });

  it('aturan deposito: tempo 1/2/4 minggu, minimal, uang cukup, hanya saat persiapan', () => {
    const s = prep();
    expect(() => openDeposit(s, 100_000, 10)).toThrow(/Tempo/);
    expect(() => openDeposit(s, 1_000, 7)).toThrow(/minimal/);
    expect(() => openDeposit(s, 5_000_000, 28)).toThrow(/tidak cukup/);
    s.phase = 'berjualan';
    expect(() => openDeposit(s, 100_000, 14)).toThrow(/persiapan/);
    expect(BANK_RULES.terms).toEqual([7, 14, 28]);
  });

  it('pinjaman: plafon, bunga 1%/hari, cicil, lunas, potong otomatis saat jatuh tempo', () => {
    const s = prep();
    expect(() => takeLoan(s, loanLimit(s) + 10_000, 7)).toThrow(/Plafon/);
    takeLoan(s, 200_000, 7);
    expect(s.player.money).toBe(1_200_000);
    expect(() => takeLoan(s, 100_000, 7)).toThrow(/Lunasi/);
    processBankAtClose(s);
    expect(s.bank.loan?.interest).toBe(2_000);
    repayLoan(s, 52_000);
    expect(s.bank.loan?.principal).toBe(150_000);
    repayLoan(s, 999_999);
    expect(s.bank.loan).toBeNull();
    expect(s.bank.loansRepaid).toBe(1);
    const t = prep();
    takeLoan(t, 100_000, 7);
    for (let d = 1; d <= 7; d++) {
      t.calendar.day = d;
      processBankAtClose(t);
    }
    expect(t.bank.loan).toBeNull();
    expect(t.player.money).toBe(1_000_000 + 100_000 - 100_000 - 7_000);
  });

  it('kas minus saat tutup ditutup otomatis dari deposito', () => {
    const s = prep();
    openDeposit(s, 300_000, 28);
    s.player.money = -50_000;
    const r = processBankAtClose(s);
    expect(r.depositsUsed).toBe(301_500);
    expect(s.player.money).toBe(251_500);
    expect(depositBalance(s)).toBe(0);
  });
});

describe('pencapaian', () => {
  it('terbuka sekali saja, memberi hadiah, tercatat harinya', () => {
    const s = createInitialState();
    s.stats.totalPortionsSold = 1;
    s.calendar.day = 3;
    const got = unlockAchievements(s);
    expect(got.map((a) => a.id)).toEqual(['pelaris']);
    expect(s.achievements['pelaris']).toBe(3);
    expect(s.player.money).toBe(505_000);
    expect(unlockAchievements(s)).toEqual([]);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('save v7', () => {
  it('save lama dimigrasi ke Jalan Kampung tanpa bank & pencapaian', () => {
    const st = createInitialState() as unknown as Record<string, unknown>;
    for (const k of ['mapId', 'event', 'bank', 'achievements']) delete st[k];
    const out = migrateSave({ version: 6, savedAt: '', state: st });
    expect(out.mapId).toBe('main-street');
    expect(out.bank.deposits).toEqual([]);
    expect(out.achievements).toEqual({});
  });
});

describe('keseimbangan lokasi (bot 30 hari)', () => {
  it('kedua lokasi bisa dimainkan tanpa bangkrut', () => {
    for (const location of ['main-street', 'kampus']) {
      const { ctx, log } = runBot(30, { location });
      expect(log.length).toBe(30);
      expect(ctx.store.get().bankrupt).toBe(false);
    }
  }, 120_000);
});
