import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState, type OnlineOrder } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { ONLINE_RULES } from '../src/data/online';
import { addStock, totalQty } from '../src/systems/InventorySystem';
import { travelFactor, travelMinutes } from '../src/systems/CourierSystem';
import { closeDay } from '../src/systems/DayCloseSystem';
import {
  acceptBlocker,
  acceptOrder,
  closeOnlineDay,
  createOrder,
  dailyLimit,
  finishOnlineDay,
  onlineNet,
  rejectOrder,
  setDeliveryMode,
  stockShortfall,
  tickOnline,
} from '../src/systems/OnlineOrderSystem';
import { migrateSave } from '../src/systems/SaveSystem';
import { SeededRandom } from '../src/utils/random';

const OPEN = 17 * 60;

function selling(mode: 'kurir' | 'ojol' | null = 'ojol', stock = 40): GameState {
  const s = createInitialState();
  if (mode) setDeliveryMode(s, mode);
  for (const id of s.unlockedRecipes) addStock(s.inventory.products, id, stock, 1, 1500);
  s.phase = 'berjualan';
  s.calendar.clockMinutes = OPEN + 120;
  return s;
}

/** Tambah pesanan buatan tangan (1 nasi goreng + 1 es teh) yang menunggu jawaban. */
function addOrder(s: GameState, km = 1, note: OnlineOrder['note'] = null): OnlineOrder {
  const o = createOrder(s, CATALOG, new SeededRandom(`uji-${s.online.nextId}`), s.calendar.clockMinutes, s.online.nextId++)!;
  o.items = [{ recipeId: 'nasi_goreng', qty: 1 }, { recipeId: 'es_teh', qty: 1 }];
  o.value = 12000 + 3000;
  o.km = km;
  o.note = note;
  s.online.orders.push(o);
  s.online.today.generated++;
  return o;
}

/** Jalankan menit demi menit (tanpa pesanan baru). */
function run(s: GameState, minutes: number): void {
  const start = s.calendar.clockMinutes;
  for (let m = start; m < start + minutes; m++) {
    s.calendar.clockMinutes = m;
    tickOnline(s, CATALOG, m, false);
  }
}

describe('pesanan masuk', () => {
  it('belum memilih cara mengantar → tidak ada pesanan', () => {
    const s = selling(null);
    for (let m = OPEN; m < OPEN + 540; m++) expect(tickOnline(s, CATALOG, m)).toEqual([]);
    expect(s.online.orders).toHaveLength(0);
  });

  it('satu hari berjualan memunculkan beberapa pesanan dari menu yang terbuka', () => {
    const s = selling('ojol');
    s.player.popularity = 40;
    for (let m = OPEN; m < OPEN + 540; m++) tickOnline(s, CATALOG, m);
    expect(s.online.today.generated).toBeGreaterThan(2);
    expect(s.online.today.generated).toBeLessThanOrEqual(dailyLimit(s) * 2);
    for (const o of s.online.orders) for (const l of o.items) expect(s.unlockedRecipes).toContain(l.recipeId);
    // Tidak dijawab → kedaluwarsa & rating turun.
    expect(s.online.today.expired).toBe(s.online.today.generated);
    expect(s.online.rating).toBeLessThan(ONLINE_RULES.startRating);
  });

  it('tolak tanpa penalti; batas harian 5, naik +3 per tingkat sistem pemesanan', () => {
    const s = selling('ojol');
    const r = addOrder(s);
    rejectOrder(s, r.id);
    expect(s.online.rating).toBe(60);
    expect(dailyLimit(s)).toBe(5);
    for (let i = 0; i < 5; i++) acceptOrder(s, addOrder(s).id, false);
    const extra = addOrder(s);
    expect(acceptBlocker(s, extra)).toMatch(/Batas 5/);
    s.upgrades.push('sistem_pemesanan');
    expect(dailyLimit(s)).toBe(8);
    s.upgrades.push('sistem_pemesanan_2');
    expect(dailyLimit(s)).toBe(11);
    expect(acceptBlocker(s, extra)).toBeNull();
  });
});

describe('kemitraan ojol', () => {
  it('driver menjemput 5–12 menit setelah diterima, stok diambil, komisi 20%', () => {
    const s = selling('ojol');
    const money = s.player.money;
    const o = acceptOrder(s, addOrder(s, 1).id, false);
    expect(o.pickupMinute! - o.acceptedMinute!).toBeGreaterThanOrEqual(5);
    expect(o.pickupMinute! - o.acceptedMinute!).toBeLessThanOrEqual(12);
    run(s, 60);
    expect(o.status).toBe('selesai');
    expect(o.late).toBe(false);
    expect(totalQty(s.inventory.products.nasi_goreng)).toBe(39);
    expect(s.online.today.commission).toBe(3000);
    expect(s.player.money).toBe(money + 15000 - 3000);
    expect(s.online.rating).toBe(61);
  });

  it('stok habis sebelum driver tiba → batal, rating −3, alasan jelas', () => {
    const s = selling('ojol', 1);
    const o = acceptOrder(s, addOrder(s).id, false);
    s.inventory.products.nasi_goreng = [];
    expect(stockShortfall(s, o)).toContain('nasi_goreng');
    run(s, 30);
    expect(o.status).toBe('batal');
    expect(o.cancelReason).toMatch(/Nasi Goreng/i);
    expect(s.online.rating).toBe(57);
  });

  it('hujan memperlambat perjalanan; pesanan jauh bisa terlambat (−2)', () => {
    expect(travelMinutes(3, travelFactor('ojol', 'hujan', 0))).toBeGreaterThan(travelMinutes(3, travelFactor('ojol', 'cerah', 0)));
    const dry = selling('ojol');
    const a = acceptOrder(dry, addOrder(dry, 3.2).id, false);
    run(dry, 90);
    expect(a.late).toBe(false);
    const wet = selling('ojol');
    wet.weather = 'hujan';
    const b = acceptOrder(wet, addOrder(wet, 3.2).id, false);
    run(wet, 90);
    expect(b.late).toBe(true);
    expect(wet.online.rating).toBe(58);
  });
});

describe('catatan pesanan', () => {
  const note = { id: 'tanpa_sambal', text: 'Tanpa sambal, ya', extraMinutes: 2, extraItem: null };
  it('dipenuhi: persiapan +menit; tidak dipenuhi: rating −1', () => {
    const s = selling('ojol');
    const yes = acceptOrder(s, addOrder(s, 1, { ...note }).id, true);
    expect(yes.readyMinute! - yes.acceptedMinute!).toBe(ONLINE_RULES.prepMinutes + 2);
    const no = acceptOrder(s, addOrder(s, 1, { ...note }).id, false);
    expect(no.readyMinute! - no.acceptedMinute!).toBe(ONLINE_RULES.prepMinutes);
    run(s, 60);
    expect(yes.status).toBe('selesai');
    expect(no.status).toBe('selesai');
    // +1 +1 (tepat waktu) −1 (catatan diabaikan)
    expect(s.online.rating).toBe(61);
  });

  it('item tambahan dari catatan memakai stok bila ada', () => {
    const s = selling('ojol');
    acceptOrder(s, addOrder(s, 1, { id: 'tambah_tempe', text: 'Tambah tempe', extraMinutes: 1, extraItem: 'tempe_goreng' }).id, true);
    run(s, 40);
    expect(totalQty(s.inventory.products.tempe_goreng)).toBe(39);
  });
});

describe('kurir sendiri', () => {
  it('3 pesanan per antar, tanpa batas perjalanan, ongkir masuk kas, gaji 40.000 saat tutup', () => {
    const s = selling('kurir');
    s.upgrades.push('sistem_pemesanan');
    for (let i = 0; i < 3; i++) acceptOrder(s, addOrder(s, 0.5 + i * 0.4).id, false);
    run(s, 6);
    expect(s.online.trips).toHaveLength(1);
    expect(s.online.trips[0]!.orderIds).toHaveLength(3);
    run(s, 60);
    for (let i = 0; i < 3; i++) acceptOrder(s, addOrder(s, 1).id, false);
    run(s, 80);
    expect(s.online.trips).toHaveLength(2);
    // Perjalanan ketiga tetap boleh: karyawan sendiri tidak dibatasi jumlah antar.
    acceptOrder(s, addOrder(s, 1).id, false);
    run(s, 80);
    expect(s.online.trips).toHaveLength(3);
    expect(s.online.today.delivered).toBe(7);
    expect(s.online.today.feesKept).toBe(7 * ONLINE_RULES.deliveryFee);
    expect(s.online.today.commission).toBe(0);
    const before = s.player.money;
    closeOnlineDay(s);
    expect(s.player.money).toBe(before - 40000);
  });

  it('perjalanan panjang tanpa kotak termos membuat makanan dingin (−1); termos mencegahnya', () => {
    const go = (thermos: boolean): OnlineOrder => {
      const s = selling('kurir');
      if (thermos) s.upgrades.push('kotak_termos');
      s.weather = 'hujan';
      const far = [2.4, 3.0, 3.2].map((km) => acceptOrder(s, addOrder(s, km).id, false));
      run(s, 120);
      return far[2]!;
    };
    expect(go(false).cold).toBe(true);
    expect(go(true).cold).toBe(false);
  });
});

describe('tutup hari', () => {
  it('pesanan yang sudah diterima dituntaskan; laporan berisi ringkasan online; popularitas bergeser maks ±2', () => {
    const s = selling('ojol');
    for (let i = 0; i < 3; i++) acceptOrder(s, addOrder(s).id, false);
    s.online.rating = 60;
    const pop = s.player.popularity;
    s.phase = 'berjualan';
    const report = closeDay(s, CATALOG);
    expect(report.online?.delivered).toBe(3);
    expect(report.online?.gross).toBe(45000);
    expect(Math.abs(report.online!.popularityDelta)).toBeLessThanOrEqual(2);
    expect(s.player.popularity).toBeGreaterThanOrEqual(pop - 2);
  });

  it('pesanan menunggu saat tutup hangus tanpa penalti tambahan', () => {
    const s = selling('ojol');
    addOrder(s);
    finishOnlineDay(s, CATALOG);
    expect(s.online.today.expired).toBe(1);
    expect(s.online.rating).toBe(60);
  });

  it('online tidak selalu lebih untung: kurir dengan sedikit pesanan rugi dibanding jual di tempat', () => {
    const s = selling('kurir');
    for (let i = 0; i < 2; i++) acceptOrder(s, addOrder(s).id, false);
    run(s, 60);
    closeOnlineDay(s);
    const t = s.online.today;
    // 2 pesanan = 30.000 nilai menu; dijual di tempat dapat 30.000 penuh.
    expect(onlineNet(t)).toBeLessThan(30000);
    // Ojol: 20% komisi selalu lebih kecil dari harga di tempat.
    const o = selling('ojol');
    acceptOrder(o, addOrder(o).id, false);
    run(o, 60);
    expect(onlineNet(o.online.today)).toBeLessThan(15000);
  });
});

describe('save v10', () => {
  it('save lama tanpa data pesanan online tetap bisa dimuat', () => {
    const old = createInitialState() as unknown as Record<string, unknown>;
    delete old.online;
    const s = migrateSave({ version: 9, savedAt: '', state: old });
    expect(s.online.mode).toBeNull();
    expect(s.online.rating).toBe(60);
    expect(s.online.flags.barHint).toBe(false);
  });
});
