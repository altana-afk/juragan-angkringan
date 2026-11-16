import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { dailyWage, STAFF_RULES } from '../src/data/branches';
import { closeDay } from '../src/systems/DayCloseSystem';
import { addStock } from '../src/systems/InventorySystem';
import { branchStatus } from '../src/systems/BranchStatusSystem';
import { buyBranchUpgrade, canOpenBranch, closeBranches, openBranch, setBranchOpen } from '../src/systems/BranchSystem';
import { changeWagePlan, dismissStaff, hireStaff, staffPerformance } from '../src/systems/BranchStaffSystem';
import { shipFee, shipToBranch } from '../src/systems/BranchSupplySystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { GameRuleError } from '../src/systems/rules';

function rich(level = 4, pop = 80): GameState {
  const s = createInitialState();
  s.player.money = 50_000_000;
  s.player.popularity = pop;
  s.calendar.day = 10;
  const carts = ['gerobak_standar', 'gerobak_modern', 'gerobak_premium'].slice(0, level - 1);
  s.upgrades.push(...carts);
  return s;
}

function stocked(s: GameState, qty = 60): void {
  for (const id of s.unlockedRecipes) addStock(s.inventory.products, id, qty, s.calendar.day + 1, 3000);
}

const throwsRule = (fn: () => unknown, code: string): void => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameRuleError);
    expect((e as GameRuleError).code).toBe(code);
    return;
  }
  throw new Error(`tidak melempar ${code}`);
};

describe('membuka cabang', () => {
  it('cabang 1/2/3 butuh level usaha 2/3/4, kas & popularitas', () => {
    const s = rich(1, 80);
    expect(canOpenBranch(s).ok).toBe(false);
    expect(canOpenBranch(s).reasons.join()).toMatch(/level usaha 2/);
    s.upgrades.push('gerobak_standar');
    expect(canOpenBranch(s).ok).toBe(true);
    openBranch(s, 'kampus');
    expect(canOpenBranch(s).reasons.join()).toMatch(/level usaha 3/);
    s.upgrades.push('gerobak_modern');
    openBranch(s, 'pasar');
    expect(canOpenBranch(s).reasons.join()).toMatch(/level usaha 4/);
    s.upgrades.push('gerobak_premium');
    openBranch(s, 'stasiun');
    expect(s.branches.list.map((b) => b.slot)).toEqual([0, 1, 2]);
  });

  it('biaya naik per cabang dan popularitas minimal 40/55/70', () => {
    const s = rich(4, 45);
    const m0 = s.player.money;
    openBranch(s, 'kampus');
    expect(m0 - s.player.money).toBe(1_500_000);
    expect(canOpenBranch(s).reasons.join()).toMatch(/popularitas 55/);
    s.player.popularity = 60;
    openBranch(s, 'pasar');
    expect(m0 - s.player.money).toBe(4_500_000);
    expect(canOpenBranch(s).reasons.join()).toMatch(/popularitas 70/);
  });

  it('maksimal 3 cabang — cabang yang ditutup tetap dihitung', () => {
    const s = rich();
    openBranch(s, 'kampus');
    setBranchOpen(s, 0, false);
    openBranch(s, 'pasar');
    openBranch(s, 'stasiun');
    expect(canOpenBranch(s).ok).toBe(false);
    throwsRule(() => openBranch(s, 'pasar-malam'), 'branch-locked');
  });
});

describe('status & penjualan cabang', () => {
  it('status dari karyawan dan produk', () => {
    const s = rich();
    const b = openBranch(s, 'kampus');
    expect(branchStatus(b)).toBe('kosong');
    stocked(s);
    shipToBranch(s, CATALOG, 0, { [s.unlockedRecipes[0]!]: 10 });
    expect(branchStatus(b)).toBe('tanpa_karyawan');
    hireStaff(s, 0, 'harian');
    expect(branchStatus(b)).toBe('penuh');
    setBranchOpen(s, 0, false);
    expect(branchStatus(b)).toBe('tutup');
  });

  it('terjual + tersisa + terbuang = stok diterima, uang bersih masuk kas', () => {
    const s = rich();
    openBranch(s, 'kampus');
    hireStaff(s, 0, 'harian');
    stocked(s);
    const items = Object.fromEntries(s.unlockedRecipes.map((id) => [id, 20]));
    shipToBranch(s, CATALOG, 0, items);
    const before = s.player.money;
    const [r] = closeBranches(s, CATALOG);
    expect(r!.status).toBe('penuh');
    expect(r!.portions).toBeGreaterThan(15);
    for (const id of Object.keys(items)) {
      expect((r!.sold[id] ?? 0) + (r!.left[id] ?? 0) + (r!.wasted[id] ?? 0)).toBe(r!.received[id]);
    }
    expect(s.player.money - before).toBe(r!.net);
    expect(r!.operational).toBe(15000 + 10000);
    expect(r!.wage).toBe(30000);
  });

  it('buka tanpa produk: popularitas cabang −3; tanpa karyawan: produk basi hilang, tidak ada yang terjual', () => {
    const s = rich();
    const b = openBranch(s, 'kampus');
    hireStaff(s, 0, 'harian');
    const pop = b.popularity;
    let [r] = closeBranches(s, CATALOG);
    expect(r!.status).toBe('tanpa_produk');
    expect(b.popularity).toBe(pop - 3);
    expect(r!.operational).toBeGreaterThan(0);

    const s2 = rich();
    openBranch(s2, 'kampus');
    stocked(s2);
    const id = s2.unlockedRecipes[0]!;
    // Stok kedaluwarsa hari ini.
    s2.inventory.products[id]![0]!.expiresDay = s2.calendar.day;
    shipToBranch(s2, CATALOG, 0, { [id]: 8 });
    [r] = closeBranches(s2, CATALOG);
    expect(r!.status).toBe('tanpa_karyawan');
    expect(r!.portions).toBe(0);
    expect(r!.wasted[id]).toBe(8);
  });

  it('cabang tutup: tanpa biaya operasional dan tidak bisa dikirimi stok', () => {
    const s = rich();
    openBranch(s, 'kampus');
    setBranchOpen(s, 0, false);
    stocked(s);
    throwsRule(() => shipToBranch(s, CATALOG, 0, { [s.unlockedRecipes[0]!]: 5 }), 'branch-closed');
    const [r] = closeBranches(s, CATALOG);
    expect(r!.operational).toBe(0);
    expect(r!.net).toBe(0);
  });

  it('ongkir gratis dengan kurir sendiri atau motor cabang', () => {
    const s = rich();
    const b = openBranch(s, 'kampus');
    expect(shipFee(s, b)).toBe(5000);
    s.online.mode = 'kurir';
    expect(shipFee(s, b)).toBe(0);
    s.online.mode = 'ojol';
    buyBranchUpgrade(s, 0, 'motor_cabang');
    expect(shipFee(s, b)).toBe(0);
  });

  it('laporan hari memuat cabang dan laba bersih ikut menghitungnya', () => {
    const s = rich();
    openBranch(s, 'kampus');
    hireStaff(s, 0, 'harian');
    stocked(s);
    shipToBranch(s, CATALOG, 0, Object.fromEntries(s.unlockedRecipes.map((id) => [id, 15])));
    s.phase = 'berjualan';
    const report = closeDay(s, CATALOG);
    expect(report.branches).toHaveLength(1);
    expect(report.netProfit).toBeLessThan(report.revenue + report.branches![0]!.net + 1);
  });
});

describe('karyawan & gaji', () => {
  it('gaji per hari: harian penuh, mingguan & bulanan dibagi jumlah hari', () => {
    expect(dailyWage('harian')).toBe(30000);
    expect(dailyWage('mingguan')).toBe(25700);
    expect(dailyWage('bulanan')).toBe(23300);
  });

  it('pilihan mingguan/bulanan terikat sampai masa ikatannya habis', () => {
    const s = rich();
    openBranch(s, 'kampus');
    hireStaff(s, 0, 'mingguan');
    throwsRule(() => changeWagePlan(s, 0, 'harian'), 'bound');
    throwsRule(() => dismissStaff(s, 0), 'bound');
    s.calendar.day += 7;
    changeWagePlan(s, 0, 'harian');
    dismissStaff(s, 0);
    expect(s.branches.list[0]!.staff).toBeNull();
  });

  it('gaji telat menurunkan kinerja; telat 3× berturut-turut → keluar; rekrut lagi bayar 50.000', () => {
    const s = rich();
    const b = openBranch(s, 'kampus');
    hireStaff(s, 0, 'harian');
    expect(staffPerformance(b)).toBe(1);
    s.player.money = 0;
    closeBranches(s, CATALOG);
    expect(b.staff!.lateStreak).toBe(1);
    expect(staffPerformance(b)).toBeCloseTo(0.85);
    closeBranches(s, CATALOG);
    const [r] = closeBranches(s, CATALOG);
    expect(r!.staffQuit).toBe(true);
    expect(b.staff).toBeNull();
    s.player.money = 100000;
    hireStaff(s, 0, 'harian');
    expect(s.player.money).toBe(100000 - STAFF_RULES.rehireCost);
  });

  it('gaji dibayar → telat direset; pelatihan menaikkan kinerja', () => {
    const s = rich();
    const b = openBranch(s, 'kampus');
    hireStaff(s, 0, 'harian');
    s.player.money = 0;
    closeBranches(s, CATALOG);
    s.player.money = 1_000_000;
    closeBranches(s, CATALOG);
    expect(b.staff!.lateStreak).toBe(0);
    buyBranchUpgrade(s, 0, 'pelatihan_karyawan');
    expect(staffPerformance(b)).toBeCloseTo(1.15);
  });

  it('bulanan tetap dibayar walaupun cabang ditutup selama masih terikat', () => {
    const s = rich();
    openBranch(s, 'kampus');
    hireStaff(s, 0, 'bulanan');
    setBranchOpen(s, 0, false);
    const [r] = closeBranches(s, CATALOG);
    expect(r!.operational).toBe(0);
    expect(r!.wage).toBe(23300);
  });
});

describe('save lama', () => {
  it('save v11 tanpa data cabang tetap bisa dimuat', () => {
    const s = createInitialState() as unknown as Record<string, unknown>;
    delete s.branches;
    const m = migrateSave({ version: 11, savedAt: '', state: s }) as unknown as GameState;
    expect(m.branches.list).toEqual([]);
    expect(m.branches.flags.hint).toBe(false);
  });
});

describe('keseimbangan', () => {
  it('cabang buka penuh dengan kinerja normal mencapai 20–30+ porsi dan untung', () => {
    const s = rich(2, 40);
    openBranch(s, 'main-street' === s.mapId ? 'kampus' : 'main-street');
    hireStaff(s, 0, 'harian');
    let portions = 0;
    let net = 0;
    for (let d = 0; d < 14; d++) {
      stocked(s, 40);
      shipToBranch(s, CATALOG, 0, Object.fromEntries(s.unlockedRecipes.map((id) => [id, 12])));
      const [r] = closeBranches(s, CATALOG);
      portions += r!.portions;
      net += r!.net;
      s.calendar.day++;
    }
    expect(portions / 14).toBeGreaterThanOrEqual(20);
    expect(net).toBeGreaterThan(0);
  });

  it('cabang tidak selalu menguntungkan: tanpa produk tetap rugi biaya operasional', () => {
    const s = rich();
    openBranch(s, 'stasiun');
    hireStaff(s, 0, 'harian');
    let net = 0;
    for (let d = 0; d < 5; d++) {
      net += closeBranches(s, CATALOG)[0]!.net;
      s.calendar.day++;
    }
    expect(net).toBeLessThan(0);
  });
});
