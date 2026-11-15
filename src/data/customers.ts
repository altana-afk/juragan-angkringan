import customersJson from './customers.json';
import type { RecipeCategory } from './catalog';

export interface CustomerPalette {
  readonly hair: string;
  readonly shirt: string;
  readonly accent: string;
  readonly pants: string;
}

export interface CustomerTypeDef {
  readonly id: string;
  readonly name: string;
  /** Bobot dasar kemunculan. */
  readonly weight: number;
  /** Rentang uang yang dibawa (Rupiah, untuk seluruh rombongan). */
  /** Anggaran per orang (Rp); total rombongan = per orang × jumlah orang. */
  readonly budget: readonly [number, number];
  /** Kesabaran menunggu tempat duduk (menit permainan). */
  readonly patience: number;
  /** Jumlah orang dalam rombongan. */
  readonly party: readonly [number, number];
  readonly categoryWeights: Readonly<Record<RecipeCategory, number>>;
  /** Pengali bobot untuk tag resep (murah, mengenyangkan, hangat, dingin, praktis). */
  readonly tagWeights: Readonly<Record<string, number>>;
  /** Jumlah makanan per orang. */
  readonly foodItems: readonly [number, number];
  /** Peluang memesan minuman per orang. */
  readonly drinkChance: number;
  /** Jam ramai tipe ini (desimal, 21.5 = 21.30; boleh > 24). */
  readonly peakHour: number;
  /** Lebar sebaran jam (jam). */
  readonly spread: number;
  readonly names: readonly string[];
  readonly palettes: readonly CustomerPalette[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const CATS: readonly RecipeCategory[] = ['makanan', 'gorengan', 'sate', 'minuman'];

function fail(msg: string): never {
  throw new Error(`[Data pelanggan] ${msg}`);
}

const range = (v: unknown, where: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number' || v[0] < 0 || v[1] < v[0]) fail(`${where} harus [min, max]`);
  return [v[0], v[1]];
};

export function parseCustomerTypes(raw: unknown): CustomerTypeDef[] {
  const root = raw as { types?: unknown };
  if (!root || !Array.isArray(root.types) || root.types.length === 0) fail('customers.json harus berisi array "types"');
  const ids = new Set<string>();
  return root.types.map((t: Record<string, unknown>, i: number) => {
    const id = typeof t.id === 'string' ? t.id : fail(`tipe #${i}: id wajib`);
    if (ids.has(id)) fail(`id ganda ${id}`);
    ids.add(id);
    const num = (k: string): number => (typeof t[k] === 'number' && (t[k] as number) >= 0 ? (t[k] as number) : fail(`${id}: ${k} harus angka ≥ 0`));
    const cw = t.categoryWeights as Record<string, number> | undefined;
    if (!cw || !CATS.every((c) => typeof cw[c] === 'number')) fail(`${id}: categoryWeights wajib untuk semua kategori`);
    const palettes = t.palettes as CustomerPalette[] | undefined;
    if (!Array.isArray(palettes) || palettes.length === 0 || !palettes.every((p) => [p.hair, p.shirt, p.accent, p.pants].every((c) => typeof c === 'string' && HEX.test(c)))) {
      fail(`${id}: palettes harus berisi warna #rrggbb`);
    }
    const names = t.names as string[] | undefined;
    if (!Array.isArray(names) || names.length === 0) fail(`${id}: names wajib`);
    return {
      id,
      name: typeof t.name === 'string' ? t.name : id,
      weight: num('weight'),
      budget: range(t.budget, `${id}.budget`),
      patience: num('patience'),
      party: range(t.party, `${id}.party`),
      categoryWeights: cw as Record<RecipeCategory, number>,
      tagWeights: (t.tagWeights as Record<string, number>) ?? {},
      foodItems: range(t.foodItems, `${id}.foodItems`),
      drinkChance: Math.min(1, num('drinkChance')),
      peakHour: num('peakHour'),
      spread: Math.max(0.5, num('spread')),
      names,
      palettes,
    };
  });
}

export const CUSTOMER_TYPES: readonly CustomerTypeDef[] = parseCustomerTypes(customersJson);
