import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { ALLIES, CHALLENGE_CONFIG, allyOfKind } from '../src/data/challenges';
import { namedById } from '../src/data/story';
import { addStock, totalQty } from '../src/systems/InventorySystem';
import {
  allyHandles,
  allyReady,
  allyTalk,
  arrivalFactor,
  catArrives,
  fameTier,
  markArrived,
  odgjCalmFailed,
  odgjCalmed,
  odgjNeighbors,
  ormasAmount,
  ormasCollect,
  ormasDuel,
  ormasLateRate,
  ormasPay,
  planAllyVisits,
  planChallengeDay,
  startChallengeDay,
} from '../src/systems/ChallengeEventSystem';
import {
  autoSupporters,
  contactOnlineChance,
  favoriteRound,
  gatherAfter,
  gatherSetup,
  gradeTap,
  meterAfter,
  nextStatus,
  rhythmSetup,
} from '../src/systems/MinigameSystem';
import { closeDay } from '../src/systems/DayCloseSystem';
import { applyNamedService } from '../src/systems/StorySystem';
import { migrateSave, SAVE_VERSION } from '../src/systems/SaveSystem';
import { TUTORIAL_DONE } from '../src/systems/TutorialSystem';
import { SeededRandom } from '../src/utils/random';

const OPEN = 17 * 60;

function selling(day = 10, popularity = 50, revenueYesterday = 200_000): GameState {
  const s = createInitialState();
  s.tutorial = TUTORIAL_DONE;
  s.calendar.day = day;
  s.player.popularity = popularity;
  s.history.push({ day: day - 1, revenue: revenueYesterday, netProfit: 50_000, customers: 20, avgSatisfaction: 70, popularity, money: 500_000 });
  for (const id of s.unlockedRecipes) addStock(s.inventory.products, id, 5, day + 1, 1500);
  s.phase = 'berjualan';
  s.calendar.clockMinutes = OPEN + 60;
  s.challenges.today = { day, cats: [OPEN + 30], odgj: { minute: OPEN + 40, status: 'menunggu' }, ormas: { minute: OPEN + 90, amount: 24_000, status: 'menunggu' }, log: [] };
  return s;
}

const totalProducts = (s: GameState): number => Object.values(s.inventory.products).reduce((n, b) => n + totalQty(b), 0);

describe('tingkat ketenaran', () => {
  it('rendah < 35, sedang < 65, tinggi sisanya', () => {
    expect(fameTier(10)).toBe('rendah');
    expect(fameTier(34.9)).toBe('rendah');
    expect(fameTier(35)).toBe('sedang');
    expect(fameTier(64)).toBe('sedang');
    expect(fameTier(65)).toBe('tinggi');
  });
});

describe('rencana tantangan harian', () => {
  it('tidak ada tantangan di hari-hari awal atau selama tutorial', () => {
    const s = selling(CHALLENGE_CONFIG.graceDays);
    const plan = planChallengeDay(s);
    expect(plan.cats).toEqual([]);
    expect(plan.odgj).toBeNull();
    expect(plan.ormas).toBeNull();
    const t = selling(10);
    t.tutorial = 3;
    expect(planChallengeDay(t).odgj).toBeNull();
  });

  it('ormas paling sering sekali dalam 3 hari, ODGJ paling sering sekali sehari', () => {
    let ormas = 0;
    let odgj = 0;
    for (let day = 10; day < 400; day++) {
      const s = selling(day, 90);
      s.challenges.lastOrmasDay = day - 1;
      if (planChallengeDay(s).ormas) ormas++;
      const t = selling(day, 90);
      t.challenges.lastOdgjDay = day;
      if (planChallengeDay(t).odgj) odgj++;
    }
    expect(ormas).toBe(0);
    expect(odgj).toBe(0);
  });

  it('makin terkenal makin sering (rata-rata 400 hari)', () => {
    const count = (pop: number): number => {
      let n = 0;
      for (let day = 10; day < 410; day++) {
        const p = planChallengeDay(selling(day, pop));
        n += p.cats.length + (p.odgj ? 1 : 0) + (p.ormas ? 1 : 0);
      }
      return n;
    };
    expect(count(90)).toBeGreaterThan(count(20));
  });

  it('jam tantangan di dalam jam buka; ODGJ datang sebelum 22.00', () => {
    for (let day = 10; day < 200; day++) {
      const p = planChallengeDay(selling(day, 90));
      for (const m of p.cats) expect(m).toBeGreaterThan(OPEN);
      if (p.odgj) expect(p.odgj.minute).toBeLessThan(CHALLENGE_CONFIG.odgj.untilMinute);
    }
  });

  it('rencana tetap sama walau dihitung ulang (memuat ulang game)', () => {
    const s = selling(25, 70);
    s.challenges.today = null;
    const a = startChallengeDay(s);
    expect(startChallengeDay(s)).toBe(a);
    expect(planChallengeDay(s)).toEqual({ ...a, log: [] });
  });
});

describe('kucing bandit', () => {
  it('mengambil 1–2 porsi dari stok siap jual', () => {
    const s = selling(10, 90);
    const before = totalProducts(s);
    const res = catArrives(s, CATALOG, new SeededRandom('k'));
    const lost = Object.values(res.taken).reduce((n, q) => n + q, 0);
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(2);
    expect(totalProducts(s)).toBe(before - lost);
    expect(s.challenges.today?.log.at(-1)?.result).toBe('dicuri');
  });

  it('di ketenaran rendah hanya 1 porsi', () => {
    for (let i = 0; i < 20; i++) {
      const s = selling(10, 10);
      const res = catArrives(s, CATALOG, new SeededRandom(`k${i}`));
      expect(Object.values(res.taken).reduce((n, q) => n + q, 0)).toBe(1);
    }
  });

  it('kucing peliharaan mencegah pencurian', () => {
    const s = selling(10, 90);
    s.upgrades.push('kucing_peliharaan');
    const before = totalProducts(s);
    const res = catArrives(s, CATALOG, new SeededRandom('k'));
    expect(res.blocked).toBe(true);
    expect(totalProducts(s)).toBe(before);
    expect(s.challenges.stats.catsBlocked).toBe(1);
  });

  it('stok kosong: kucing pergi tanpa hasil', () => {
    const s = selling();
    s.inventory.products = {};
    const res = catArrives(s, CATALOG, new SeededRandom('k'));
    expect(res.taken).toEqual({});
    expect(s.challenges.today?.log.at(-1)?.result).toBe('kosong');
  });
});

describe('ODGJ', () => {
  it('saat datang, kedatangan pelanggan berkurang; setelah selesai kembali normal', () => {
    const s = selling();
    expect(arrivalFactor(s)).toBe(1);
    markArrived(s, 'odgj');
    expect(arrivalFactor(s)).toBe(CHALLENGE_CONFIG.odgj.arrivalFactor);
    expect(s.challenges.lastOdgjDay).toBe(s.calendar.day);
    odgjCalmed(s, ['teh_hangat']);
    expect(arrivalFactor(s)).toBe(1);
  });

  it('cara halus memakai stok yang diberikan', () => {
    const s = selling();
    markArrived(s, 'odgj');
    const before = totalQty(s.inventory.products.teh_hangat);
    const e = odgjCalmed(s, ['teh_hangat']);
    expect(totalQty(s.inventory.products.teh_hangat)).toBe(before - 1);
    expect(e.portions).toEqual({ teh_hangat: 1 });
  });

  it('cara halus gagal: ODGJ tetap di tempat, stok yang diberikan tetap berkurang', () => {
    const s = selling();
    markArrived(s, 'odgj');
    odgjCalmFailed(s, ['teh_hangat']);
    expect(s.challenges.today?.odgj?.status).toBe('datang');
  });

  it('bantuan warga gagal: popularitas turun 1, ODGJ tetap; berhasil: selesai', () => {
    const s = selling(10, 50);
    markArrived(s, 'odgj');
    odgjNeighbors(s, false);
    expect(s.player.popularity).toBe(49);
    expect(s.challenges.today?.odgj?.status).toBe('datang');
    odgjNeighbors(s, true);
    expect(s.challenges.today?.odgj?.status).toBe('selesai');
  });

  it('masih ada saat tutup: tercatat pergi sendiri', () => {
    const s = selling();
    markArrived(s, 'odgj');
    const report = closeDay(s, CATALOG);
    expect(report.challenges?.log.map((e) => e.result)).toContain('pergi');
  });
});

describe('ormas', () => {
  it('uang keamanan 10–15% dari hasil kemarin, minimal Rp2.000', () => {
    const s = selling(10, 50, 200_000);
    expect(ormasAmount(s, 0.1)).toBe(20_000);
    expect(ormasAmount(s, 0.15)).toBe(30_000);
    expect(ormasAmount(selling(10, 50, 5_000), 0.1)).toBe(2_000);
  });

  it('bayar memotong kas dan masuk laporan', () => {
    const s = selling();
    markArrived(s, 'ormas');
    const money = s.player.money;
    ormasPay(s);
    expect(s.player.money).toBe(money - 24_000);
    const report = closeDay(s, CATALOG);
    expect(report.challenges?.cost).toBe(24_000);
  });

  it('usir menang: gratis; kalah: bayar 20%', () => {
    const a = selling(10, 50, 200_000);
    markArrived(a, 'ormas');
    const m = a.player.money;
    ormasDuel(a, true);
    expect(a.player.money).toBe(m);
    const b = selling(10, 50, 200_000);
    markArrived(b, 'ormas');
    ormasDuel(b, false);
    expect(b.player.money).toBe(m - 40_000);
  });

  it('belum dijawab saat tutup: menagih sendiri 15–20%', () => {
    const s = selling(10, 50, 200_000);
    markArrived(s, 'ormas');
    const report = closeDay(s, CATALOG);
    const last = report.challenges?.log.at(-1);
    expect(last?.result).toBe('tagih');
    expect(last?.cost).toBeGreaterThanOrEqual(30_000);
    expect(last?.cost).toBeLessThanOrEqual(40_000);
  });

  it('menagih sendiri: 15–20% dari hasil kemarin, lebih mahal dari permintaan awal', () => {
    for (let day = 10; day < 60; day++) {
      const s = selling(day, 50, 200_000);
      markArrived(s, 'ormas');
      const r = ormasLateRate(s);
      expect(r).toBeGreaterThanOrEqual(0.15);
      expect(r).toBeLessThanOrEqual(0.2);
      expect(ormasCollect(s).cost).toBe(Math.round((200_000 * r) / 500) * 500);
    }
  });

  it('keuntungan bersih ikut dipotong uang keamanan', () => {
    const a = selling();
    const b = selling();
    markArrived(b, 'ormas');
    ormasPay(b);
    expect(closeDay(a, CATALOG).netProfit - closeDay(b, CATALOG).netProfit).toBe(24_000);
  });
});

describe('minigame', () => {
  it('Ikuti iramanya: not berurutan, makin terkenal makin cepat, cukup ketukan tepat memenuhi meter', () => {
    const low = rhythmSetup(new SeededRandom('r'), 'rendah');
    const high = rhythmSetup(new SeededRandom('r'), 'tinggi');
    expect(high.beat).toBeLessThan(low.beat);
    for (const s of [low, high]) {
      for (let i = 1; i < s.notes.length; i++) expect(s.notes[i]!.time).toBeGreaterThan(s.notes[i - 1]!.time);
      expect(s.duration).toBeLessThanOrEqual(20);
      let m = s.start;
      for (let i = 0; i < s.notes.length; i++) m = meterAfter(m, 'tepat', s);
      expect(m).toBe(100);
    }
    expect(gradeTap(0.05, low)).toBe('tepat');
    expect(gradeTap(-0.12, low)).toBe('cukup');
    expect(gradeTap(0.3, low)).toBe('meleset');
    expect(meterAfter(3, 'meleset', low)).toBe(0);
  });

  it('Telepon berantai: tokoh yang akrab lebih sering online', () => {
    expect(contactOnlineChance(3)).toBeGreaterThan(contactOnlineChance(0));
    const rng = new SeededRandom('p');
    const count = (stage: number): number => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (nextStatus(rng, { id: 'x', name: 'x', onlineChance: contactOnlineChance(stage) }) === 'online') n++;
      return n;
    };
    expect(count(3)).toBeGreaterThan(count(0) * 1.5);
  });

  it('Kumpulkan warga: tangan merah mengurangi, pendukung otomatis dari tahap 2+', () => {
    expect(gatherAfter(3, false)).toBe(4);
    expect(gatherAfter(3, true)).toBe(2);
    expect(gatherAfter(0, true)).toBe(0);
    expect(autoSupporters([0, 1, 2, 3])).toBe(2);
    expect(gatherSetup('rendah').fake).toBe(0);
    expect(gatherSetup('tinggi').need).toBeGreaterThan(gatherSetup('rendah').need);
  });

  it('Pesanan kesukaan: satu jawaban benar di antara tiga menu terbuka', () => {
    const ratna = allyOfKind('nakes');
    const unlocked = ['teh_hangat', 'nasi_kucing', 'es_teh', 'tempe_goreng', 'tahu_goreng'];
    for (let i = 0; i < 30; i++) {
      const r = favoriteRound(new SeededRandom(`f${i}`), ratna.favoriteHints, unlocked);
      expect(r).not.toBeNull();
      expect(r!.options).toHaveLength(3);
      expect(new Set(r!.options).size).toBe(3);
      expect(r!.options).toContain(r!.answer);
      expect(r!.answer in ratna.favoriteHints).toBe(true);
      for (const o of r!.options) expect(unlocked).toContain(o);
    }
    expect(favoriteRound(new SeededRandom('x'), ratna.favoriteHints, ['es_teh'])).toBeNull();
  });
});

describe('kenalan nakes & polisi', () => {
  it('data: satu nakes & satu polisi, lokasi asal ada, obrolan untuk hati 0–5', () => {
    expect(ALLIES.map((a) => a.kind).sort()).toEqual(['nakes', 'polisi']);
    for (const a of ALLIES) {
      expect(a.hearts).toHaveLength(6);
      expect(namedById(a.id).name).toBe(a.name);
    }
  });

  it('hanya mampir di lokasi asal sampai hati penuh, lalu di mana saja', () => {
    const nakes = allyOfKind('nakes');
    const seen = (mapId: string, heart: number): number => {
      let n = 0;
      for (let day = 1; day < 200; day++) {
        const s = selling(day);
        s.mapId = mapId;
        s.challenges.allies[nakes.id] = { heart, talks: 0, lastTalkDay: 0, lastVisitDay: 0 };
        if (planAllyVisits(s).some((v) => v.who === nakes.id)) n++;
      }
      return n;
    };
    expect(seen('main-street', 0)).toBe(0);
    expect(seen(nakes.homeLocation, 0)).toBeGreaterThan(100);
    expect(seen('main-street', 5)).toBeGreaterThan(40);
  });

  it('tebakan pesanan kesukaan benar: hati +2 (maks. 5)', () => {
    const s = selling();
    const id = allyOfKind('nakes').id;
    expect(allyTalk(s, id, true)).toBe(2);
    s.calendar.day++;
    expect(allyTalk(s, id, true)).toBe(4);
    s.calendar.day++;
    expect(allyTalk(s, id, true)).toBe(5);
  });

  it('mengobrol sekali sehari: hati +1 sampai 5', () => {
    const s = selling();
    const id = allyOfKind('polisi').id;
    expect(allyTalk(s, id)).toBe(1);
    expect(() => allyTalk(s, id)).toThrow();
    for (let i = 2; i <= 5; i++) {
      s.calendar.day++;
      expect(allyTalk(s, id)).toBe(i);
    }
    s.calendar.day++;
    expect(allyTalk(s, id)).toBeNull();
    expect(allyReady(s, 'polisi')).toBe(true);
  });

  it('kenalan tidak ikut hubungan cerita', () => {
    const s = selling();
    const id = allyOfKind('nakes').id;
    expect(applyNamedService(s, id, 90, ['teh_hangat'])).toBeNull();
    expect(s.story.relations[id]).toBeUndefined();
  });

  it('kenalan menangani ODGJ & ormas tanpa biaya', () => {
    const s = selling();
    markArrived(s, 'odgj');
    markArrived(s, 'ormas');
    const money = s.player.money;
    allyHandles(s, 'odgj');
    allyHandles(s, 'ormas');
    expect(s.player.money).toBe(money);
    expect(s.challenges.stats.arrests).toBe(2);
    expect(arrivalFactor(s)).toBe(1);
  });
});

describe('save', () => {
  it('save v12 mendapat data tantangan kosong', () => {
    const s = createInitialState() as unknown as Record<string, unknown>;
    delete s.challenges;
    const loaded = migrateSave({ version: 12, savedAt: new Date().toISOString(), state: s });
    expect(loaded.challenges.allies).toEqual({});
    expect(loaded.challenges.today).toBeNull();
    expect(SAVE_VERSION).toBe(13);
  });
});

describe('uji bot', () => {
  it('tantangan tidak membuat pemain bangkrut dalam permainan normal (40 hari, tidak pernah menjawab)', async () => {
    const { runBot } = await import('./helpers/bot');
    const { ctx, log } = runBot(40, { challenges: true });
    const s = ctx.store.get();
    expect(s.bankrupt).toBe(false);
    expect(log.length).toBe(40);
    const total = s.challenges.stats;
    // Tantangan memang terjadi, tapi kerugiannya kecil dibanding pendapatan.
    expect(total.catsStolen + total.ormasPaid).toBeGreaterThan(0);
    const revenue = log.reduce((n, d) => n + d.revenue, 0);
    expect(total.totalPaid).toBeLessThan(revenue * 0.08);
  }, 120_000);
});

describe('hati di panel obrolan', () => {
  it('5 hati dari poin hubungan, selaras dengan tahap', async () => {
    const { storyHearts, namedHearts, STAGE_POINTS } = await import('../src/systems/StorySystem');
    expect(storyHearts(0)).toBe(0);
    expect(storyHearts(STAGE_POINTS[1]!)).toBe(2);
    expect(storyHearts(STAGE_POINTS[2]!)).toBe(4);
    expect(storyHearts(STAGE_POINTS[3]!)).toBe(5);
    expect(storyHearts(999)).toBe(5);
    const s = selling();
    s.story.relations.gito = { points: 8, stage: 2, talks: 0, lastTalkDay: 0, lastVisitDay: 0 };
    s.challenges.allies.ratna = { heart: 3, talks: 3, lastTalkDay: 0, lastVisitDay: 0 };
    expect(namedHearts(s, 'gito')).toBe(4);
    expect(namedHearts(s, 'ratna')).toBe(3);
  });
});
