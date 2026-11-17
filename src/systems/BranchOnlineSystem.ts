import type { Branch, GameState, OnlineOrder } from '../core/GameState';
import { BRANCH_RULES, branchUpgradeById } from '../data/branches';
import type { Catalog } from '../data/catalog';
import { modeById, ONLINE_RULES } from '../data/online';
import { travelFactor, travelMinutes } from './CourierSystem';
import { consumeStock, totalQty } from './InventorySystem';
import { orderNeeds, stockShortfall } from './OnlineOrderSystem';
import { effectsOf } from './UpgradeSystem';

/** Sumber pengiriman pesanan online: 'utama' atau nomor slot cabang. */
export type OnlineSource = 'utama' | number;

export interface SourceOption {
  readonly source: OnlineSource;
  readonly label: string;
  readonly ok: boolean;
  /** Alasan singkat kalau tidak bisa (null = bisa). */
  readonly reason: string | null;
  /** Perkiraan menit sampai pesanan tiba di pembeli. */
  readonly eta: number;
  /** Biaya antar yang dibayar dari kas (cabang). */
  readonly fee: number;
  /** Stok yang bisa dipakai per menu pesanan (cabang: di atas cadangan). */
  readonly available: Record<string, number>;
}

/** Cadangan untuk pembeli di tempat: 2 porsi atau 30% stok, mana yang lebih besar. */
export function branchReserve(stockQty: number): number {
  return Math.max(BRANCH_RULES.onlineReserveMin, Math.ceil(stockQty * BRANCH_RULES.onlineReserveShare));
}

/** Porsi menu ini yang boleh dipakai pesanan online dari cabang. */
export function branchOnlineAvailable(branch: Readonly<Branch>, recipeId: string): number {
  const q = totalQty(branch.stock[recipeId]);
  return Math.max(0, q - branchReserve(q));
}

function hasMotor(branch: Readonly<Branch>): boolean {
  return branch.upgrades.some((id) => branchUpgradeById(id).effects.freeShipping);
}

/** Biaya antar per pesanan dari cabang (dipotong dari kas). */
export function branchOnlineFee(branch: Readonly<Branch>): number {
  return hasMotor(branch) ? BRANCH_RULES.onlineFeeMotor : BRANCH_RULES.onlineFee;
}

/** Pilihan sumber pengiriman terbuka setelah ada minimal satu cabang buka. */
export function branchSourcesUnlocked(state: Readonly<GameState>): boolean {
  return state.branches.list.some((b) => b.open);
}

function prepMinutes(order: OnlineOrder, honorNote: boolean): number {
  return ONLINE_RULES.prepMinutes + (honorNote && order.note ? order.note.extraMinutes : 0);
}

/** Pilihan toko utama: perkiraan waktu dari cara mengantar sekarang. */
function mainOption(state: Readonly<GameState>, order: OnlineOrder, honorNote: boolean): SourceOption {
  const mode = state.online.mode ?? 'ojol';
  const def = modeById(mode);
  const wait = mode === 'ojol' ? (def.waitMinutes[0] + def.waitMinutes[1]) / 2 : ONLINE_RULES.kurirDispatchWait / 2;
  const travel = travelMinutes(order.km, travelFactor(mode, state.weather, effectsOf(state).courierSpeed));
  const short = stockShortfall(state, order, honorNote);
  const available: Record<string, number> = {};
  for (const id of orderNeeds(order, honorNote).keys()) available[id] = totalQty(state.inventory.products[id]);
  return {
    source: 'utama',
    label: 'Toko utama',
    ok: short.length === 0,
    reason: short.length ? 'stok kurang' : null,
    eta: Math.round(Math.max(prepMinutes(order, honorNote), wait) + travel),
    fee: 0,
    available,
  };
}

/** Pilihan satu cabang beserta alasannya kalau tidak bisa. */
export function branchOption(state: Readonly<GameState>, catalog: Catalog, order: OnlineOrder, branch: Readonly<Branch>, honorNote: boolean): SourceOption {
  const needs = orderNeeds(order, honorNote);
  const available: Record<string, number> = {};
  for (const id of needs.keys()) available[id] = branchOnlineAvailable(branch, id);
  const fee = branchOnlineFee(branch);
  const factor = travelFactor('kurir', state.weather, 0) * (hasMotor(branch) ? 1 : BRANCH_RULES.onlineSlowNoMotor);
  const eta = prepMinutes(order, honorNote) + travelMinutes(order.km, factor);
  let reason: string | null = null;
  if (!branch.open) reason = 'cabang tutup';
  else if (!branch.staff) reason = 'tidak ada karyawan jaga';
  else {
    // Item tambahan dari catatan tidak wajib — kalau tidak ada, catatan saja yang tidak dipenuhi.
    const extra = honorNote ? order.note?.extraItem ?? null : null;
    const short = [...needs].filter(([id, n]) => available[id]! < n && !(id === extra && order.items.every((l) => l.recipeId !== id)));
    if (short.length) reason = `stok kurang: ${short.map(([id]) => catalog.recipe(id).name).join(', ')}`;
    else if (state.player.money < fee) reason = 'kas tidak cukup untuk biaya antar';
  }
  return { source: branch.slot, label: branch.name, ok: reason === null, reason, eta, fee, available };
}

/** Semua pilihan sumber: toko utama dulu, lalu cabang (yang bisa lebih dulu, lalu tercepat). */
export function sourceOptions(state: Readonly<GameState>, catalog: Catalog, order: OnlineOrder, honorNote: boolean): SourceOption[] {
  const branches = state.branches.list
    .filter((b) => b.open)
    .map((b) => branchOption(state, catalog, order, b, honorNote))
    .sort((a, b) => Number(b.ok) - Number(a.ok) || a.eta - b.eta);
  return [mainOption(state, order, honorNote), ...branches];
}

/** Sumber tercepat yang stoknya cukup (null jika tidak ada). */
export function bestSource(state: Readonly<GameState>, catalog: Catalog, order: OnlineOrder, honorNote: boolean): OnlineSource | null {
  const ok = sourceOptions(state, catalog, order, honorNote).filter((o) => o.ok);
  ok.sort((a, b) => a.eta - b.eta || a.fee - b.fee);
  return ok[0]?.source ?? null;
}

/**
 * Siapkan pesanan dari cabang: ambil stok cabang (FEFO, hanya di atas cadangan), bayar biaya antar,
 * langsung diantar karyawan/kurir cabang. Dipanggil dari acceptOrder setelah pemeriksaan dasar.
 */
export function dispatchFromBranch(draft: GameState, catalog: Catalog, order: OnlineOrder, slot: number): void {
  const b = draft.branches.list.find((x) => x.slot === slot);
  if (!b) throw new Error('Cabang tidak ditemukan');
  const opt = branchOption(draft, catalog, order, b, order.noteHonored);
  if (!opt.ok) throw new Error(opt.reason ?? 'Cabang tidak bisa mengirim');
  const needs = orderNeeds(order);
  const extra = order.note?.extraItem;
  if (extra && order.noteHonored && opt.available[extra]! < (needs.get(extra) ?? 0) && order.items.every((l) => l.recipeId !== extra)) {
    order.noteHonored = false;
    needs.delete(extra);
  }
  let cost = 0;
  b.onlineOut ??= {};
  for (const [id, n] of needs) {
    cost += consumeStock(b.stock, id, n);
    b.onlineOut[id] = (b.onlineOut[id] ?? 0) + n;
    draft.ledger.sold[id] = (draft.ledger.sold[id] ?? 0) + n;
    draft.stats.totalPortionsSold += n;
  }
  draft.ledger.costOfSales += cost;
  draft.player.money -= opt.fee;
  const t = draft.online.today;
  t.fromBranch = (t.fromBranch ?? 0) + 1;
  t.branchFees = (t.branchFees ?? 0) + opt.fee;
  const minute = draft.calendar.clockMinutes;
  order.source = slot;
  order.status = 'diantar';
  order.readyMinute = minute + prepMinutes(order, order.noteHonored);
  order.pickupMinute = order.readyMinute;
  order.deliveredMinute = minute + opt.eta;
  // Janji waktu: tanpa hujan, ditambah kelonggaran — hujan bisa membuat terlambat.
  const promise = prepMinutes(order, order.noteHonored) + travelMinutes(order.km, hasMotor(b) ? 1 : BRANCH_RULES.onlineSlowNoMotor);
  order.dueMinute = minute + promise + ONLINE_RULES.dueSlack;
}
