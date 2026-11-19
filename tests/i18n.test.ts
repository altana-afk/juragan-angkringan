import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EN_STRINGS } from '../src/i18n/en/strings';
import { CHANGELOG_EN } from '../src/i18n/en/changelog';
import { CHANGELOG } from '../src/data/changelog';
import { mergeOverlay, setLanguageForTest, tr, trc } from '../src/i18n/i18n';

const SRC = join(__dirname, '../src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'i18n' ? [] : tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Semua kunci `tr('…')` dan `trc('konteks', '…')` di kode game (teks literal). */
function sourceKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const re = /\btr\(\s*'((?:[^'\\]|\\.)*)'/g;
  // trc('konteks', 'teks') → kunci "konteks|teks"
  const reCtx = /\btrc\(\s*'([^']*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;
  const unescape = (raw: string): string => JSON.parse(`"${raw.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) as string;
  for (const file of tsFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const found = [...[...text.matchAll(re)].map((m) => unescape(m[1]!)), ...[...text.matchAll(reCtx)].map((m) => `${m[1]}|${unescape(m[2]!)}`)];
    for (const key of found) if (!keys.has(key)) keys.set(key, relative(SRC, file));
  }
  return keys;
}

const placeholders = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('kamus bahasa Inggris', () => {
  const keys = sourceKeys();

  it('setiap teks tr() di kode punya terjemahan', () => {
    const missing = [...keys].filter(([k]) => !(k in EN_STRINGS)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it('tidak ada terjemahan yatim (kuncinya sudah tidak dipakai di kode)', () => {
    const unused = Object.keys(EN_STRINGS).filter((k) => !keys.has(k));
    expect(unused).toEqual([]);
  });

  it('placeholder terjemahan sama dengan teks aslinya', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(EN_STRINGS)) {
      const forms = typeof value === 'string' ? [value] : [value.one, value.other];
      for (const f of forms) if (placeholders(f) !== placeholders(key)) bad.push(`${key} → ${f}`);
      if (typeof value !== 'string' && !placeholders(key).split(',').includes(value.count)) bad.push(`${key}: count ${value.count}`);
    }
    expect(bad).toEqual([]);
  });

  it('terjemahan tidak kosong dan tidak memakai em dash', () => {
    for (const value of Object.values(EN_STRINGS)) {
      for (const f of typeof value === 'string' ? [value] : [value.one, value.other]) {
        expect(f.trim().length).toBeGreaterThan(0);
        expect(f).not.toContain('—');
      }
    }
  });
});

describe('tr()', () => {
  afterEach(() => setLanguageForTest('id'));

  it('bahasa Indonesia: teks asli + placeholder', () => {
    expect(tr('Hari {day}', { day: 3 })).toBe('Hari 3');
  });

  it('bahasa Inggris: terjemahan, placeholder, dan bentuk tunggal/jamak', () => {
    setLanguageForTest('en');
    expect(tr('Hari {day}', { day: 3 })).toBe('Day 3');
    expect(tr('{totalPortions} porsi siap dijual.', { totalPortions: 1 })).toBe('1 portion ready to sell.');
    expect(tr('{totalPortions} porsi siap dijual.', { totalPortions: 4 })).toBe('4 portions ready to sell.');
  });

  it('trc membedakan arti menurut konteks', () => {
    expect(trc('status', 'Tutup')).toBe('Tutup');
    setLanguageForTest('en');
    expect(tr('Tutup')).toBe('Close');
    expect(trc('status', 'Tutup')).toBe('Closed');
    expect(trc('status', 'Batal')).toBe('Cancelled');
  });

  it('teks yang belum diterjemahkan tetap tampil (bahasa Indonesia), tidak kosong', () => {
    setLanguageForTest('en');
    expect(tr('teks uji yang tidak ada di kamus {n}', { n: 2 })).toBe('teks uji yang tidak ada di kamus 2');
  });
});

describe('mergeOverlay (data JSON)', () => {
  it('menggabung per id, per urutan, dan mengganti daftar teks; angka tetap dari data dasar', () => {
    const base = {
      items: [
        { id: 'a', name: 'Satu', cost: 5 },
        { id: 'b', name: 'Dua', cost: 7 },
      ],
      areas: [{ name: 'Gang', km: [1, 2] }],
      perks: ['x', 'y'],
      rules: { fee: 10 },
    };
    const out = mergeOverlay(base, { items: [{ id: 'b', name: 'Two' }], areas: [{ name: 'Alley' }], perks: ['p'] });
    expect(out.items).toEqual([
      { id: 'a', name: 'Satu', cost: 5 },
      { id: 'b', name: 'Two', cost: 7 },
    ]);
    expect(out.areas).toEqual([{ name: 'Alley', km: [1, 2] }]);
    expect(out.perks).toEqual(['p']);
    expect(out.rules).toEqual({ fee: 10 });
  });
});

/** Kunci data JSON yang berisi teks pemain: wajib punya terjemahan di src/i18n/en/data/. */
const TEXT_KEYS = new Set([
  'name', 'description', 'effectLabel', 'tagline', 'perks', 'title', 'lines', 'summary', 'text', 'requirement', 'effects',
  'role', 'want', 'fear', 'talk', 'recipeNote', 'memory', 'condition', 'label', 'unit', 'pack', 'courierName', 'lastPage',
]);
/** Kunci teks yang nilainya objek berisi teks (bukan angka/id). */
const TEXT_OBJECT_KEYS = new Set(['talk', 'lastPage']);
const isTextKey = (k: string, v: J): boolean => TEXT_KEYS.has(k) && (!isRec(v) || TEXT_OBJECT_KEYS.has(k));
const DATA_FILES = [
  'advertising', 'branchStaff', 'branchUpgrades', 'branches', 'customers', 'deliveryModes', 'events', 'ingredients', 'locations',
  'namedCustomers', 'news', 'onlineEvents', 'onlineOrders', 'recipes', 'storyChapters', 'upgrades',
];

type J = unknown;
const isRec = (v: J): v is Record<string, J> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Ada teks (string tidak kosong) di dalam nilai ini? Objek angka seperti `effects` upgrade bukan teks. */
const hasText = (v: J): boolean => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.some(hasText) : isRec(v) ? Object.values(v).some(hasText) : false);

/** Kumpulkan jalur teks di data dasar yang belum ada di tumpangan, dan id tumpangan yang tidak dikenal. */
function compare(base: J, over: J, path: string, inText: boolean, problems: string[]): void {
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) {
      if (inText && hasText(base)) problems.push(`${path}: belum diterjemahkan`);
      return;
    }
    if (base.length && base.every((x) => isRec(x) && typeof x.id === 'string')) {
      const ids = new Set(base.map((x) => (x as { id: string }).id));
      for (const o of over) if (isRec(o) && !ids.has(o.id as string)) problems.push(`${path}: id tumpangan tidak dikenal ${String(o.id)}`);
      for (const b of base as Record<string, J>[]) compare(b, over.find((o) => isRec(o) && o.id === b.id), `${path}[${String(b.id)}]`, inText, problems);
      return;
    }
    if (base.length && base.every(isRec)) {
      if (over.length !== base.length) problems.push(`${path}: jumlah elemen beda (${over.length} vs ${base.length})`);
      base.forEach((b, i) => compare(b, over[i], `${path}[${i}]`, inText, problems));
      return;
    }
    if (inText && base.length !== over.length) problems.push(`${path}: jumlah teks beda (${over.length} vs ${base.length})`);
    return;
  }
  if (isRec(base)) {
    if (!isRec(over)) {
      const textual = Object.entries(base).some(([k, v]) => (inText || isTextKey(k, v)) && hasText(v));
      if (textual) problems.push(`${path}: belum diterjemahkan`);
      return;
    }
    for (const k of Object.keys(over)) if (!(k in base)) problems.push(`${path}.${k}: kunci tidak ada di data dasar`);
    for (const [k, v] of Object.entries(base)) compare(v, over[k], `${path}.${k}`, inText || isTextKey(k, v), problems);
    return;
  }
  if (typeof base === 'string' && inText && base.trim() !== '' && (typeof over !== 'string' || over.trim() === '')) problems.push(`${path}: belum diterjemahkan`);
}

describe('terjemahan data JSON', () => {
  for (const name of DATA_FILES) {
    it(`${name}.json lengkap`, () => {
      const base = JSON.parse(readFileSync(join(SRC, 'data', `${name}.json`), 'utf8')) as J;
      const over = JSON.parse(readFileSync(join(SRC, 'i18n/en/data', `${name}.json`), 'utf8')) as J;
      const problems: string[] = [];
      compare(base, over, name, false, problems);
      expect(problems).toEqual([]);
      expect(JSON.stringify(over)).not.toContain('—');
    });
  }
});

describe('catatan pembaruan bahasa Inggris', () => {
  it('setiap versi punya terjemahan dengan jumlah poin yang sama', () => {
    for (const e of CHANGELOG) {
      const en = CHANGELOG_EN[e.version];
      expect(en, e.version).toBeDefined();
      expect(en!.items.length, e.version).toBe(e.items.length);
      expect(JSON.stringify(en)).not.toContain('—');
    }
    expect(Object.keys(CHANGELOG_EN).sort()).toEqual(CHANGELOG.map((e) => e.version).sort());
  });
});

describe('mode bahasa Inggris (modul dimuat ulang)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadEnglish(): Promise<void> {
    vi.resetModules();
    const store = new Map([['juragan-angkringan:lang', 'en']]);
    vi.stubGlobal('window', { location: { search: '', href: 'http://localhost/' } });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const i18n = await import('../src/i18n/i18n');
    expect(i18n.lang()).toBe('en');
  }

  it('format angka, uang, jam, dan tanggal gaya Inggris', async () => {
    await loadEnglish();
    const f = await import('../src/utils/formatting');
    const c = await import('../src/utils/calendar');
    expect(f.formatRupiah(1_500_000)).toBe('Rp1,500,000');
    expect(f.formatRupiah(-2500)).toBe('-Rp2,500');
    expect(f.formatRupiahShort(1_250_000)).toBe('Rp1.25M');
    expect(f.formatRupiahShort(75_000)).toBe('Rp75K');
    expect(f.formatClock(17 * 60)).toBe('17:00');
    expect(f.formatDecimal(0.6)).toBe('0.6');
    expect(c.formatDateShort(1)).toBe('Mon, Jul 6');
    expect(c.formatDateLong(1)).toBe('Monday, July 6, 2026');
  });

  it('data permainan memakai nama Inggris, angka tetap sama', async () => {
    const idCatalog = (await import('../src/data/catalog')).CATALOG;
    const idUpgrades = (await import('../src/systems/UpgradeSystem')).UPGRADES;
    await loadEnglish();
    const { CATALOG } = await import('../src/data/catalog');
    const { UPGRADES } = await import('../src/systems/UpgradeSystem');
    const { LOCATIONS } = await import('../src/data/locations');
    const { NEWS, CHAPTERS, CHOICES } = await import('../src/data/story');
    const { BRANCH_SLOTS } = await import('../src/data/branches');
    expect(CATALOG.recipe('es_teh').name).toBe('Iced tea');
    expect(CATALOG.recipe('es_teh').salePrice).toBe(idCatalog.recipe('es_teh').salePrice);
    expect(CATALOG.ingredient('telur').name).toBe('Eggs');
    expect(UPGRADES.map((u) => u.cost)).toEqual(idUpgrades.map((u) => u.cost));
    expect(UPGRADES.find((u) => u.id === 'kulkas')?.name).toBe('Fridge');
    expect(LOCATIONS.find((l) => l.id === 'pasar')?.name).toBe('Market Edge');
    expect(NEWS.find((n) => n.id === 'gerobak_kosong')?.title).toBe("Mbah Kardi's cart stands empty");
    expect(CHAPTERS[0]?.title).toBe('Hot Ginger Drink');
    expect(CHOICES.find((c) => c.id === 'jual')?.title).toBe('Sell the cart to Pak Hendra');
    expect(BRANCH_SLOTS[0]?.name).toBe('Branch 1');
  });

  it('teks sistem ikut berbahasa Inggris', async () => {
    await loadEnglish();
    const { describeEffects } = await import('../src/systems/UpgradeSystem');
    const { crowdLabel } = await import('../src/systems/LocationSystem');
    const { localizedChangelog } = await import('../src/data/changelog');
    expect(describeEffects({ seats: 3 })).toContain('+3 seats');
    expect(crowdLabel(1.3)).toBe('very busy');
    expect(localizedChangelog().find((e) => e.version === '0.17.0')?.title).toBe('Now in English');
  });
});
