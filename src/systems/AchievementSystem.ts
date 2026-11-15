import type { GameState } from '../core/GameState';
import { effectsOf } from './UpgradeSystem';

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
  { id: 'pelaris', name: 'Pelaris', icon: '🪙', description: 'Jual porsi pertamamu.', reward: 5_000, check: (s) => s.stats.totalPortionsSold >= 1 },
  { id: 'seratus_pelanggan', name: 'Seratus Tamu', icon: '👥', description: 'Layani total 100 rombongan pelanggan.', reward: 25_000, check: (s) => s.stats.totalCustomers >= 100, progress: (s) => ratio(s.stats.totalCustomers, 100) },
  { id: 'seribu_porsi', name: 'Seribu Porsi', icon: '🍚', description: 'Jual total 1.000 porsi.', reward: 75_000, check: (s) => s.stats.totalPortionsSold >= 1000, progress: (s) => ratio(s.stats.totalPortionsSold, 1000) },
  { id: 'jutawan', name: 'Jutawan Kampung', icon: '💵', description: 'Punya kas Rp1.000.000.', reward: 20_000, check: (s) => s.player.money >= 1_000_000, progress: (s) => ratio(s.player.money, 1_000_000) },
  { id: 'juragan_sejati', name: 'Juragan Sejati', icon: '👑', description: 'Total omzet sepanjang usaha Rp10.000.000.', reward: 150_000, check: (s) => s.stats.totalRevenue >= 10_000_000, progress: (s) => ratio(s.stats.totalRevenue, 10_000_000) },
  { id: 'terkenal', name: 'Mulai Dikenal', icon: '⭐', description: 'Capai popularitas 50.', reward: 30_000, check: (s) => s.player.popularity >= 50, progress: (s) => ratio(s.player.popularity, 50) },
  { id: 'legenda', name: 'Legenda Angkringan', icon: '🌟', description: 'Capai popularitas 90.', reward: 100_000, check: (s) => s.player.popularity >= 90, progress: (s) => ratio(s.player.popularity, 90) },
  { id: 'untung_beruntun', name: 'Untung Terus', icon: '📈', description: 'Laba bersih positif 7 hari berturut-turut.', reward: 50_000, check: (s) => profitStreak(s) >= 7, progress: (s) => ratio(profitStreak(s), 7) },
  { id: 'tanpa_kecewa', name: 'Pelayanan Prima', icon: '😊', description: 'Satu hari dengan ≥10 rombongan tanpa satu pun yang kecewa.', reward: 30_000, check: (s) => s.stats.perfectDays >= 1 },
  { id: 'gerobak_premium', name: 'Gerobak Impian', icon: '🛒', description: 'Pasang gerobak premium.', reward: 100_000, check: (s) => effectsOf(s).businessLevel >= 4, progress: (s) => ratio(effectsOf(s).businessLevel - 1, 3) },
  { id: 'tukang_upgrade', name: 'Rajin Berbenah', icon: '🔨', description: 'Miliki 10 upgrade.', reward: 50_000, check: (s) => s.upgrades.length >= 10, progress: (s) => ratio(s.upgrades.length, 10) },
  { id: 'borongan', name: 'Siap Borongan', icon: '📦', description: 'Kirim 3 pesanan borongan dari event.', reward: 40_000, check: (s) => s.stats.bulkDelivered >= 3, progress: (s) => ratio(s.stats.bulkDelivered, 3) },
  { id: 'penabung', name: 'Rajin Menabung', icon: '🏦', description: 'Tahan deposito sampai jatuh tempo.', reward: 20_000, check: (s) => s.bank.depositsMatured >= 1 },
  { id: 'bebas_utang', name: 'Bebas Utang', icon: '🤝', description: 'Lunasi sebuah pinjaman bank.', reward: 20_000, check: (s) => s.bank.loansRepaid >= 1 },
  { id: 'sebulan', name: 'Sebulan Berdiri', icon: '📅', description: 'Bertahan sampai Hari 30.', reward: 60_000, check: (s) => s.calendar.day >= 30, progress: (s) => ratio(s.calendar.day, 30) },
  { id: 'anak_kampus', name: 'Langganan Kampus', icon: '🎓', description: 'Layani 150 rombongan di lokasi Dekat Kampus.', reward: 50_000, check: (s) => s.mapId === 'kampus' && s.stats.totalCustomers >= 150, progress: (s) => (s.mapId === 'kampus' ? ratio(s.stats.totalCustomers, 150) : 0) },
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
