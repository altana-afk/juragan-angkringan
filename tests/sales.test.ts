import { activeAnchors } from '../src/world/MapData';
import { describe, expect, it } from 'vitest';
import mainStreet from '../src/data/maps/main-street.json';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { GameContext } from '../src/core/GameContext';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { CUSTOMER_TYPES } from '../src/data/customers';
import { arrivalChancePerMinute, hourFactor, planCustomer, popularityFactor, recipeAppeal } from '../src/systems/DemandSystem';
import { totalQty } from '../src/systems/InventorySystem';
import { applySale, resolveOrder } from '../src/systems/SalesSystem';
import { SalesSimulation } from '../src/systems/SalesSimulation';
import { MemoryStorage } from '../src/systems/SaveSystem';
import { SeededRandom } from '../src/utils/random';
import { parseMapData } from '../src/world/MapData';
import { addStock } from '../src/systems/InventorySystem';

const map = parseMapData(mainStreet);
const plan = (wants: string[], budget = 100_000) => ({ typeId: 'pekerja', name: 'Uji', partySize: 1, budget, patience: 8, wants, paletteIndex: 0 });

function withProducts(stock: Record<string, number>): GameState {
  const s = createInitialState();
  for (const [id, qty] of Object.entries(stock)) addStock(s.inventory.products, id, qty, 1, 1000);
  return s;
}

describe('data pelanggan & peta', () => {
  it('ada 7 tipe pelanggan dan kursi/antrean di peta', () => {
    expect(CUSTOMER_TYPES.map((t) => t.id)).toEqual(['mahasiswa', 'pekerja', 'ojol', 'keluarga', 'tetap', 'penasaran', 'royal']);
    expect(map.customers?.seats.length).toBe(30);
    expect(activeAnchors(map.customers!, []).seats.length).toBe(10);
    expect(activeAnchors(map.customers!, ['bangku_tambahan', 'tikar_kedua', 'area_makan_luas']).seats.length).toBe(20);
    expect(activeAnchors(map.customers!, ['bangku_tambahan', 'tikar_kedua', 'area_makan_luas', 'kursi_plastik', 'tikar_ketiga', 'meja_payung']).seats.length).toBe(30);
    expect(map.customers?.queue.length).toBe(3);
  });
});

describe('permintaan', () => {
  it('ramai saat jam makan malam & naik dengan popularitas', () => {
    expect(hourFactor(19.75 * 60)).toBeGreaterThan(hourFactor(17 * 60));
    expect(hourFactor(19.75 * 60)).toBeGreaterThan(hourFactor(25.5 * 60));
    expect(hourFactor(27 * 60)).toBe(0);
    expect(popularityFactor(50)).toBeGreaterThan(popularityFactor(10));
    expect(arrivalChancePerMinute(20 * 60, 80)).toBeGreaterThan(arrivalChancePerMinute(20 * 60, 10));
  });

  it('larut malam makanan mengenyangkan lebih diminati; harga di atas budget tidak diminati', () => {
    const t = CUSTOMER_TYPES[0]!;
    const nasi = CATALOG.recipe('nasi_goreng');
    expect(recipeAppeal(nasi, t, 23 * 60, 50_000)).toBeGreaterThan(recipeAppeal(nasi, t, 19 * 60, 50_000));
    expect(recipeAppeal(nasi, t, 19 * 60, 5_000)).toBeLessThan(recipeAppeal(nasi, t, 19 * 60, 50_000));
  });

  it('rencana pelanggan hanya memesan menu yang terbuka & bervariasi', () => {
    const rng = new SeededRandom('uji');
    const state = createInitialState();
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = planCustomer(rng, CUSTOMER_TYPES, state, CATALOG, 20 * 60);
      expect(p.wants.length).toBeGreaterThan(0);
      for (const w of p.wants) {
        expect(state.unlockedRecipes).toContain(w);
        seen.add(w);
      }
    }
    expect(seen.size).toBe(5);
  });
});

describe('penjualan', () => {
  it('pesanan tersedia terjual: stok berkurang, uang bertambah', () => {
    const s = withProducts({ nasi_goreng: 3, es_teh: 3 });
    const out = resolveOrder(s, CATALOG, plan(['nasi_goreng', 'es_teh']), new SeededRandom(1));
    expect(out.kind).toBe('served');
    expect(out.total).toBe(16_000);
    applySale(s, out);
    expect(s.player.money).toBe(516_000);
    expect(totalQty(s.inventory.products['nasi_goreng'])).toBe(2);
    expect(s.ledger.revenue).toBe(16_000);
    expect(s.ledger.sold).toEqual({ nasi_goreng: 1, es_teh: 1 });
    expect(s.ledger.served).toBe(1);
  });

  it('produk habis → ganti, batal sebagian, atau pergi', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const s = withProducts({ tahu_goreng: 2, es_teh: 1 });
      const out = resolveOrder(s, CATALOG, plan(['tempe_goreng', 'teh_hangat']), new SeededRandom(seed));
      kinds.add(out.kind);
      if (out.substitutions.length) expect(out.substitutions[0]!.got).toMatch(/tahu_goreng|es_teh/);
    }
    expect(kinds).toEqual(new Set(['served', 'partial', 'left-empty']));
    const empty = resolveOrder(createInitialState(), CATALOG, plan(['nasi_goreng']), new SeededRandom(3));
    expect(empty.kind).toBe('left-empty');
    expect(empty.satisfaction).toBeLessThan(30);
  });

  it('tidak menjual melebihi budget atau stok', () => {
    const s = withProducts({ nasi_goreng: 1 });
    const out = resolveOrder(s, CATALOG, plan(['nasi_goreng', 'nasi_goreng', 'nasi_goreng'], 30_000), new SeededRandom(9));
    expect(out.sold.reduce((n, l) => n + l.qty, 0)).toBe(1);
    const poor = resolveOrder(withProducts({ nasi_goreng: 5 }), CATALOG, plan(['nasi_goreng'], 5_000), new SeededRandom(9));
    expect(poor.total).toBe(0);
    // Kurang uang bukan berarti produk habis.
    expect(poor.missed).toEqual([]);
  });
});

describe('simulasi satu hari penuh', () => {
  function runDay(stock: Record<string, number>, popularity = 10, seed = 'hari-1') {
    const ctx = new GameContext({ storage: new MemoryStorage() });
    ctx.startNewGame();
    ctx.store.update('uji', (d) => {
      d.player.popularity = popularity;
      for (const [id, qty] of Object.entries(stock)) addStock(d.inventory.products, id, qty, 1, 1500);
    });
    expect(ctx.actions.startSelling().ok).toBe(true);
    const sim = new SalesSimulation(map.customers!, CATALOG, CUSTOMER_TYPES, {
      getState: () => ctx.store.get(),
      order: (p, w, rng) => ctx.actions.serveCustomer(p, w, rng),
      walkAway: (p) => ctx.actions.customerWalkedAway(p),
      setClock: (m) => ctx.actions.setClock(m),
    }, { seed, startMinutes: GAME_CONFIG.dayCycle.openMinutes });
    let maxSeats = 0;
    let guard = 0;
    let arrivals = 0;
    while (!sim.isEnded && guard++ < 20_000) {
      arrivals += sim.advance(0.25).filter((e) => e.type === 'arrive').length;
      maxSeats = Math.max(maxSeats, sim.seatsTaken);
      expect(sim.seatsTaken).toBeLessThanOrEqual(sim.seatsTotal);
      for (const qty of Object.values(ctx.store.get().inventory.products)) for (const b of qty) expect(b.qty).toBeGreaterThan(0);
    }
    ctx.actions.finishSelling();
    return { ctx, sim, maxSeats, arrivals };
  }

  it('pelanggan datang, membeli, dan hari selesai pada jam tutup', () => {
    const { ctx, sim, arrivals } = runDay({ nasi_goreng: 15, tempe_goreng: 15, tahu_goreng: 15, es_teh: 20, teh_hangat: 15 });
    const s = ctx.store.get();
    expect(s.ledger.customers).toBe(arrivals);
    expect(sim.isEnded).toBe(true);
    expect(s.phase).toBe('evaluasi');
    expect(s.ledger.customers).toBeGreaterThan(3);
    expect(s.ledger.revenue).toBeGreaterThan(0);
    expect(s.player.money).toBe(500_000 + s.ledger.revenue - 10_000);
    const sold = Object.values(s.ledger.sold).reduce((a, b) => a + b, 0);
    expect(sold).toBeGreaterThan(5);
    expect(s.ledger.served + s.ledger.partial + s.ledger.leftEmpty + s.ledger.leftWaiting).toBe(s.ledger.customers);
  });

  it('rata-rata kedatangan sesuai konfigurasi (±18 rombongan/hari pada popularitas 10)', () => {
    let total = 0;
    for (let i = 0; i < 12; i++) total += runDay({ es_teh: 100 }, 10, `rata-${i}`).ctx.store.get().ledger.customers;
    const avg = total / 12;
    expect(avg).toBeGreaterThan(12);
    expect(avg).toBeLessThan(24);
  });

  it('tanpa stok semua pelanggan kecewa dan uang tidak bertambah', () => {
    const { ctx } = runDay({});
    const s = ctx.store.get();
    expect(s.ledger.revenue).toBe(0);
    expect(s.ledger.customers).toBeGreaterThan(0);
    expect(s.ledger.leftEmpty + s.ledger.leftWaiting).toBe(s.ledger.customers);
  });

  it('popularitas tinggi → lebih ramai, kursi bisa penuh & ada yang pergi', () => {
    const { ctx, maxSeats } = runDay({ nasi_goreng: 200, es_teh: 200, tempe_goreng: 200 }, 100);
    expect(ctx.store.get().ledger.customers).toBeGreaterThan(40);
    expect(maxSeats).toBeGreaterThanOrEqual(8);
  });

  it('hari berikutnya: stok matang yang basi dibuang & buku harian direset', () => {
    const { ctx } = runDay({ es_teh: 50 });
    const res = ctx.actions.startNextDay();
    expect(res.ok).toBe(true);
    const s = ctx.store.get();
    expect(s.calendar.day).toBe(2);
    expect(s.phase).toBe('persiapan');
    expect(s.inventory.products['es_teh']).toBeUndefined();
    expect(s.ledger.revenue).toBe(0);
  });
});
