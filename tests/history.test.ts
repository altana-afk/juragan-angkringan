import { describe, expect, it } from 'vitest';
import { createInitialState, HISTORY_LIMIT } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { closeDay } from '../src/systems/DayCloseSystem';

describe('riwayat penjualan 60 hari', () => {
  it('menyimpan ringkasan harian (keuangan, menu teratas, cuaca, event) dan dibatasi 60 hari', () => {
    const s = createInitialState();
    for (let d = 1; d <= HISTORY_LIMIT + 5; d++) {
      s.calendar.day = d;
      s.phase = 'berjualan';
      closeDay(s, CATALOG);
    }
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.history[0]!.day).toBe(6);
    const h = s.history.at(-1)!;
    expect(h.weather).toBe(s.weather);
    expect(h.ingredientCost).toBeTypeOf('number');
    expect(h.operationalCost).toBeTypeOf('number');
    expect(Array.isArray(h.topSellers)).toBe(true);
    expect(h.topSellers!.length).toBeLessThanOrEqual(3);
    expect(h.mapId).toBe(s.mapId);
  });
});
