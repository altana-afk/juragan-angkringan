import type { WeatherKind } from '../core/GameState';
import { SeededRandom } from '../utils/random';

/** Cuaca harian & pengaruhnya terhadap permintaan. */
export interface WeatherEffect {
  readonly arrival: number;
  /** Pengali minat produk bertag hangat. */
  readonly warm: number;
  /** Pengali minat produk bertag dingin. */
  readonly cold: number;
  readonly label: string;
  readonly hint: string;
}

export const WEATHER_EFFECTS: Readonly<Record<WeatherKind, WeatherEffect>> = {
  cerah: { arrival: 1, warm: 1, cold: 1, label: 'Cerah', hint: 'Cuaca normal.' },
  berawan: { arrival: 0.95, warm: 1.15, cold: 0.9, label: 'Berawan', hint: 'Sedikit lebih sepi; minuman hangat agak dicari.' },
  hujan: { arrival: 0.75, warm: 1.7, cold: 0.45, label: 'Hujan', hint: 'Lebih sepi; makanan & minuman hangat sangat dicari, es kurang laku.' },
  panas: { arrival: 1.05, warm: 0.7, cold: 1.75, label: 'Panas terik', hint: 'Minuman dingin laris, minuman hangat kurang laku.' },
};

const WEIGHTS: readonly { item: WeatherKind; weight: number }[] = [
  { item: 'cerah', weight: 45 },
  { item: 'berawan', weight: 25 },
  { item: 'hujan', weight: 20 },
  { item: 'panas', weight: 10 },
];

/** Cuaca hari tertentu (deterministik per hari; Hari 1 selalu cerah). Hujan cenderung beruntun. */
export function weatherForDay(day: number, yesterday: WeatherKind): WeatherKind {
  if (day <= 1) return 'cerah';
  const rng = new SeededRandom(`cuaca-${day}`);
  if (yesterday === 'hujan' && rng.chance(0.35)) return 'hujan';
  return rng.weightedPick(WEIGHTS);
}
