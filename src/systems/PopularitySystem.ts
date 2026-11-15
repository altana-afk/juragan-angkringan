import { BALANCE_CONFIG, type PopularityTierConfig } from '../config/balanceConfig';
import { clamp } from '../utils/formatting';

/**
 * Sistem popularitas. Stage 1: penentuan tingkatan untuk HUD.
 * Stage 4 menambahkan formula naik/turun berdasarkan kepuasan pelanggan.
 */
export function clampPopularity(value: number): number {
  return clamp(value, BALANCE_CONFIG.popularityMin, BALANCE_CONFIG.popularityMax);
}

export function getPopularityTier(value: number): PopularityTierConfig {
  const v = Math.floor(clampPopularity(Number.isFinite(value) ? value : 0));
  const tiers = BALANCE_CONFIG.popularityTiers;
  const tier = tiers.find((t) => v >= t.min && v <= t.max);
  // Rentang 0–100 tertutup penuh oleh konfigurasi (diverifikasi unit test).
  if (!tier) throw new Error(`Tidak ada tingkatan popularitas untuk nilai ${v}`);
  return tier;
}

/** Ringkasan pelayanan sehari yang memengaruhi popularitas. */
export interface ServiceSummary {
  served: number;
  partial: number;
  leftEmpty: number;
  leftWaiting: number;
  happy: number;
  unhappy: number;
  /** Total porsi yang dicari tapi habis. */
  missedPortions: number;
}

/**
 * Perubahan popularitas harian.
 * - Naik: rombongan terlayani, terlayani sebagian, sangat puas (rekomendasi dari mulut ke mulut).
 * - Turun: pergi tanpa membeli, pergi karena penuh/menunggu, tidak puas, produk sering habis.
 * Kenaikan makin lambat saat popularitas sudah tinggi, dan perubahan dibatasi
 * BALANCE_CONFIG.maxDailyPopularityChange sehingga satu pelanggan tidak berpengaruh ekstrem.
 */
export function popularityDelta(summary: ServiceSummary, popularity: number): number {
  const w = BALANCE_CONFIG.popularityWeights;
  const gain = summary.served * w.served + summary.partial * w.partial + summary.happy * w.happy;
  const loss =
    summary.leftEmpty * w.leftEmpty + summary.leftWaiting * w.leftWaiting + summary.unhappy * w.unhappy + summary.missedPortions * w.missedPortion;
  const headroom = 1 - clampPopularity(popularity) / 130;
  const raw = gain * headroom - loss;
  const cap = BALANCE_CONFIG.maxDailyPopularityChange;
  return Math.round(clamp(raw, -cap, cap) * 10) / 10;
}

/** Loyalitas bergerak perlahan ke arah rata-rata kepuasan hari ini (dibobot proporsi pelanggan terlayani). */
export function nextLoyalty(loyalty: number, avgSatisfaction: number, servedRatio: number, customers: number): number {
  if (customers === 0) return Math.max(0, Math.round((loyalty - 2) * 10) / 10);
  const target = clamp(avgSatisfaction * servedRatio, 0, 100);
  return Math.round(clamp(loyalty + (target - loyalty) * 0.25, 0, 100) * 10) / 10;
}
