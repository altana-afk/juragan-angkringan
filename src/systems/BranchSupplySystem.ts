import type { Branch, GameState, StockBatch } from '../core/GameState';
import { BRANCH_RULES, branchUpgradeById } from '../data/branches';
import type { Catalog } from '../data/catalog';
import { formatRupiah } from '../utils/formatting';
import { addStock, totalQty, type StockGroup } from './InventorySystem';
import { branchAt } from './BranchStaffSystem';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

/** Ambil batch (FEFO) dari stok — tanggal kedaluwarsa & modal ikut terbawa. */
function takeBatches(group: StockGroup, id: string, qty: number): StockBatch[] {
  const batches = group[id] ?? [];
  const out: StockBatch[] = [];
  let remaining = qty;
  for (const b of batches) {
    if (remaining === 0) break;
    const take = Math.min(b.qty, remaining);
    b.qty -= take;
    remaining -= take;
    out.push({ qty: take, expiresDay: b.expiresDay, unitCost: b.unitCost });
  }
  const left = batches.filter((b) => b.qty > 0);
  if (left.length) group[id] = left;
  else delete group[id];
  return out;
}

/** Ongkos kirim stok ke cabang: gratis jika pakai kurir sendiri (0.13.0) atau cabang punya motor pengantar. */
export function shipFee(state: Readonly<GameState>, branch: Readonly<Branch>): number {
  if (state.online.mode === 'kurir') return 0;
  if (branch.upgrades.some((id) => branchUpgradeById(id).effects.freeShipping)) return 0;
  return BRANCH_RULES.shipFee;
}

export function shelfBonus(branch: Readonly<Branch>): number {
  return branch.upgrades.reduce((s, id) => s + (branchUpgradeById(id).effects.shelfDays ?? 0), 0);
}

/** Kirim produk siap jual dari toko utama ke cabang (saat persiapan, cabang harus buka). */
export function shipToBranch(draft: GameState, catalog: Catalog, slot: number, items: Record<string, number>): { qty: number; fee: number } {
  const b = branchAt(draft, slot);
  if (draft.phase !== 'persiapan') throw new GameRuleError('wrong-phase', tr('Kirim stok ke cabang hanya saat persiapan.'));
  if (!b.open) throw new GameRuleError('branch-closed', tr('{name} sedang tutup. Buka dulu sebelum mengirim stok.', { name: b.name }));
  const lines = Object.entries(items).filter(([, q]) => q > 0);
  if (!lines.length) throw new GameRuleError('qty-invalid', tr('Pilih produk yang mau dikirim.'));
  for (const [id, q] of lines) {
    if (!Number.isInteger(q)) throw new GameRuleError('qty-invalid', tr('Jumlah harus bilangan bulat.'));
    const have = totalQty(draft.inventory.products[id]);
    if (have < q) throw new GameRuleError('stock-short', tr('Stok {name} kurang: ada {have}.', { name: catalog.recipe(id).name, have }));
  }
  const fee = shipFee(draft, b);
  if (draft.player.money < fee) throw new GameRuleError('money-short', tr('Ongkos kirim {fee}, kas tidak cukup.', { fee: formatRupiah(fee) }));
  draft.player.money -= fee;
  draft.ledger.operationalCost += fee;
  const bonus = shelfBonus(b);
  let qty = 0;
  for (const [id, q] of lines) {
    for (const batch of takeBatches(draft.inventory.products, id, q)) {
      addStock(b.stock, id, batch.qty, batch.expiresDay === null ? null : batch.expiresDay + bonus, batch.unitCost);
    }
    b.shipped[id] = (b.shipped[id] ?? 0) + q;
    qty += q;
  }
  return { qty, fee };
}
