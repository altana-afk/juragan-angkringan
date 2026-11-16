import type { Branch, BranchDayReport, GameState } from '../core/GameState';
import { BRANCH_RULES, BRANCH_SLOTS, branchUpgradeById, MAX_BRANCHES } from '../data/branches';
import type { Catalog } from '../data/catalog';
import { eventById } from '../data/events';
import { locationById, LOCATIONS } from '../data/locations';
import { formatRupiah } from '../utils/formatting';
import { SeededRandom } from '../utils/random';
import { branchStatus } from './BranchStatusSystem';
import { branchAt, payWage, staffPerformance } from './BranchStaffSystem';
import { rollEvent } from './EventSystem';
import { consumeStock, removeExpired, totalQty } from './InventorySystem';
import { weekdayFactor } from './LocationSystem';
import { priceAppealFactor, salePriceOf } from './PricingSystem';
import { GameRuleError } from './rules';
import { effectsOf } from './UpgradeSystem';

/** Lokasi yang ditempati angkringan yang sedang buka (toko utama + cabang buka), kecuali cabang `exceptSlot`. */
export function occupiedLocations(state: Readonly<GameState>, exceptSlot: number | null = null): Map<string, string> {
  const m = new Map<string, string>([[state.mapId, 'Toko utama']]);
  for (const b of state.branches.list) if (b.open && b.slot !== exceptSlot) m.set(b.mapId, b.name);
  return m;
}

export function freeLocations(state: Readonly<GameState>, exceptSlot: number | null = null): string[] {
  const used = occupiedLocations(state, exceptSlot);
  return LOCATIONS.filter((l) => !used.has(l.id)).map((l) => l.id);
}

export interface OpenCheck {
  readonly ok: boolean;
  readonly reasons: string[];
  readonly cost: number;
  readonly slot: number | null;
}

/** Syarat membuka cabang berikutnya: level usaha, kas, popularitas, slot & lokasi kosong. */
export function canOpenBranch(state: Readonly<GameState>): OpenCheck {
  const slot = state.branches.list.length;
  if (slot >= MAX_BRANCHES) return { ok: false, reasons: [`Sudah ${MAX_BRANCHES} cabang (cabang yang ditutup tetap dihitung).`], cost: 0, slot: null };
  const def = BRANCH_SLOTS[slot]!;
  const reasons: string[] = [];
  const level = effectsOf(state).businessLevel;
  if (level < def.minLevel) reasons.push(`Butuh level usaha ${def.minLevel} (sekarang ${level}).`);
  if (state.player.popularity < def.minPopularity) reasons.push(`Butuh popularitas ${def.minPopularity} (sekarang ${Math.floor(state.player.popularity)}).`);
  if (state.player.money < def.openCost) reasons.push(`Butuh kas ${formatRupiah(def.openCost)}.`);
  if (!freeLocations(state).length) reasons.push('Semua lokasi sedang dipakai angkringan yang buka.');
  return { ok: reasons.length === 0, reasons, cost: def.openCost, slot };
}

export function openBranch(draft: GameState, mapId: string): Branch {
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Cabang hanya bisa dibuka saat persiapan.');
  const check = canOpenBranch(draft);
  if (!check.ok || check.slot === null) throw new GameRuleError('branch-locked', check.reasons[0] ?? 'Cabang belum bisa dibuka.');
  const loc = locationById(mapId);
  const used = occupiedLocations(draft).get(loc.id);
  if (used) throw new GameRuleError('location-used', `${loc.name} sedang dipakai ${used}.`);
  const def = BRANCH_SLOTS[check.slot]!;
  draft.player.money -= def.openCost;
  draft.ledger.upgradeCost += def.openCost;
  const day = draft.calendar.day;
  const b: Branch = {
    slot: def.slot,
    name: def.name,
    mapId: loc.id,
    open: true,
    staff: null,
    everHired: false,
    stock: {},
    upgrades: [],
    popularity: BRANCH_RULES.startPopularity,
    openedDay: day,
    lastMoveDay: 0,
    dayStart: {},
    shipped: {},
  };
  draft.branches.list.push(b);
  return b;
}

/** Tutup cabang sementara (tanpa biaya operasional) atau buka lagi jika lokasinya masih kosong. */
export function setBranchOpen(draft: GameState, slot: number, open: boolean): Branch {
  const b = branchAt(draft, slot);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Buka/tutup cabang hanya saat persiapan.');
  if (b.open === open) return b;
  if (open) {
    const used = occupiedLocations(draft, slot).get(b.mapId);
    if (used) throw new GameRuleError('location-used', `${locationById(b.mapId).name} sedang dipakai ${used}. Pindahkan cabang dulu.`);
  }
  b.open = open;
  return b;
}

export function moveBranch(draft: GameState, slot: number, mapId: string): Branch {
  const b = branchAt(draft, slot);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Pindah lokasi cabang hanya saat persiapan.');
  const dest = locationById(mapId);
  if (b.mapId === dest.id) throw new GameRuleError('same-location', `${b.name} sudah di ${dest.name}.`);
  if (b.lastMoveDay === draft.calendar.day) throw new GameRuleError('moved-today', `${b.name} sudah dipindah hari ini.`);
  const used = occupiedLocations(draft, slot).get(dest.id);
  if (used) throw new GameRuleError('location-used', `${dest.name} sedang dipakai ${used}.`);
  if (draft.player.money < dest.moveCost) throw new GameRuleError('money-short', `Biaya pindah ${formatRupiah(dest.moveCost)}, kas tidak cukup.`);
  draft.player.money -= dest.moveCost;
  draft.ledger.moveCost += dest.moveCost;
  b.mapId = dest.id;
  b.lastMoveDay = draft.calendar.day;
  b.popularity = Math.round(b.popularity * BRANCH_RULES.moveKeepPopularity * 10) / 10;
  return b;
}

export function buyBranchUpgrade(draft: GameState, slot: number, upgradeId: string): Branch {
  const b = branchAt(draft, slot);
  const u = branchUpgradeById(upgradeId);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', 'Upgrade cabang hanya saat persiapan.');
  if (b.upgrades.includes(u.id)) throw new GameRuleError('owned', `${u.name} sudah terpasang di ${b.name}.`);
  if (draft.player.money < u.cost) throw new GameRuleError('money-short', `${u.name} butuh ${formatRupiah(u.cost)}.`);
  draft.player.money -= u.cost;
  draft.ledger.upgradeCost += u.cost;
  b.upgrades.push(u.id);
  return b;
}

/** Event harian di lokasi cabang (deterministik per lokasi & hari, sama dengan toko utama di lokasi itu). */
export function branchEvent(state: Readonly<GameState>, catalog: Catalog, branch: Readonly<Branch>): string | null {
  return rollEvent(state.calendar.day, branch.mapId, state.unlockedRecipes, catalog)?.id ?? null;
}

/** Biaya operasional harian cabang yang tidak ditutup: sewa lokasi + biaya dasar (gaji terpisah). */
export function branchOperational(branch: Readonly<Branch>): number {
  return branch.open ? locationById(branch.mapId).rent + BRANCH_RULES.baseOperational : 0;
}

function upgradeSum(branch: Readonly<Branch>, key: 'demand' | 'popularityPerDay'): number {
  return branch.upgrades.reduce((s, id) => s + (branchUpgradeById(id).effects[key] ?? 0), 0);
}

/** Perkiraan porsi yang laku hari ini di cabang buka penuh (sebelum dibatasi stok). */
export function branchDemand(state: Readonly<GameState>, catalog: Catalog, branch: Readonly<Branch>): number {
  const loc = locationById(branch.mapId);
  const evId = branchEvent(state, catalog, branch);
  const arrival = evId ? eventById(evId).effects.arrival ?? 1 : 1;
  const rain = state.weather === 'hujan' ? BRANCH_RULES.rainDemand : 1;
  const base = BRANCH_RULES.baseDemand + branch.popularity * BRANCH_RULES.demandPerPopularity;
  return base * weekdayFactor(loc, state.calendar.day) * arrival * rain * staffPerformance(branch) * (1 + upgradeSum(branch, 'demand'));
}

const count = (group: Record<string, { qty: number }[]>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [id, b] of Object.entries(group)) {
    const q = totalQty(b as never);
    if (q > 0) out[id] = q;
  }
  return out;
};

/** Catat stok awal hari (dipanggil saat hari baru dimulai). */
export function resetBranchesDay(draft: GameState): void {
  for (const b of draft.branches.list) {
    b.dayStart = count(b.stock);
    b.shipped = {};
  }
}

/**
 * Jalankan penjualan latar belakang semua cabang saat toko utama tutup:
 * jual stok sesuai permintaan, potong selisih kas, buang produk basi, bayar operasional & gaji,
 * ubah popularitas cabang. Uang bersih masuk kas. Mengembalikan laporan per cabang.
 */
export function closeBranches(draft: GameState, catalog: Catalog): BranchDayReport[] {
  const day = draft.calendar.day;
  const reports: BranchDayReport[] = [];
  for (const b of draft.branches.list) {
    const status = branchStatus(b);
    const received: Record<string, number> = { ...b.dayStart };
    for (const [id, q] of Object.entries(b.shipped)) received[id] = (received[id] ?? 0) + q;
    const sold: Record<string, number> = {};
    let revenue = 0;
    let portions = 0;
    let popDelta = 0;
    const evId = b.open ? branchEvent(draft, catalog, b) : null;

    if (status === 'penuh') {
      const rng = new SeededRandom(`branch-${b.slot}-${day}`);
      const want = Math.round(branchDemand(draft, catalog, b) * (0.85 + rng.next() * 0.3));
      for (let i = 0; i < want; i++) {
        const options = Object.entries(b.stock)
          .map(([id, batches]) => ({ id, qty: totalQty(batches) }))
          .filter((o) => o.qty > 0);
        if (!options.length) break;
        const pick = rng.weightedPick(
          options.map((o) => {
            const r = catalog.recipe(o.id);
            return { item: o, weight: Math.sqrt(o.qty) * priceAppealFactor(salePriceOf(draft, r) / r.salePrice) };
          }),
        );
        consumeStock(b.stock, pick.id, 1);
        sold[pick.id] = (sold[pick.id] ?? 0) + 1;
        revenue += salePriceOf(draft, catalog.recipe(pick.id));
        portions++;
      }
      popDelta = (portions >= want * 0.9 ? BRANCH_RULES.goodDayPopularity : 0) + upgradeSum(b, 'popularityPerDay');
    } else if (status === 'tanpa_produk') {
      popDelta = BRANCH_RULES.noProductPopularity;
    }

    // Selisih kas: makin besar saat gaji telat, berkurang dengan kasir & buku catatan.
    const shrinkFactor = b.upgrades.reduce((f, id) => f * (branchUpgradeById(id).effects.shrinkFactor ?? 1), 1);
    const late = b.staff?.lateStreak ?? 0;
    const shrink = Math.round((revenue * (BRANCH_RULES.shrinkBase + BRANCH_RULES.shrinkPerLate * late) * shrinkFactor) / 100) * 100;

    // Produk yang kedaluwarsa malam ini terbuang (tanpa karyawan: tidak ada yang terjual sama sekali).
    const expired = removeExpired(b.stock, day + 1);
    const wasted: Record<string, number> = {};
    for (const [id, v] of Object.entries(expired)) if (v.qty > 0) wasted[id] = v.qty;

    const operational = branchOperational(b);
    draft.player.money += revenue - shrink - operational;
    draft.stats.totalRevenue += revenue;
    const staffName = b.staff?.name ?? null;
    const pay = payWage(draft, b);

    b.popularity = Math.max(0, Math.min(100, Math.round((b.popularity + popDelta) * 10) / 10));
    reports.push({
      slot: b.slot,
      name: b.name,
      mapId: b.mapId,
      status,
      eventId: evId,
      staffName,
      portions,
      revenue,
      shrink,
      operational,
      wage: pay.wage,
      wageLate: pay.late,
      staffQuit: pay.quit,
      net: revenue - shrink - operational - pay.wage,
      popularityDelta: popDelta,
      received,
      sold,
      left: count(b.stock),
      wasted,
    });
    b.dayStart = count(b.stock);
    b.shipped = {};
  }
  return reports;
}
