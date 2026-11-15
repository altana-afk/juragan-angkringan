import { describe, expect, it } from 'vitest';
import ingredientsJson from '../src/data/ingredients.json';
import recipesJson from '../src/data/recipes.json';
import { CATALOG, parseCatalog } from '../src/data/catalog';
import { estimatedPortionCost } from '../src/systems/RecipeSystem';

describe('katalog bahan & resep', () => {
  it('memuat seluruh bahan dan resep dari JSON', () => {
    expect(CATALOG.ingredients.length).toBeGreaterThanOrEqual(20);
    expect(CATALOG.recipes.map((r) => r.id)).toEqual(expect.arrayContaining([
      'nasi_goreng', 'tempe_goreng', 'tahu_goreng', 'sosis_bakar', 'bakso_bakar', 'sate_usus', 'sate_ati_ampela',
      'sate_ayam', 'mi_goreng', 'mi_rebus', 'es_teh', 'teh_hangat', 'kopi_panas', 'es_sirup', 'air_mineral',
    ]));
  });

  it('menu hari pertama sesuai desain', () => {
    const start = CATALOG.recipes.filter((r) => r.unlock.type === 'start').map((r) => r.id).sort();
    expect(start).toEqual(['es_teh', 'nasi_goreng', 'tahu_goreng', 'teh_hangat', 'tempe_goreng']);
  });

  it('setiap resep untung pada harga dasar', () => {
    for (const r of CATALOG.recipes) expect(estimatedPortionCost(CATALOG, r, 1), r.id).toBeLessThan(r.salePrice);
  });

  it('menolak resep yang memakai bahan tak dikenal', () => {
    const bad = structuredClone(recipesJson) as unknown as { recipes: { ingredients: Record<string, number> }[] };
    bad.recipes[0]!.ingredients = { batu: 1 };
    expect(() => parseCatalog(ingredientsJson, bad)).toThrow(/batu/);
  });

  it('menolak harga atau ukuran kemasan tidak valid', () => {
    const bad = structuredClone(ingredientsJson) as unknown as { ingredients: { packSize: number; basePrice: number }[] };
    bad.ingredients[0]!.packSize = 0;
    expect(() => parseCatalog(bad, recipesJson)).toThrow(/packSize/);
  });
});
