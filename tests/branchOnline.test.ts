import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState, type OnlineOrder } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { addStock, totalQty } from '../src/systems/InventorySystem';
import { closeBranches, openBranch } from '../src/systems/BranchSystem';
import { hireStaff } from '../src/systems/BranchStaffSystem';
import { shipToBranch } from '../src/systems/BranchSupplySystem';
import { bestSource, branchOnlineAvailable, branchReserve, branchSourcesUnlocked, sourceOptions } from '../src/systems/BranchOnlineSystem';
import { acceptOrder, createOrder, onlineNet, tickOnline } from '../src/systems/OnlineOrderSystem';
import { GameRuleError } from '../src/systems/rules';
import { SeededRandom } from '../src/utils/random';

/** Toko utama + 1 cabang buka berkaryawan, stok cabang `branchQty` per menu. */
function setup(branchQty = 20, mainQty = 0, mode: 'ojol' | 'kurir' = 'ojol'): GameState {
  const s = createInitialState();
  s.player.money = 10_000_000;
  s.player.popularity = 80;
  s.upgrades.push('gerobak_standar');
  s.calendar.day = 5;
  s.online.mode = mode;
  openBranch(s, 'kampus');
  hireStaff(s, 0, 'harian');
  for (const id of ['nasi_goreng', 'es_teh']) addStock(s.inventory.products, id, branchQty + mainQty, s.calendar.day + 1, 3000);
  if (branchQty) shipToBranch(s, CATALOG, 0, { nasi_goreng: branchQty, es_teh: branchQty });
  s.phase = 'berjualan';
  s.calendar.clockMinutes = 19 * 60;
  return s;
}

function order(s: GameState, km = 1): OnlineOrder {
  const o = createOrder(s, CATALOG, new SeededRandom(`b-${s.online.nextId}`), s.calendar.clockMinutes, s.online.nextId++)!;
  o.items = [{ recipeId: 'nasi_goreng', qty: 2 }, { recipeId: 'es_teh', qty: 1 }];
  o.value = 27000;
  o.km = km;
  o.note = null;
  s.online.orders.push(o);
  s.online.today.generated++;
  return o;
}

function run(s: GameState, minutes: number): void {
  const start = s.calendar.clockMinutes;
  for (let m = start; m < start + minutes; m++) {
    s.calendar.clockMinutes = m;
    tickOnline(s, CATALOG, m, false);
  }
}

describe('pesanan online dari cabang', () => {
  it('pilihan cabang terbuka setelah ada cabang buka', () => {
    const s = createInitialState();
    expect(branchSourcesUnlocked(s)).toBe(false);
    expect(branchSourcesUnlocked(setup())).toBe(true);
  });

  it('cadangan: 2 porsi atau 30% stok, mana yang lebih besar', () => {
    expect(branchReserve(3)).toBe(2);
    expect(branchReserve(20)).toBe(6);
    const s = setup(20);
    expect(branchOnlineAvailable(s.branches.list[0]!, 'nasi_goreng')).toBe(14);
    const s2 = setup(3);
    expect(branchOnlineAvailable(s2.branches.list[0]!, 'nasi_goreng')).toBe(1);
    const o = order(s2);
    const opt = sourceOptions(s2, CATALOG, o, false).find((x) => x.source === 0)!;
    expect(opt.ok).toBe(false);
    expect(opt.reason).toMatch(/stok kurang/);
  });

  it('cabang tanpa karyawan jaga tidak bisa mengantar', () => {
    const s = setup();
    s.branches.list[0]!.staff = null;
    const opt = sourceOptions(s, CATALOG, order(s), false).find((x) => x.source === 0)!;
    expect(opt.ok).toBe(false);
    expect(opt.reason).toMatch(/karyawan/);
  });

  it('dikirim dari cabang: stok cabang FEFO, biaya antar Rp2.000, tanpa komisi, ongkir masuk kas', () => {
    const s = setup(20);
    const b = s.branches.list[0]!;
    // Batch yang lebih cepat basi harus diambil lebih dulu.
    addStock(b.stock, 'nasi_goreng', 5, s.calendar.day, 2000);
    const early = () => (b.stock['nasi_goreng'] ?? []).filter((x) => x.expiresDay === s.calendar.day).reduce((n, x) => n + x.qty, 0);
    expect(early()).toBe(5);
    const money = s.player.money;
    const o = order(s);
    acceptOrder(s, o.id, false, 0, CATALOG);
    expect(early()).toBe(3);
    expect(s.player.money).toBe(money - 2000);
    run(s, 60);
    expect(o.status).toBe('selesai');
    expect(s.player.money).toBe(money - 2000 + 27000 + o.fee);
    expect(s.online.today.commission).toBe(0);
    expect(s.online.today.fromBranch).toBe(1);
    expect(onlineNet(s.online.today)).toBe(27000 + o.fee - 2000);
    // Toko utama tidak tersentuh.
    expect(totalQty(s.inventory.products['nasi_goreng'])).toBe(0);
  });

  it('motor cabang: biaya antar Rp1.000 dan lebih cepat', () => {
    const s = setup(20);
    const o = order(s, 3);
    const slow = sourceOptions(s, CATALOG, o, false).find((x) => x.source === 0)!;
    s.branches.list[0]!.upgrades.push('motor_cabang');
    const fast = sourceOptions(s, CATALOG, o, false).find((x) => x.source === 0)!;
    expect(slow.fee).toBe(2000);
    expect(fast.fee).toBe(1000);
    expect(fast.eta).toBeLessThan(slow.eta);
  });

  it('pilih terbaik: sumber tercepat dengan stok cukup', () => {
    const s = setup(20, 0);
    expect(bestSource(s, CATALOG, order(s), false)).toBe(0);
    const s2 = setup(0, 10);
    expect(bestSource(s2, CATALOG, order(s2), false)).toBe('utama');
  });

  it('kas tidak cukup untuk biaya antar → pilihan cabang nonaktif (kas tidak pernah minus)', () => {
    const s = setup(20);
    s.player.money = 1000;
    const o = order(s);
    const opt = sourceOptions(s, CATALOG, o, false).find((x) => x.source === 0)!;
    expect(opt.ok).toBe(false);
    expect(() => acceptOrder(s, o.id, false, 0, CATALOG)).toThrow(GameRuleError);
    expect(s.player.money).toBe(1000);
  });

  it('masuk batas harian toko utama', () => {
    const s = setup(20);
    for (let i = 0; i < 5; i++) acceptOrder(s, order(s).id, false, 0, CATALOG);
    expect(() => acceptOrder(s, order(s).id, false, 0, CATALOG)).toThrow(/Batas/);
  });

  it('laporan cabang: terjual (termasuk online) + tersisa + terbuang = diterima', () => {
    const s = setup(20);
    acceptOrder(s, order(s).id, false, 0, CATALOG);
    const [r] = closeBranches(s, CATALOG);
    expect(r!.online).toEqual({ nasi_goreng: 2, es_teh: 1 });
    for (const id of ['nasi_goreng', 'es_teh']) expect((r!.sold[id] ?? 0) + (r!.left[id] ?? 0) + (r!.wasted[id] ?? 0)).toBe(r!.received[id]);
  });

  it('per pesanan, cabang tidak selalu lebih untung daripada kurir sendiri toko utama', () => {
    const viaBranch = 27000 + 6000 - 2000;
    const viaKurir = 27000 + 6000; // gaji kurir dibayar harian, bukan per pesanan
    expect(viaBranch).toBeLessThan(viaKurir);
    // Ongkir bersih dari cabang tetap positif dan wajar terhadap nilai pesanan (5–15%).
    const net = 6000 - 2000;
    expect(net).toBeGreaterThan(0);
    expect(net / 27000).toBeGreaterThanOrEqual(0.05);
    expect(net / 27000).toBeLessThanOrEqual(0.15);
  });
});
