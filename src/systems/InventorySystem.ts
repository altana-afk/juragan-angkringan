import type { StockBatch } from '../core/GameState';
import { GameRuleError } from './rules';
import { tr } from '../i18n/i18n';

/**
 * Sistem inventaris berbasis batch: setiap batch punya jumlah, hari kedaluwarsa, dan modal per satuan.
 * Stok dipakai dengan aturan FEFO (yang paling cepat kedaluwarsa dipakai lebih dulu)
 * dan tidak pernah bisa negatif.
 */

export type StockGroup = Record<string, StockBatch[]>;

export function totalQty(batches: readonly StockBatch[] | undefined): number {
  return (batches ?? []).reduce((sum, b) => sum + b.qty, 0);
}

/** Hari kedaluwarsa terdekat, atau null jika stok awet / kosong. */
export function nearestExpiry(batches: readonly StockBatch[] | undefined): number | null {
  let best: number | null = null;
  for (const b of batches ?? []) if (b.expiresDay !== null && (best === null || b.expiresDay < best)) best = b.expiresDay;
  return best;
}

const expiryOrder = (e: number | null): number => (e === null ? Number.POSITIVE_INFINITY : e);

/** Tambah stok. Batch dengan kedaluwarsa & modal sama digabung; urutan dijaga dari yang tercepat kedaluwarsa. */
export function addStock(group: StockGroup, id: string, qty: number, expiresDay: number | null, unitCost: number): void {
  if (!Number.isInteger(qty) || qty <= 0) throw new GameRuleError('qty-invalid', tr('Jumlah stok harus bilangan bulat positif ({qty})', { qty }));
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new GameRuleError('cost-invalid', tr('Modal per satuan tidak valid'));
  const batches = group[id] ?? [];
  const same = batches.find((b) => b.expiresDay === expiresDay && Math.abs(b.unitCost - unitCost) < 1e-6);
  if (same) {
    same.qty += qty;
  } else {
    batches.push({ qty, expiresDay, unitCost });
    batches.sort((a, b) => expiryOrder(a.expiresDay) - expiryOrder(b.expiresDay));
  }
  group[id] = batches;
}

/**
 * Ambil stok sebanyak qty (FEFO). Melempar error tanpa mengubah apa pun jika stok kurang.
 * Mengembalikan total modal dari stok yang terpakai.
 */
export function consumeStock(group: StockGroup, id: string, qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new GameRuleError('qty-invalid', tr('Jumlah harus bilangan bulat positif ({qty})', { qty }));
  const batches = group[id] ?? [];
  const have = totalQty(batches);
  if (have < qty) throw new GameRuleError('stock-short', tr('Stok {id} kurang: butuh {qty}, ada {have}', { id, qty, have }), { id, need: qty, have });
  let remaining = qty;
  let cost = 0;
  for (const batch of batches) {
    if (remaining === 0) break;
    const take = Math.min(batch.qty, remaining);
    batch.qty -= take;
    remaining -= take;
    cost += take * batch.unitCost;
  }
  const left = batches.filter((b) => b.qty > 0);
  if (left.length) group[id] = left;
  else delete group[id];
  return cost;
}

/** Buang stok yang kedaluwarsa sebelum `day`. Mengembalikan jumlah & nilai modal yang terbuang per id. */
export function removeExpired(group: StockGroup, day: number): Record<string, { qty: number; cost: number }> {
  const removed: Record<string, { qty: number; cost: number }> = {};
  for (const [id, batches] of Object.entries(group)) {
    const keep: StockBatch[] = [];
    for (const b of batches) {
      if (b.expiresDay !== null && b.expiresDay < day) {
        const r = (removed[id] ??= { qty: 0, cost: 0 });
        r.qty += b.qty;
        r.cost += b.qty * b.unitCost;
      } else keep.push(b);
    }
    if (keep.length) group[id] = keep;
    else delete group[id];
  }
  return removed;
}
