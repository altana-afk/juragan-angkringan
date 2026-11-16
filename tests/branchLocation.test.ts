import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { branchEvent, freeLocations, moveBranch, openBranch, setBranchOpen } from '../src/systems/BranchSystem';
import { rollEvent } from '../src/systems/EventSystem';
import { moveLocation } from '../src/systems/LocationSystem';
import { GameRuleError } from '../src/systems/rules';

function rich(): GameState {
  const s = createInitialState();
  s.player.money = 50_000_000;
  s.player.popularity = 90;
  s.upgrades.push('gerobak_standar', 'gerobak_modern', 'gerobak_premium');
  s.calendar.day = 5;
  return s;
}

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as GameRuleError).code;
  }
  return 'ok';
};

describe('lokasi cabang', () => {
  it('satu lokasi hanya untuk satu angkringan yang buka (termasuk toko utama)', () => {
    const s = rich();
    expect(code(() => openBranch(s, s.mapId))).toBe('location-used');
    openBranch(s, 'kampus');
    expect(code(() => openBranch(s, 'kampus'))).toBe('location-used');
    expect(freeLocations(s)).not.toContain('kampus');
    s.lastMoveDay = 0;
    expect(code(() => moveLocation(s, CATALOG, 'kampus'))).toBe('location-used');
  });

  it('lokasi bisa dipakai lagi setelah angkringan yang menempatinya ditutup', () => {
    const s = rich();
    openBranch(s, 'kampus');
    setBranchOpen(s, 0, false);
    openBranch(s, 'kampus');
    expect(s.branches.list[1]!.mapId).toBe('kampus');
    // Cabang 1 tidak bisa dibuka lagi selama kampus dipakai cabang 2.
    expect(code(() => setBranchOpen(s, 0, true))).toBe('location-used');
    moveBranch(s, 0, 'pasar');
    setBranchOpen(s, 0, true);
    expect(s.branches.list[0]!.open).toBe(true);
  });

  it('pindah lokasi: bayar biaya pindah, sekali sehari, tujuan harus kosong', () => {
    const s = rich();
    openBranch(s, 'kampus');
    s.calendar.day++;
    const before = s.player.money;
    moveBranch(s, 0, 'pasar');
    expect(before - s.player.money).toBe(25000);
    expect(code(() => moveBranch(s, 0, 'stasiun'))).toBe('moved-today');
  });

  it('event cabang mengikuti lokasinya', () => {
    const s = rich();
    const b = openBranch(s, 'pasar-malam');
    for (let d = 2; d < 40; d++) {
      s.calendar.day = d;
      expect(branchEvent(s, CATALOG, b)).toBe(rollEvent(d, 'pasar-malam', s.unlockedRecipes, CATALOG)?.id ?? null);
    }
  });
});
