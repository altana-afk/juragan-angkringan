import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { CUSTOMER_TYPES } from '../src/data/customers';
import { BASE_MAX_PORTIONS, maxPortionsPerOrder, prepareProducts } from '../src/systems/CookingSystem';
import { closeDay } from '../src/systems/DayCloseSystem';
import { planCustomer, recipeAppeal } from '../src/systems/DemandSystem';
import { applyPurchase, BASE_STORAGE, storageCapacity } from '../src/systems/EconomySystem';
import { addStock } from '../src/systems/InventorySystem';
import { overpricePenalty, priceAppealFactor, priceBounds, salePriceOf, setPrice } from '../src/systems/PricingSystem';
import { isUnlockMet, refreshUnlocks } from '../src/systems/RecipeSystem';
import { resolveOrder } from '../src/systems/SalesSystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { buyUpgrade, totalEffects, upgradeBlockers, upgradeById, UPGRADES } from '../src/systems/UpgradeSystem';
import { WEATHER_EFFECTS, weatherForDay } from '../src/systems/WeatherSystem';
import { SeededRandom } from '../src/utils/random';
import { activeObjects, parseMapData } from '../src/world/MapData';
import mainStreet from '../src/data/maps/main-street.json';
import { runBot } from './helpers/bot';

const rich = (): GameState => {
  const s = createInitialState();
  s.player.money = 10_000_000;
  s.player.popularity = 80;
  s.calendar.day = 10;
  return s;
};

describe('upgrade', () => {
  it('data upgrade lengkap: 4 kategori, tiap upgrade punya harga, efek & deskripsi', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(16);
    for (const cat of ['gerobak', 'peralatan', 'kapasitas', 'lingkungan']) expect(UPGRADES.some((u) => u.category === cat)).toBe(true);
    for (const u of UPGRADES) {
      expect(u.cost).toBeGreaterThan(0);
      expect(u.description.length).toBeGreaterThan(5);
      expect(Object.keys(u.effects).length).toBeGreaterThan(0);
    }
  });

  it('membeli mengurangi uang, mencatat ledger & menolak syarat yang belum terpenuhi', () => {
    const s = createInitialState();
    expect(upgradeBlockers(s, upgradeById('gerobak_standar'))).toContain('Mulai Hari 3');
    expect(() => buyUpgrade(s, 'gerobak_modern')).toThrow(/Gerobak standar/);
    buyUpgrade(s, 'kompor_tambahan');
    expect(s.player.money).toBe(500_000 - 150_000);
    expect(s.ledger.upgradeCost).toBe(150_000);
    expect(() => buyUpgrade(s, 'kompor_tambahan')).toThrow(/Sudah dimiliki/);
    s.phase = 'berjualan';
    expect(() => buyUpgrade(s, 'wajan_besar')).toThrow(/persiapan/);
  });

  it('uang tidak cukup → ditolak tanpa mengubah state', () => {
    const s = createInitialState();
    s.player.money = 50_000;
    expect(() => buyUpgrade(s, 'rak_penyimpanan')).toThrow(/Kurang/);
    expect(s.upgrades).toEqual([]);
    expect(s.player.money).toBe(50_000);
  });

  it('efek nyata: porsi masak, gudang, kursi, varian gerobak & level usaha', () => {
    const s = rich();
    expect(maxPortionsPerOrder(s)).toBe(BASE_MAX_PORTIONS);
    expect(storageCapacity(s)).toBe(BASE_STORAGE);
    for (const id of ['wajan_besar', 'kompor_tambahan', 'rak_penyimpanan', 'gerobak_standar', 'gerobak_modern', 'bangku_tambahan', 'meja_kursi_bagus']) buyUpgrade(s, id);
    expect(maxPortionsPerOrder(s)).toBe(BASE_MAX_PORTIONS + 30 + 20 + 10 + 10);
    expect(storageCapacity(s)).toBe(BASE_STORAGE + 300);
    const fx = totalEffects(s.upgrades);
    expect(fx.businessLevel).toBe(3);
    expect(fx.seats).toBe(3);
    const map = parseMapData(mainStreet);
    const objs = activeObjects(map.objects, s.upgrades, fx.variants);
    expect(objs.find((o) => o.id === 'cart')?.variant).toBe('modern');
    expect(objs.find((o) => o.id === 'bench-extra')?.variant).toBe('premium');
    expect(activeObjects(map.objects, []).some((o) => o.id === 'bench-extra')).toBe(false);
  });

  it('gudang penuh menolak belanja; lemari pendingin memperpanjang umur produk', () => {
    const s = createInitialState();
    s.player.money = 5_000_000;
    addStock(s.inventory.ingredients, 'gula', 495, null, 100);
    expect(() => applyPurchase(s, CATALOG, [{ ingredientId: 'telur', packs: 1 }])).toThrow(/Gudang tidak muat/);
    const t = rich();
    buyUpgrade(t, 'lemari_pendingin');
    for (const ing of Object.keys(CATALOG.recipe('nasi_goreng').ingredients)) addStock(t.inventory.ingredients, ing, 10, null, 1000);
    prepareProducts(t, CATALOG, [{ recipeId: 'nasi_goreng', portions: 2 }]);
    expect(t.inventory.products['nasi_goreng']?.[0]?.expiresDay).toBe(t.calendar.day + 1);
  });
});

describe('menu berdasarkan level usaha', () => {
  it('menu spesial terbuka setelah upgrade gerobak', () => {
    const s = rich();
    const kopiJoss = CATALOG.recipe('kopi_joss');
    expect(isUnlockMet(kopiJoss.unlock, s)).toBe(false);
    buyUpgrade(s, 'gerobak_standar');
    expect(refreshUnlocks(s, CATALOG).map((r) => r.id)).toEqual(expect.arrayContaining(['nasi_kucing', 'wedang_jahe']));
    expect(s.unlockedRecipes).not.toContain('kopi_joss');
    buyUpgrade(s, 'gerobak_modern');
    refreshUnlocks(s, CATALOG);
    expect(s.unlockedRecipes).toEqual(expect.arrayContaining(['kopi_joss', 'susu_jahe']));
    buyUpgrade(s, 'gerobak_premium');
    refreshUnlocks(s, CATALOG);
    expect(s.unlockedRecipes).toContain('sego_bakar');
  });
});

describe('harga jual', () => {
  it('harga dibulatkan Rp500 & dibatasi 50–200%', () => {
    const s = createInitialState();
    const nasi = CATALOG.recipe('nasi_goreng');
    expect(setPrice(s, nasi, 13_200)).toBe(13_000);
    expect(salePriceOf(s, nasi)).toBe(13_000);
    expect(setPrice(s, nasi, 99_000)).toBe(priceBounds(nasi).max);
    expect(setPrice(s, nasi, 1)).toBe(priceBounds(nasi).min);
    setPrice(s, nasi, nasi.salePrice);
    expect(s.prices).toEqual({});
    expect(() => setPrice(s, CATALOG.recipe('kopi_joss'), 9000)).toThrow(/belum terbuka/);
  });

  it('harga mahal menurunkan minat & kepuasan; harga dipakai saat transaksi', () => {
    expect(priceAppealFactor(1.5)).toBeLessThan(0.5);
    expect(priceAppealFactor(0.8)).toBeGreaterThan(1);
    expect(overpricePenalty(1)).toBe(0);
    expect(overpricePenalty(1.5)).toBeLessThan(-10);
    const t = CUSTOMER_TYPES[1]!;
    const nasi = CATALOG.recipe('nasi_goreng');
    expect(recipeAppeal(nasi, t, 19 * 60, 50_000, { price: 18_000, weather: 'cerah', drinkAppeal: 0 })).toBeLessThan(recipeAppeal(nasi, t, 19 * 60, 50_000));

    const normal = createInitialState();
    const pricey = createInitialState();
    setPrice(pricey, nasi, 18_000);
    for (const s of [normal, pricey]) addStock(s.inventory.products, 'nasi_goreng', 5, 1, 5000);
    const plan = { typeId: 'pekerja', name: 'Uji', partySize: 1, budget: 100_000, patience: 8, wants: ['nasi_goreng'], paletteIndex: 0 };
    const a = resolveOrder(normal, CATALOG, plan, new SeededRandom(3));
    const b = resolveOrder(pricey, CATALOG, plan, new SeededRandom(3));
    expect(b.total).toBe(18_000);
    expect(b.satisfaction).toBeLessThan(a.satisfaction - 10);
  });

  it('kemahalan membuat pelanggan memesan lebih sedikit', () => {
    const count = (s: GameState): number => {
      const rng = new SeededRandom('harga');
      let n = 0;
      for (let i = 0; i < 400; i++) n += planCustomer(rng, CUSTOMER_TYPES, s, CATALOG, 20 * 60).wants.length;
      return n;
    };
    const normal = createInitialState();
    const pricey = createInitialState();
    for (const id of pricey.unlockedRecipes) setPrice(pricey, CATALOG.recipe(id), CATALOG.recipe(id).salePrice * 1.8);
    expect(count(pricey)).toBeLessThan(count(normal) * 0.7);
  });
});

describe('cuaca', () => {
  it('deterministik per hari, Hari 1 cerah, semua jenis muncul', () => {
    expect(weatherForDay(1, 'cerah')).toBe('cerah');
    expect(weatherForDay(12, 'cerah')).toBe(weatherForDay(12, 'cerah'));
    const seen = new Set<string>();
    let prev = weatherForDay(2, 'cerah');
    for (let d = 2; d < 200; d++) {
      prev = weatherForDay(d, prev);
      seen.add(prev);
    }
    expect(seen.size).toBe(4);
  });

  it('hujan → makanan/minuman hangat naik, es turun; panas → minuman dingin naik', () => {
    const t = CUSTOMER_TYPES[0]!;
    const teh = CATALOG.recipe('teh_hangat');
    const es = CATALOG.recipe('es_teh');
    const at = (r: typeof teh, weather: 'cerah' | 'hujan' | 'panas'): number => recipeAppeal(r, t, 19 * 60, 50_000, { price: r.salePrice, weather, drinkAppeal: 0 });
    expect(at(teh, 'hujan')).toBeGreaterThan(at(teh, 'cerah'));
    expect(at(es, 'hujan')).toBeLessThan(at(es, 'cerah'));
    expect(at(es, 'panas')).toBeGreaterThan(at(es, 'cerah'));
    expect(WEATHER_EFFECTS.hujan.arrival).toBeLessThan(1);
  });
});

describe('bangkrut', () => {
  it('kas minus 3 hari berturut-turut saat tutup → bangkrut; kas positif mereset hitungan', () => {
    const s = createInitialState();
    s.player.money = 5_000;
    s.phase = 'evaluasi';
    closeDay(s, CATALOG);
    expect(s.debtDays).toBe(1);
    expect(s.lastReport?.debtDays).toBe(1);
    closeDay(s, CATALOG);
    expect(s.bankrupt).toBe(false);
    closeDay(s, CATALOG);
    expect(s.debtDays).toBe(3);
    expect(s.bankrupt).toBe(true);
    const t = createInitialState();
    t.player.money = 5_000;
    closeDay(t, CATALOG);
    t.player.money = 100_000;
    closeDay(t, CATALOG);
    expect(t.debtDays).toBe(0);
  });
});

describe('save v5', () => {
  it('memigrasi save Stage 4 (v4) dengan upgrade & harga kosong', () => {
    const v4 = { version: 4, savedAt: '', state: { ...structuredClone(createInitialState()), upgrades: undefined, prices: undefined, debtDays: undefined, bankrupt: undefined } };
    const st = migrateSave(v4);
    expect(st.upgrades).toEqual([]);
    expect(st.prices).toEqual({});
    expect(st.bankrupt).toBe(false);
    expect(st.ledger.upgradeCost).toBe(0);
  });
});

describe('keseimbangan ekonomi (bot 30 hari)', () => {
  it('pemain wajar tidak bangkrut, tumbuh pelan, dan membeli upgrade', () => {
    const { ctx, log } = runBot(30);
    const s = ctx.store.get();
    expect(log.length).toBe(30);
    expect(s.bankrupt).toBe(false);
    expect(s.upgrades.length).toBeGreaterThanOrEqual(3);
    // Tidak terlalu mudah kaya: kas + investasi masih dalam batas wajar.
    const invested = s.upgrades.reduce((sum, id) => sum + upgradeById(id).cost, 0);
    expect(s.player.money + invested).toBeGreaterThan(800_000);
    expect(s.player.money + invested).toBeLessThan(12_000_000);
    expect(s.player.popularity).toBeGreaterThan(20);
  }, 60_000);

  it('harga kemahalan menggerus popularitas & kas', () => {
    const fair = runBot(12, { buyUpgrades: false }).ctx.store.get();
    const greedy = runBot(12, { buyUpgrades: false, priceFactor: 1.8 }).ctx.store.get();
    expect(greedy.player.popularity).toBeLessThan(fair.player.popularity);
    expect(greedy.player.money).toBeLessThan(fair.player.money);
  }, 60_000);

  it('bangkrut tidak terjadi dalam seminggu pertama walau boros', () => {
    const { log } = runBot(7, { stockFactor: 2.5 });
    expect(log.length).toBe(7);
    expect(log.every((d) => d.money > -100_000)).toBe(true);
  }, 60_000);
});
