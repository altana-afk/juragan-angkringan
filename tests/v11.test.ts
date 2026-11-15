import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/data/catalog';
import { EVENTS, eventById } from '../src/data/events';
import { sortRecipesForMenu } from '../src/systems/RecipeSystem';
import { WEATHER_WEIGHTS } from '../src/systems/WeatherSystem';
import { describeEventEffects, eventWhere, GUIDE_TABS, hourText, pct, pctOrNormal } from '../src/ui/GuidePanel';

describe('urutan menu Persiapan', () => {
  const isDrink = (id: string): boolean => CATALOG.recipe(id).category === 'minuman';

  it('yang terbuka di atas, yang terkunci di bawah; makanan dulu baru minuman', () => {
    const unlocked = ['es_teh', 'nasi_goreng', 'teh_hangat', 'tempe_goreng', 'tahu_goreng', 'kopi_panas', 'sate_usus'];
    const sorted = sortRecipesForMenu(CATALOG.recipes, unlocked).map((r) => r.id);
    expect(sorted).toHaveLength(CATALOG.recipes.length);
    const open = sorted.slice(0, unlocked.length);
    const locked = sorted.slice(unlocked.length);
    expect(new Set(open)).toEqual(new Set(unlocked));
    expect(locked.some((id) => unlocked.includes(id))).toBe(false);
    for (const group of [open, locked]) {
      const firstDrink = group.findIndex(isDrink);
      expect(firstDrink).toBeGreaterThan(0);
      expect(group.slice(firstDrink).every(isDrink)).toBe(true);
    }
    // Makanan: kategori makanan → gorengan → sate.
    expect(open.slice(0, 4)).toEqual(['nasi_goreng', 'tempe_goreng', 'tahu_goreng', 'sate_usus']);
    expect(open.slice(4)).toEqual(['es_teh', 'teh_hangat', 'kopi_panas']);
  });

  it('stabil & tidak mengubah array katalog', () => {
    const before = CATALOG.recipes.map((r) => r.id);
    const a = sortRecipesForMenu(CATALOG.recipes, ['nasi_goreng']).map((r) => r.id);
    const b = sortRecipesForMenu(CATALOG.recipes, new Set(['nasi_goreng'])).map((r) => r.id);
    expect(a).toEqual(b);
    expect(CATALOG.recipes.map((r) => r.id)).toEqual(before);
    expect(a[0]).toBe('nasi_goreng');
  });
});

describe('panel Panduan & Info', () => {
  it('helper teks', () => {
    expect(pct(1.3)).toBe('+30%');
    expect(pct(0.75)).toBe('−25%');
    expect(pctOrNormal(1)).toBe('normal');
    expect(hourText(21.5)).toBe('21.30');
    expect(hourText(25)).toBe('01.00');
    expect(GUIDE_TABS.map((t) => t.id)).toContain('event');
    expect(WEATHER_WEIGHTS.reduce((s, w) => s + w.weight, 0)).toBe(100);
  });

  it('setiap event punya ringkasan efek & tempat', () => {
    for (const ev of EVENTS) {
      expect(describeEventEffects(ev, CATALOG).length, ev.id).toBeGreaterThan(0);
      expect(eventWhere(ev).length).toBeGreaterThan(0);
    }
    expect(describeEventEffects(eventById('cabai_mahal'), CATALOG)).toEqual(['Harga cabai +70%']);
    expect(eventWhere(eventById('gajian'))).toContain('tanggal 25');
    expect(describeEventEffects(eventById('rombongan_wisata'), CATALOG).join(' ')).toContain('minuman');
    expect(describeEventEffects(eventById('hajatan'), CATALOG).join(' ')).toContain('makanan');
  });
});

describe('catatan pembaruan', () => {
  it('entri teratas = versi game, urut dari terbaru ke versi pertama', async () => {
    const { CHANGELOG } = await import('../src/data/changelog');
    const { GAME_CONFIG } = await import('../src/config/gameConfig');
    const { compareVersions } = await import('../src/ui/ChangelogPanel');
    expect(CHANGELOG[0]?.version).toBe(GAME_CONFIG.version);
    expect(CHANGELOG.at(-1)?.version).toBe('0.1.0');
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBeGreaterThan(0);
    for (const e of CHANGELOG) expect(e.items.length).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });
});
