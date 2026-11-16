import type { Branch, BranchStatus, GameState } from '../core/GameState';
import { totalQty } from './InventorySystem';

/** Jumlah produk siap jual di cabang. */
export function branchStockTotal(branch: Readonly<Branch>): number {
  return Object.values(branch.stock).reduce((s, b) => s + totalQty(b), 0);
}

/** Status cabang dari buka/tutup, karyawan, dan produk. */
export function branchStatus(branch: Readonly<Branch>): BranchStatus {
  if (!branch.open) return 'tutup';
  const hasStaff = branch.staff !== null;
  const hasStock = branchStockTotal(branch) > 0;
  if (hasStaff && hasStock) return 'penuh';
  if (hasStaff) return 'tanpa_produk';
  if (hasStock) return 'tanpa_karyawan';
  return 'kosong';
}

export const BRANCH_STATUS_LABEL: Record<BranchStatus, string> = {
  penuh: 'Buka penuh',
  tanpa_produk: 'Buka tanpa produk',
  tanpa_karyawan: 'Buka tanpa karyawan',
  kosong: 'Buka tanpa karyawan & produk',
  tutup: 'Tutup',
};

export const BRANCH_STATUS_TONE: Record<BranchStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  penuh: 'good',
  tanpa_produk: 'warn',
  tanpa_karyawan: 'warn',
  kosong: 'bad',
  tutup: 'neutral',
};

/** Cabang buka yang perlu perhatian (tanpa karyawan atau tanpa produk). */
export function branchNeedsAttention(branch: Readonly<Branch>): boolean {
  const s = branchStatus(branch);
  return s !== 'penuh' && s !== 'tutup';
}

export function anyBranchNeedsAttention(state: Readonly<GameState>): boolean {
  return state.branches.list.some(branchNeedsAttention);
}
