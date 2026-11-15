import { describe, expect, it } from 'vitest';
import { BALANCE_CONFIG } from '../src/config/balanceConfig';
import { getPopularityTier } from '../src/systems/PopularitySystem';

describe('tingkatan popularitas', () => {
  it('menutupi rentang 0–100 tanpa celah atau tumpang tindih', () => {
    const tiers = [...BALANCE_CONFIG.popularityTiers].sort((a, b) => a.min - b.min);
    expect(tiers[0]?.min).toBe(0);
    expect(tiers.at(-1)?.max).toBe(100);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]?.min).toBe((tiers[i - 1]?.max ?? -99) + 1);
    }
    for (let v = 0; v <= 100; v++) expect(() => getPopularityTier(v)).not.toThrow();
  });

  it('memberi label sesuai tabel desain', () => {
    expect(getPopularityTier(0).label).toBe('Tidak dikenal');
    expect(getPopularityTier(19).label).toBe('Tidak dikenal');
    expect(getPopularityTier(20).label).toBe('Mulai dikenal');
    expect(getPopularityTier(59.9).label).toBe('Cukup populer');
    expect(getPopularityTier(60).label).toBe('Terkenal');
    expect(getPopularityTier(94).label).toBe('Sangat terkenal');
    expect(getPopularityTier(95).label).toBe('Legendaris');
    expect(getPopularityTier(100).label).toBe('Legendaris');
  });

  it('membatasi nilai di luar rentang', () => {
    expect(getPopularityTier(-5).id).toBe('unknown');
    expect(getPopularityTier(150).id).toBe('legendary');
    expect(getPopularityTier(Number.NaN).id).toBe('unknown');
  });
});
