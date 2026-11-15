import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { eventById } from '../src/data/events';
import { locationById } from '../src/data/locations';
import { closeDay } from '../src/systems/DayCloseSystem';
import { arrivalChancePerMinute } from '../src/systems/DemandSystem';
import { storageCapacity } from '../src/systems/EconomySystem';
import { eligibleEvents, rollEvent } from '../src/systems/EventSystem';
import { addStock } from '../src/systems/InventorySystem';
import { modifiersOf } from '../src/systems/SalesSimulation';
import { resolveOrder } from '../src/systems/SalesSystem';
import { buyUpgrade, totalEffects, UPGRADES, upgradeById } from '../src/systems/UpgradeSystem';
import { SeededRandom } from '../src/utils/random';
import { activeAnchors } from '../src/world/MapData';
import { getMap } from '../src/world/maps';

const rich = (): GameState => {
  const s = createInitialState();
  s.player.money = 20_000_000;
  s.player.popularity = 90;
  s.calendar.day = 10;
  return s;
};

describe('menu baru', () => {
  it('30 menu biasa (+1 menu cerita), semua bahannya ada & bisa dibuka', () => {
    expect(CATALOG.recipes.filter((r) => r.unlock.type !== 'story').length).toBe(30);
    for (const id of ['pisang_goreng', 'kacang_rebus', 'es_jeruk', 'jagung_bakar', 'kopi_susu', 'bihun_goreng', 'roti_bakar', 'teh_tarik', 'es_kopi_susu', 'pisang_bakar']) {
      const r = CATALOG.recipe(id);
      for (const ing of Object.keys(r.ingredients)) expect(() => CATALOG.ingredient(ing)).not.toThrow();
    }
    expect(CATALOG.ingredient('jeruk').chilled).toBe(true);
  });
});

describe('upgrade baru', () => {
  it('kapasitas gudang berjenjang sampai +3.600', () => {
    const s = rich();
    for (const id of ['rak_dinding', 'rak_penyimpanan', 'gudang_besar', 'gudang_sewaan', 'kulkas', 'gudang_pendingin']) buyUpgrade(s, id);
    expect(storageCapacity(s)).toBe(500 + 200 + 300 + 600 + 1000 + 1500);
    expect(() => buyUpgrade(rich(), 'gudang_pendingin')).toThrow(/Gudang sewaan/);
  });

  it('tempat duduk: 10 → 30 kursi dengan semua upgrade kapasitas', () => {
    const seatUps = UPGRADES.filter((u) => u.effects.seats).map((u) => u.id);
    expect(seatUps.length).toBe(6);
    expect(totalEffects(seatUps).seats).toBe(20);
    for (const mapId of ['main-street', 'kampus', 'pasar', 'stasiun', 'pasar-malam']) {
      const map = getMap(mapId);
      expect(activeAnchors(map.customers!, seatUps).seats.length).toBe(30);
      for (const id of seatUps) {
        const has = map.customers!.seats.filter((x) => x.requires === id).length;
        expect(has).toBe(upgradeById(id).effects.seats);
      }
    }
  });

  it('kenyamanan: kipas (panas), terpal (hujan), wi-fi & bangku antre (kesabaran)', () => {
    const comfort = ['kipas_angin', 'terpal_hujan', 'wifi_gratis', 'radio_musik', 'obat_nyamuk', 'kursi_tunggu', 'toilet_umum'];
    for (const id of comfort) expect(upgradeById(id).category).toBe('lingkungan');
    const sat = (weather: 'panas' | 'hujan', ups: string[]): number => {
      const s = createInitialState();
      s.weather = weather;
      s.upgrades = ups;
      addStock(s.inventory.products, 'es_teh', 5, 1, 900);
      return resolveOrder(s, CATALOG, { typeId: 'pekerja', name: 'x', partySize: 1, budget: 50_000, patience: 8, wants: ['es_teh'], paletteIndex: 0 }, new SeededRandom(1)).satisfaction;
    };
    expect(sat('panas', ['kipas_angin'])).toBeGreaterThan(sat('panas', []));
    expect(sat('hujan', ['terpal_hujan'])).toBeGreaterThan(sat('hujan', []));
    const rain = createInitialState();
    rain.weather = 'hujan';
    const before = arrivalChancePerMinute(20 * 60, 40, modifiersOf(rain));
    rain.upgrades = ['terpal_hujan'];
    expect(arrivalChancePerMinute(20 * 60, 40, modifiersOf(rain))).toBeCloseTo(before * (0.9 / 0.75));
    expect(totalEffects(['wifi_gratis', 'kursi_tunggu', 'toilet_umum']).patience).toBe(9);
  });
});

describe('Pasar Malam', () => {
  it('ramai sampai 02.00, akhir pekan jauh lebih ramai, sore sepi, sewa mahal', () => {
    const pm = createInitialState();
    pm.mapId = 'pasar-malam';
    const ms = createInitialState();
    const r = (s: GameState, m: number): number => arrivalChancePerMinute(m, 40, modifiersOf(s));
    pm.calendar.day = 6; // Sabtu
    ms.calendar.day = 6;
    expect(r(pm, 25 * 60) / r(ms, 25 * 60)).toBeGreaterThan(1.4);
    expect(r(pm, 17.5 * 60) / r(ms, 17.5 * 60)).toBeLessThan(1);
    pm.calendar.day = 2; // Selasa
    const tue = r(pm, 22 * 60);
    pm.calendar.day = 6;
    expect(r(pm, 22 * 60)).toBeGreaterThan(tue * 1.6);
    expect(locationById('pasar-malam').rent).toBeGreaterThan(locationById('stasiun').rent);
  });

  it('event khusus pasar malam: konser, borongan makanan & minuman, retribusi', () => {
    const ids = new Set<string>();
    for (let d = 2; d < 120; d++) for (const e of eligibleEvents(d, 'pasar-malam')) ids.add(e.id);
    for (const id of ['konser_dangdut', 'kembang_api', 'pesanan_panitia', 'rombongan_wisata', 'retribusi', 'wahana_rusak']) expect(ids.has(id)).toBe(true);
    expect(ids.has('acara_kampus')).toBe(false);
    const unlocked = [...createInitialState().unlockedRecipes, 'es_jeruk'];
    let drinks = 0;
    for (let d = 2; d < 400; d++) {
      const e = rollEvent(d, 'pasar-malam', unlocked, CATALOG);
      if (e?.id === 'rombongan_wisata') {
        drinks++;
        expect(CATALOG.recipe(e.bulk!.recipeId).category).toBe('minuman');
      }
      if (e?.id === 'pesanan_panitia') expect(CATALOG.recipe(e.bulk!.recipeId).category).not.toBe('minuman');
    }
    expect(drinks).toBeGreaterThan(0);
    const s = createInitialState();
    s.mapId = 'pasar-malam';
    s.event = { id: 'retribusi', bulk: null };
    s.phase = 'evaluasi';
    closeDay(s, CATALOG);
    expect(s.lastReport?.operationalCost).toBe(locationById('pasar-malam').rent + (eventById('retribusi').effects.fee ?? 0));
  });
});
