import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/core/GameState';
import { MemoryStorage, SaveError, SaveSystem } from '../src/systems/SaveSystem';

describe('ekspor/impor save (sinkron akun)', () => {
  it('impor save lain: divalidasi, save lama dicadangkan, ringkasan terbaca', () => {
    const a = new SaveSystem(new MemoryStorage());
    const b = new SaveSystem(new MemoryStorage());
    const s = createInitialState();
    s.calendar.day = 9;
    a.save(s);
    b.save(createInitialState());
    const text = a.exportText()!;
    expect(SaveSystem.summarize(text)?.day).toBe(9);
    b.importText(text);
    expect(b.load()!.calendar.day).toBe(9);
    expect(() => b.importText('bukan json')).toThrow(SaveError);
    expect(b.load()!.calendar.day).toBe(9);
  });
});

describe('segel save', () => {
  it('save yang diedit di luar game ditandai tampered, save normal tidak', () => {
    const storage = new MemoryStorage();
    const saves = new SaveSystem(storage);
    const s = createInitialState();
    saves.save(s);
    expect(saves.load()!.tampered).toBeUndefined();
    const text = storage.getItem('juragan-angkringan:save')!;
    storage.setItem('juragan-angkringan:save', text.replace(/"money":(\d+)/, '"money":999999999'));
    const loaded = saves.load()!;
    expect(loaded.player.money).toBe(999999999);
    expect(loaded.tampered).toBe(true);
    // Tanda tetap ada setelah disimpan ulang oleh game.
    saves.save(loaded);
    expect(saves.load()!.tampered).toBe(true);
  });
});

import { usernameProblem } from '../src/cloud/CloudSync';
import { cloudSeal } from '../src/systems/saveSeal';
describe('username & segel akun', () => {
  it('aturan username', () => {
    expect(usernameProblem('juragan_sate')).toBeNull();
    expect(usernameProblem('ab')).not.toBeNull();
    expect(usernameProblem('nama dengan spasi')).not.toBeNull();
    expect(usernameProblem('Si_Anjing')).toMatch(/tidak diizinkan/);
  });
  it('segel akun = sha256 hex huruf kecil, berubah jika isi berubah', async () => {
    const a = await cloudSeal('abc');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await cloudSeal('abd')).not.toBe(a);
  });
});

import { scoreFromSave } from '../src/cloud/CloudSync';
import { closeDay } from '../src/systems/DayCloseSystem';
import { CATALOG } from '../src/data/catalog';
describe('rekor leaderboard', () => {
  it('rekor diambil dari save; save yang diubah di luar game tidak dikirim', () => {
    const storage = new MemoryStorage();
    const saves = new SaveSystem(storage);
    const s = createInitialState();
    s.phase = 'berjualan';
    closeDay(s, CATALOG);
    expect(s.stats.peakMoney).toBe(s.lastReport!.moneyEnd);
    expect(s.stats.bestDayRevenue).toBeGreaterThanOrEqual(0);
    saves.save(s);
    const text = saves.exportText()!;
    expect(scoreFromSave(text)).toEqual({
      longestDay: s.calendar.day,
      bestDayRevenue: s.stats.bestDayRevenue,
      bestDayProfit: Math.max(0, s.lastReport!.netProfit),
      worstDayLoss: Math.max(0, -s.lastReport!.netProfit),
      peakMoney: Math.max(s.stats.peakMoney!, s.player.money),
    });
    expect(scoreFromSave(text.replace(/"day":(\d+)/, '"day":9999'))).toBeNull();
  });
});
