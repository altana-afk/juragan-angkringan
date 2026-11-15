import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';

/** Bentuk ikon pixel art (digambar oleh src/graphics/art/itemIcons.ts). */
export const ICON_SHAPES = [
  'sack', 'egg', 'sausage', 'block', 'skewer', 'ball', 'packet', 'chili', 'onion', 'bottle', 'bag', 'jug', 'water', 'cube',
  'plate', 'fried', 'glass', 'glass_ice', 'cup', 'skewer_dish', 'bowl',
] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

export interface ItemIcon {
  readonly shape: IconShape;
  readonly color: string;
  readonly accent: string;
}

export interface IngredientDef {
  readonly id: string;
  readonly name: string;
  /** Satuan stok yang dipakai resep, mis. "butir", "takar". */
  readonly unit: string;
  /** Label kemasan saat membeli, mis. "1 kg (16 butir)". */
  readonly pack: string;
  /** Jumlah satuan stok per kemasan. */
  readonly packSize: number;
  /** Harga dasar per kemasan (Rupiah) pada Hari 1. */
  readonly basePrice: number;
  /** Umur simpan dalam hari; null = awet. */
  readonly shelfLifeDays: number | null;
  /** Bahan dingin (es, air) — paling diuntungkan kulkas. */
  readonly chilled: boolean;
  readonly icon: ItemIcon;
}

export type UnlockCondition =
  | { readonly type: 'start' }
  | { readonly type: 'popularity'; readonly min: number }
  | { readonly type: 'money'; readonly min: number }
  | { readonly type: 'level'; readonly min: number };

export type RecipeCategory = 'makanan' | 'gorengan' | 'sate' | 'minuman';

export interface RecipeDef {
  readonly id: string;
  readonly name: string;
  readonly category: RecipeCategory;
  /** Harga jual default per porsi. */
  readonly salePrice: number;
  /** Kebutuhan bahan per porsi (id bahan → jumlah satuan). */
  readonly ingredients: Readonly<Record<string, number>>;
  readonly unlock: UnlockCondition;
  /** Umur simpan produk matang: 0 = habis/basi di akhir hari yang sama. */
  readonly shelfLifeDays: number;
  readonly tags: readonly string[];
  readonly icon: ItemIcon;
}

export interface Catalog {
  readonly ingredients: readonly IngredientDef[];
  readonly recipes: readonly RecipeDef[];
  ingredient(id: string): IngredientDef;
  recipe(id: string): RecipeDef;
  hasIngredient(id: string): boolean;
  hasRecipe(id: string): boolean;
}

const CATEGORIES: readonly RecipeCategory[] = ['makanan', 'gorengan', 'sate', 'minuman'];
const HEX = /^#[0-9a-f]{6}$/i;

function fail(message: string): never {
  throw new Error(`[Data] ${message}`);
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parseIcon(raw: unknown, where: string): ItemIcon {
  if (!isObj(raw)) fail(`${where}: icon wajib ada`);
  const { shape, color, accent } = raw;
  if (typeof shape !== 'string' || !(ICON_SHAPES as readonly string[]).includes(shape)) fail(`${where}: bentuk ikon tidak dikenal "${String(shape)}"`);
  if (typeof color !== 'string' || !HEX.test(color) || typeof accent !== 'string' || !HEX.test(accent)) fail(`${where}: warna ikon harus #rrggbb`);
  return { shape: shape as IconShape, color, accent };
}

function parseUnlock(raw: unknown, where: string): UnlockCondition {
  if (!isObj(raw)) fail(`${where}: unlock wajib ada`);
  if (raw.type === 'start') return { type: 'start' };
  if ((raw.type === 'popularity' || raw.type === 'money' || raw.type === 'level') && typeof raw.min === 'number' && raw.min >= 0) {
    return { type: raw.type, min: raw.min };
  }
  return fail(`${where}: syarat unlock tidak valid`);
}

/** Validasi data mentah bahan & resep menjadi katalog bertipe. */
export function parseCatalog(ingredientsRaw: unknown, recipesRaw: unknown): Catalog {
  if (!isObj(ingredientsRaw) || !Array.isArray(ingredientsRaw.ingredients)) fail('ingredients.json harus berisi array "ingredients"');
  if (!isObj(recipesRaw) || !Array.isArray(recipesRaw.recipes)) fail('recipes.json harus berisi array "recipes"');

  const ingredients: IngredientDef[] = ingredientsRaw.ingredients.map((r: unknown, i: number) => {
    if (!isObj(r) || !str(r.id) || !str(r.name) || !str(r.unit) || !str(r.pack)) fail(`bahan #${i}: id, name, unit, pack wajib berupa teks`);
    const where = `bahan "${r.id}"`;
    if (!posInt(r.packSize)) fail(`${where}: packSize harus bilangan bulat > 0`);
    if (!posInt(r.basePrice)) fail(`${where}: basePrice harus bilangan bulat > 0`);
    if (r.shelfLifeDays !== null && !posInt(r.shelfLifeDays)) fail(`${where}: shelfLifeDays harus null atau > 0`);
    return {
      id: r.id, name: r.name, unit: r.unit, pack: r.pack, packSize: r.packSize, basePrice: r.basePrice,
      shelfLifeDays: r.shelfLifeDays as number | null, chilled: r.chilled === true, icon: parseIcon(r.icon, where),
    };
  });
  const ingMap = new Map(ingredients.map((x) => [x.id, x]));
  if (ingMap.size !== ingredients.length) fail('id bahan ganda');

  const recipes: RecipeDef[] = recipesRaw.recipes.map((r: unknown, i: number) => {
    if (!isObj(r) || !str(r.id) || !str(r.name)) fail(`resep #${i}: id & name wajib`);
    const where = `resep "${r.id}"`;
    if (typeof r.category !== 'string' || !(CATEGORIES as readonly string[]).includes(r.category)) fail(`${where}: kategori tidak dikenal`);
    if (!posInt(r.salePrice)) fail(`${where}: salePrice harus > 0`);
    if (!isObj(r.ingredients) || Object.keys(r.ingredients).length === 0) fail(`${where}: butuh minimal satu bahan`);
    const needs: Record<string, number> = {};
    for (const [id, qty] of Object.entries(r.ingredients)) {
      if (!ingMap.has(id)) fail(`${where}: bahan "${id}" tidak ada di ingredients.json`);
      if (!posInt(qty)) fail(`${where}: jumlah bahan "${id}" harus bilangan bulat > 0`);
      needs[id] = qty;
    }
    if (typeof r.shelfLifeDays !== 'number' || !Number.isInteger(r.shelfLifeDays) || r.shelfLifeDays < 0) fail(`${where}: shelfLifeDays tidak valid`);
    const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [];
    return {
      id: r.id, name: r.name, category: r.category as RecipeCategory, salePrice: r.salePrice, ingredients: needs,
      unlock: parseUnlock(r.unlock, where), shelfLifeDays: r.shelfLifeDays, tags, icon: parseIcon(r.icon, where),
    };
  });
  const recMap = new Map(recipes.map((x) => [x.id, x]));
  if (recMap.size !== recipes.length) fail('id resep ganda');
  if (!recipes.some((r) => r.unlock.type === 'start')) fail('minimal satu resep harus terbuka sejak awal');

  return {
    ingredients,
    recipes,
    ingredient: (id) => ingMap.get(id) ?? fail(`bahan "${id}" tidak dikenal`),
    recipe: (id) => recMap.get(id) ?? fail(`resep "${id}" tidak dikenal`),
    hasIngredient: (id) => ingMap.has(id),
    hasRecipe: (id) => recMap.has(id),
  };
}

/** Katalog bawaan game (dari src/data/*.json). */
export const CATALOG: Catalog = parseCatalog(ingredientsJson, recipesJson);
