import { eventById } from '../data/events';
import { processBankAtClose } from './BankSystem';
import { reviewDelta } from './EventSystem';
import { locationOf } from './LocationSystem';
import { ECONOMY_CONFIG } from '../config/economyConfig';
import { HISTORY_LIMIT, type DayReport, type GameState, type StockBatch } from '../core/GameState';
import type { Catalog } from '../data/catalog';
import { totalQty } from './InventorySystem';
import { clampPopularity, nextLoyalty, popularityDelta } from './PopularitySystem';

/** Stok yang akan basi malam ini (kedaluwarsa sebelum hari berikutnya). */
function expiringTonight(group: Record<string, StockBatch[]>, day: number): { list: [string, number][]; cost: number } {
  const list: [string, number][] = [];
  let cost = 0;
  for (const [id, batches] of Object.entries(group)) {
    let qty = 0;
    for (const b of batches) {
      if (b.expiresDay !== null && b.expiresDay < day + 1) {
        qty += b.qty;
        cost += b.qty * b.unitCost;
      }
    }
    if (qty > 0) list.push([id, qty]);
  }
  return { list, cost };
}

/**
 * Tutup hari: tagih biaya operasional, hitung perubahan popularitas & loyalitas,
 * susun laporan harian, simpan ke riwayat. Dipanggil sekali saat simulasi berjualan selesai.
 */
export const BANKRUPT_AFTER_DAYS = 3;

export function closeDay(draft: GameState, catalog: Catalog): DayReport {
  void catalog;
  const l = draft.ledger;
  const day = draft.calendar.day;
  // Sewa/operasional tergantung lokasi (Jalan Kampung Rp10.000, Dekat Kampus Rp15.000).
  // + retribusi event (mis. pasar malam).
  const operational = (locationOf(draft).rent ?? ECONOMY_CONFIG.dailyOperationalCost) + (draft.event ? eventById(draft.event.id).effects.fee ?? 0 : 0);
  draft.player.money -= operational;
  l.operationalCost += operational;

  const missedPortions = Object.values(l.missed).reduce((s, n) => s + n, 0);
  const before = draft.player.popularity;
  const delta = popularityDelta(
    { served: l.served, partial: l.partial, leftEmpty: l.leftEmpty, leftWaiting: l.leftWaiting, happy: l.happy, unhappy: l.unhappy, missedPortions },
    before,
  );
  const avgSatisfaction = l.customers > 0 ? Math.round(l.satisfactionSum / l.customers) : 0;
  const review = reviewDelta(draft, avgSatisfaction);
  draft.player.popularity = Math.round(clampPopularity(before + delta + review) * 10) / 10;
  if (l.customers >= 10 && l.leftEmpty + l.leftWaiting + l.unhappy === 0) draft.stats.perfectDays += 1;
  const bank = processBankAtClose(draft);
  const servedRatio = l.customers > 0 ? (l.served + l.partial * 0.6) / l.customers : 0;
  draft.player.loyalty = nextLoyalty(draft.player.loyalty, avgSatisfaction, servedRatio, l.customers);

  const products = expiringTonight(draft.inventory.products, day);
  const ingredients = expiringTonight(draft.inventory.ingredients, day);
  const bySold = (a: [string, number], b: [string, number]): number => b[1] - a[1];
  const leastSold: [string, number, number][] = Object.entries(l.prepared)
    .map(([id, made]): [string, number, number] => [id, l.sold[id] ?? 0, made])
    .filter(([, sold, made]) => sold < made)
    .sort((a, b) => a[1] / a[2] - b[1] / b[2])
    .slice(0, 3);

  const report: DayReport = {
    day,
    customers: l.customers,
    served: l.served,
    partial: l.partial,
    leftEmpty: l.leftEmpty,
    leftWaiting: l.leftWaiting,
    avgSatisfaction,
    revenue: l.revenue,
    ingredientCost: l.purchaseTotal,
    promotionCost: l.promotionCost,
    operationalCost: l.operationalCost,
    netProfit: l.revenue - l.purchaseTotal - l.promotionCost - l.operationalCost + l.bankIncome - l.loanCost - l.moveCost,
    costOfSales: Math.round(l.costOfSales),
    grossProfit: Math.round(l.revenue - l.costOfSales),
    topSellers: Object.entries(l.sold).sort(bySold).slice(0, 3),
    leastSold,
    soldOut: Object.entries(l.missed).sort(bySold).slice(0, 5),
    leftovers: Object.entries(draft.inventory.products)
      .map(([id, b]): [string, number] => [id, totalQty(b)])
      .filter(([, n]) => n > 0),
    wasted: [
      ...products.list.map(([id, n]): [string, number, 'produk'] => [id, n, 'produk']),
      ...ingredients.list.map(([id, n]): [string, number, 'bahan'] => [id, n, 'bahan']),
    ],
    wasteCost: Math.round(products.cost + ingredients.cost),
    popularityBefore: before,
    popularityAfter: draft.player.popularity,
    loyaltyAfter: draft.player.loyalty,
    moneyEnd: draft.player.money,
    ads: [...l.ads],
    upgradeCost: l.upgradeCost,
    weather: draft.weather,
    debtDays: 0,
    bankIncome: l.bankIncome,
    loanCost: l.loanCost,
    bankMatured: bank.matured,
    loanAutoPaid: bank.loanAutoPaid,
    depositsUsed: bank.depositsUsed,
    reviewDelta: review,
    moveCost: l.moveCost,
    mapId: draft.mapId,
    event: draft.event ? { ...draft.event, bulk: draft.event.bulk ? { ...draft.event.bulk } : null } : null,
  };
  // Bangkrut: kas minus saat tutup 3 hari berturut-turut.
  draft.debtDays = draft.player.money < 0 ? draft.debtDays + 1 : 0;
  report.debtDays = draft.debtDays;
  if (draft.debtDays >= BANKRUPT_AFTER_DAYS) draft.bankrupt = true;
  draft.lastReport = report;
  draft.history.push({
    day,
    revenue: report.revenue,
    netProfit: report.netProfit,
    customers: report.customers,
    avgSatisfaction,
    popularity: report.popularityAfter,
    money: report.moneyEnd,
  });
  if (draft.history.length > HISTORY_LIMIT) draft.history.splice(0, draft.history.length - HISTORY_LIMIT);
  return report;
}
