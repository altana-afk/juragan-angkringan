import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { addStock } from '../src/systems/InventorySystem';
import { createOrder, expectedOrders, setDeliveryMode, tickOnline } from '../src/systems/OnlineOrderSystem';
import { onlinePriceOf, salePriceOf, setOnlinePrice } from '../src/systems/PricingSystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { SeededRandom } from '../src/utils/random';

function selling(): GameState {
  const s = createInitialState();
  setDeliveryMode(s, 'ojol');
  for (const id of s.unlockedRecipes) addStock(s.inventory.products, id, 40, 1, 1500);
  s.phase = 'berjualan';
  s.calendar.clockMinutes = 19 * 60;
  return s;
}

describe('harga online & sakelar pesanan online', () => {
  it('harga online default ikut harga di tempat, bisa diatur dan disamakan lagi', () => {
    const s = selling();
    const r = CATALOG.recipe(s.unlockedRecipes[0]!);
    expect(onlinePriceOf(s, r)).toBe(salePriceOf(s, r));
    setOnlinePrice(s, r, salePriceOf(s, r) + 1000);
    expect(onlinePriceOf(s, r)).toBe(salePriceOf(s, r) + 1000);
    expect(salePriceOf(s, r)).toBe(r.salePrice);
    setOnlinePrice(s, r, null);
    expect(onlinePriceOf(s, r)).toBe(salePriceOf(s, r));
  });

  it('nilai pesanan memakai harga online', () => {
    const a = selling();
    const b = selling();
    for (const id of b.unlockedRecipes) setOnlinePrice(b, CATALOG.recipe(id), CATALOG.recipe(id).salePrice * 1.5);
    const oa = createOrder(a, CATALOG, new SeededRandom('x'), a.calendar.clockMinutes, 1)!;
    const ob = createOrder(b, CATALOG, new SeededRandom('x'), b.calendar.clockMinutes, 1)!;
    expect(ob.value).toBeGreaterThan(oa.value);
    // Harga lebih mahal → pesanan lebih jarang.
    expect(expectedOrders(b, CATALOG)).toBeLessThan(expectedOrders(a, CATALOG));
  });

  it('pesanan online yang ditutup tidak menerima pesanan baru', () => {
    const s = selling();
    s.online.enabled = false;
    for (let m = 19 * 60; m < 22 * 60; m++) tickOnline(s, CATALOG, m);
    expect(s.online.today.generated).toBe(0);
  });

  it('save v10 dimuat dengan pesanan online menyala & tanpa harga khusus', () => {
    const s = createInitialState() as unknown as Record<string, unknown>;
    const online = { ...(s.online as Record<string, unknown>) };
    delete online.enabled;
    delete online.prices;
    const migrated = migrateSave({ version: 10, state: { ...s, online } }) as unknown as { online: GameState['online'] };
    expect(migrated.online.enabled).toBe(true);
    expect(migrated.online.prices).toEqual({});
  });
});
