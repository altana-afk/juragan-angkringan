import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO, parseAudioSettings } from '../src/audio/AudioSettings';
import { BEATS_PER_LOOP, buildLoop, scaleFreq } from '../src/audio/music';
import { soundsForChange } from '../src/audio/SoundDirector';
import { createInitialState } from '../src/core/GameState';
import { addStock } from '../src/systems/InventorySystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { advanceTutorial, TUTORIAL_DONE, TUTORIAL_STEPS } from '../src/systems/TutorialSystem';

describe('pengaturan audio', () => {
  it('nilai rusak/di luar batas dikembalikan ke aman', () => {
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO);
    expect(parseAudioSettings('{bukan json')).toEqual(DEFAULT_AUDIO);
    expect(parseAudioSettings(JSON.stringify({ music: 5, sfx: -1, ambience: 'x', muted: true }))).toEqual({ music: 1, sfx: 0, ambience: DEFAULT_AUDIO.ambience, muted: true });
  });
});

describe('musik prosedural', () => {
  it('tangga nada naik per oktaf & pola satu putaran valid', () => {
    expect(scaleFreq(5)).toBeCloseTo(scaleFreq(0) * 2);
    expect(scaleFreq(-5)).toBeCloseTo(scaleFreq(0) / 2);
    for (let s = 0; s < 4; s++) {
      const loop = buildLoop(s);
      expect(loop.length).toBeGreaterThan(30);
      for (const n of loop) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(BEATS_PER_LOOP);
        expect(n.freq).toBeGreaterThan(40);
        expect(n.freq).toBeLessThan(5000);
        expect(n.vel).toBeGreaterThan(0);
      }
      expect(loop.some((n) => n.voice === 'gong')).toBe(true);
    }
  });
});

describe('efek suara dari perubahan state', () => {
  it('memetakan aksi & kejadian ke suara', () => {
    const a = createInitialState();
    const b = structuredClone(a);
    b.ledger.revenue = 12_000;
    b.ledger.leftEmpty = 1;
    expect(soundsForChange('jual', a, b)).toEqual(['coin', 'sad']);
    expect(soundsForChange('beli-bahan', a, a)).toEqual(['cash']);
    expect(soundsForChange('masak', a, a)).toEqual(['cook']);
    expect(soundsForChange('beli-upgrade', a, a)).toEqual(['upgrade']);
    const open = structuredClone(a);
    open.phase = 'berjualan';
    expect(soundsForChange('mulai-jualan', a, open)).toContain('open');
    const done = structuredClone(open);
    done.phase = 'evaluasi';
    expect(soundsForChange('tutup-hari', open, done)).toContain('chime');
    const broke = structuredClone(a);
    broke.bankrupt = true;
    expect(soundsForChange('tutup-hari', a, broke)).toContain('bankrupt');
  });
});

describe('tutorial', () => {
  it('maju mengikuti langkah pemain lalu selesai', () => {
    const s = createInitialState();
    expect(advanceTutorial(s)).toBe(0);
    addStock(s.inventory.ingredients, 'beras', 5, null, 1000);
    expect(advanceTutorial(s)).toBe(1);
    addStock(s.inventory.products, 'nasi_goreng', 3, 1, 5000);
    s.tutorial = advanceTutorial(s);
    expect(s.tutorial).toBe(2);
    s.phase = 'berjualan';
    expect(advanceTutorial(s)).toBe(3);
    s.phase = 'evaluasi';
    s.tutorial = 3;
    expect(advanceTutorial(s)).toBe(4);
    s.calendar.day = 2;
    expect(advanceTutorial(s)).toBe(TUTORIAL_DONE);
    expect(TUTORIAL_STEPS.length).toBe(5);
  });

  it('save lama (v5) dianggap sudah lewat tutorial', () => {
    const st = createInitialState() as unknown as Record<string, unknown>;
    delete st.tutorial;
    expect(migrateSave({ version: 5, savedAt: '', state: st }).tutorial).toBe(TUTORIAL_DONE);
  });
});
