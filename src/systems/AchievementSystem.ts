import type { GameState } from '../core/GameState';
import { effectsOf } from './UpgradeSystem';
import { tr } from '../i18n/i18n';

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  /** Hadiah uang (kecil) saat didapat. */
  readonly reward: number;
  readonly check: (s: Readonly<GameState>) => boolean;
  /** Progres 0–1 untuk ditampilkan (opsional). */
  readonly progress?: (s: Readonly<GameState>) => number;
}

const ratio = (v: number, target: number): number => Math.max(0, Math.min(1, v / target));

/** Hari berturut-turut terakhir dengan laba bersih positif. */
export function profitStreak(s: Readonly<GameState>): number {
  let n = 0;
  for (let i = s.history.length - 1; i >= 0; i--) {
    if ((s.history[i]?.netProfit ?? 0) > 0) n++;
    else break;
  }
  return n;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'pelaris', name: tr('Pelaris'), icon: '🪙', description: tr('Jual porsi pertamamu.'), reward: 5_000, check: (s) => s.stats.totalPortionsSold >= 1 },
  { id: 'seratus_pelanggan', name: tr('Seratus Tamu'), icon: '👥', description: tr('Layani total 100 rombongan pelanggan.'), reward: 25_000, check: (s) => s.stats.totalCustomers >= 100, progress: (s) => ratio(s.stats.totalCustomers, 100) },
  { id: 'seribu_porsi', name: tr('Seribu Porsi'), icon: '🍚', description: tr('Jual total 1.000 porsi.'), reward: 75_000, check: (s) => s.stats.totalPortionsSold >= 1000, progress: (s) => ratio(s.stats.totalPortionsSold, 1000) },
  { id: 'jutawan', name: tr('Jutawan Kampung'), icon: '💵', description: tr('Punya kas Rp1.000.000.'), reward: 20_000, check: (s) => s.player.money >= 1_000_000, progress: (s) => ratio(s.player.money, 1_000_000) },
  { id: 'juragan_sejati', name: tr('Juragan Sejati'), icon: '👑', description: tr('Total omzet sepanjang usaha Rp10.000.000.'), reward: 150_000, check: (s) => s.stats.totalRevenue >= 10_000_000, progress: (s) => ratio(s.stats.totalRevenue, 10_000_000) },
  { id: 'terkenal', name: tr('Mulai Dikenal'), icon: '⭐', description: tr('Capai popularitas 50.'), reward: 30_000, check: (s) => s.player.popularity >= 50, progress: (s) => ratio(s.player.popularity, 50) },
  { id: 'legenda', name: tr('Legenda Angkringan'), icon: '🌟', description: tr('Capai popularitas 90.'), reward: 100_000, check: (s) => s.player.popularity >= 90, progress: (s) => ratio(s.player.popularity, 90) },
  { id: 'untung_beruntun', name: tr('Untung Terus'), icon: '📈', description: tr('Laba bersih positif 7 hari berturut-turut.'), reward: 50_000, check: (s) => profitStreak(s) >= 7, progress: (s) => ratio(profitStreak(s), 7) },
  { id: 'tanpa_kecewa', name: tr('Pelayanan Prima'), icon: '😊', description: tr('Satu hari dengan ≥10 rombongan tanpa satu pun yang kecewa.'), reward: 30_000, check: (s) => s.stats.perfectDays >= 1 },
  { id: 'gerobak_premium', name: tr('Gerobak Impian'), icon: '🛒', description: tr('Pasang gerobak premium.'), reward: 100_000, check: (s) => effectsOf(s).businessLevel >= 4, progress: (s) => ratio(effectsOf(s).businessLevel - 1, 3) },
  { id: 'tukang_upgrade', name: tr('Rajin Berbenah'), icon: '🔨', description: tr('Miliki 10 upgrade.'), reward: 50_000, check: (s) => s.upgrades.length >= 10, progress: (s) => ratio(s.upgrades.length, 10) },
  { id: 'borongan', name: tr('Siap Borongan'), icon: '📦', description: tr('Kirim 3 pesanan borongan dari event.'), reward: 40_000, check: (s) => s.stats.bulkDelivered >= 3, progress: (s) => ratio(s.stats.bulkDelivered, 3) },
  { id: 'penabung', name: tr('Rajin Menabung'), icon: '🏦', description: tr('Tahan deposito sampai jatuh tempo.'), reward: 20_000, check: (s) => s.bank.depositsMatured >= 1 },
  { id: 'bebas_utang', name: tr('Bebas Utang'), icon: '🤝', description: tr('Lunasi sebuah pinjaman bank.'), reward: 20_000, check: (s) => s.bank.loansRepaid >= 1 },
  { id: 'sebulan', name: tr('Sebulan Berdiri'), icon: '📅', description: tr('Bertahan sampai Hari 30.'), reward: 60_000, check: (s) => s.calendar.day >= 30, progress: (s) => ratio(s.calendar.day, 30) },
  { id: 'anak_kampus', name: tr('Langganan Kampus'), icon: '🎓', description: tr('Layani 150 rombongan di lokasi Dekat Kampus.'), reward: 50_000, check: (s) => s.mapId === 'kampus' && s.stats.totalCustomers >= 150, progress: (s) => (s.mapId === 'kampus' ? ratio(s.stats.totalCustomers, 150) : 0) },
];

/**
 * Periksa pencapaian baru, catat harinya, dan berikan hadiah uang.
 * Mengembalikan pencapaian yang baru didapat.
 */
export function unlockAchievements(draft: GameState): AchievementDef[] {
  const got: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (draft.achievements[a.id] !== undefined) continue;
    if (!a.check(draft)) continue;
    draft.achievements[a.id] = draft.calendar.day;
    draft.player.money += a.reward;
    got.push(a);
  }
  return got;
}

/** Cek tanpa mengubah state (untuk menghindari update berulang). */
export function hasNewAchievement(s: Readonly<GameState>): boolean {
  return ACHIEVEMENTS.some((a) => s.achievements[a.id] === undefined && a.check(s));
}
