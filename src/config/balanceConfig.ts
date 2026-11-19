import type { WeatherKind } from '../core/GameState';
import { tr } from '../i18n/i18n';

export interface PopularityTierConfig {
  readonly id: string;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly description: string;
}

/**
 * Konfigurasi balancing. Tingkatan popularitas sudah dipakai HUD sejak Stage 1;
 * formula perubahan popularitas menyusul di Stage 4.
 */
export const BALANCE_CONFIG = {
  startingPopularity: 10,
  popularityMin: 0,
  popularityMax: 100,
  startingWeather: 'cerah' as WeatherKind,
  /** Batas perubahan popularitas per hari (±). */
  maxDailyPopularityChange: 6,
  /** Bobot per rombongan untuk perubahan popularitas harian. */
  popularityWeights: {
    served: 0.25,
    partial: 0.08,
    happy: 0.12,
    leftEmpty: 0.45,
    leftWaiting: 0.3,
    unhappy: 0.1,
    missedPortion: 0.05,
  },
  popularityTiers: [
    { id: 'unknown', min: 0, max: 19, label: tr('Tidak dikenal'), description: tr('Pelanggan sangat sedikit') },
    { id: 'emerging', min: 20, max: 39, label: tr('Mulai dikenal'), description: tr('Pelanggan mulai berdatangan') },
    { id: 'popular', min: 40, max: 59, label: tr('Cukup populer'), description: tr('Pelanggan semakin ramai') },
    { id: 'famous', min: 60, max: 79, label: tr('Terkenal'), description: tr('Pelanggan ramai') },
    { id: 'very-famous', min: 80, max: 94, label: tr('Sangat terkenal'), description: tr('Pelanggan sangat ramai') },
    { id: 'legendary', min: 95, max: 100, label: tr('Legendaris'), description: tr('Angkringan menjadi tujuan favorit') },
  ] satisfies readonly PopularityTierConfig[],
} as const;

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  cerah: tr('Cerah'),
  berawan: tr('Berawan'),
  hujan: tr('Hujan'),
  panas: tr('Panas terik'),
};
