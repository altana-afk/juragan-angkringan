import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({}));
import { findRoad } from '../src/world/RiderLayer';
import { getMap, listMapIds } from '../src/world/maps';

describe('jalan untuk motor pengantar', () => {
  it('setiap lokasi berjualan punya jalan di dekat gerobak', () => {
    for (const id of listMapIds()) {
      const map = getMap(id);
      if (!map.customers) continue;
      const road = findRoad(map);
      expect(road, id).not.toBeNull();
      expect(road!.max - road!.min, id).toBeGreaterThanOrEqual(6);
      expect(road!.stop).toBeGreaterThanOrEqual(road!.min);
      expect(road!.stop).toBeLessThanOrEqual(road!.max);
    }
  });
});
