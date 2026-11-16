import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '../src/core/GameState';
import { CATALOG } from '../src/data/catalog';
import { CHAPTERS, NAMED_CUSTOMERS, NEWS } from '../src/data/story';
import { isUnlockMet, refreshUnlocks } from '../src/systems/RecipeSystem';
import { migrateSave, SAVE_VERSION } from '../src/systems/SaveSystem';
import {
  applyChoice,
  applyNamedService,
  applyNamedWalkAway,
  applyTalk,
  choiceBlocker,
  currentAct,
  decisionAvailable,
  endingFor,
  isChapterOpen,
  isHeard,
  namedArrived,
  pendingNews,
  planVisits,
  readNews,
  receiveNews,
  refreshStory,
  relationOf,
  storyDay,
  talkContent,
  unreadImportant,
} from '../src/systems/StorySystem';

/** Majukan hari seperti startNextDay (tanpa ekonomi). */
function nextDay(s: GameState): void {
  s.calendar.day++;
  s.phase = 'persiapan';
  refreshStory(s);
}

/** Pemain rajin: semua pelanggan bernama dilayani dengan baik & diajak ngobrol. */
function attentiveDay(s: GameState): void {
  for (const v of planVisits(s)) {
    namedArrived(s, v);
    applyNamedService(s, v.who, 85, [NAMED_CUSTOMERS.find((c) => c.id === v.who)!.favorites[0]!]);
    applyTalk(s, v.who, talkContent(s, v.who).newsId);
  }
  refreshStory(s);
}

/** Pemain cuek: pelanggan bernama mampir (kabar masuk log) tapi tidak pernah diajak ngobrol. */
function neglectfulDay(s: GameState): void {
  for (const v of planVisits(s)) namedArrived(s, v);
  refreshStory(s);
}

describe('data cerita', () => {
  it('kabar, pelanggan bernama, dan bab valid', () => {
    expect(NAMED_CUSTOMERS.map((c) => c.id)).toEqual(['gito', 'surti', 'bayu', 'hendra']);
    expect(NEWS.filter((n) => n.important).map((n) => n.id)).toEqual(['hendra_ukur', 'hendra_tawaran', 'gusur_14', 'sambal_robek', 'keputusan']);
    expect(CHAPTERS).toHaveLength(7);
    for (const c of NAMED_CUSTOMERS) for (const f of c.favorites) expect(CATALOG.hasRecipe(f), f).toBe(true);
    for (const c of CHAPTERS) if (c.recipeId) expect(CATALOG.hasRecipe(c.recipeId), c.recipeId).toBe(true);
  });

  it('permainan baru: hari cerita 1, bab 1 terbuka, Sego Sambal Sri terkunci', () => {
    const s = createInitialState();
    expect(storyDay(s)).toBe(1);
    expect(isChapterOpen(s, 1)).toBe(true);
    expect(s.unlockedRecipes).not.toContain('sego_sambal_sri');
    expect(isUnlockMet(CATALOG.recipe('sego_sambal_sri').unlock, s)).toBe(false);
  });
});

describe('status kabar', () => {
  it('belum_dibaca → dibaca; kabar penting menahan kabar berikutnya', () => {
    const s = createInitialState();
    s.calendar.day = 12;
    receiveNews(s, 'gerobak_kosong');
    readNews(s, 'gerobak_kosong');
    receiveNews(s, 'hendra_ukur');
    expect(unreadImportant(s).map((n) => n.id)).toEqual(['hendra_ukur']);
    // pasar_malam (hari 12) bergantung pada hendra_ukur yang belum dibaca
    expect(pendingNews(s).some((n) => n.id === 'pasar_malam')).toBe(false);
    readNews(s, 'hendra_ukur');
    expect(s.story.news.hendra_ukur?.status).toBe('dibaca');
    expect(pendingNews(s).some((n) => n.id === 'pasar_malam')).toBe(true);
    expect(currentAct(s)).toBe(2);
  });

  it('pengaman 5 hari: kabar tidak dibaca menjadi ringkasan dan dianggap sudah didengar', () => {
    const s = createInitialState();
    s.calendar.day = 10;
    receiveNews(s, 'hendra_ukur');
    for (let i = 0; i < 4; i++) nextDay(s);
    expect(s.story.news.hendra_ukur?.status).toBe('belum_dibaca');
    nextDay(s);
    expect(s.story.news.hendra_ukur?.status).toBe('diringkas');
    expect(isHeard(s, 'hendra_ukur')).toBe(true);
    expect(unreadImportant(s)).toHaveLength(0);
  });

  it('kabar yang butuh kedekatan menunggu tahap hubungan', () => {
    const s = createInitialState();
    s.calendar.day = 40;
    for (const id of ['gerobak_kosong', 'hendra_ukur', 'hendra_tawaran', 'gusur_14']) {
      receiveNews(s, id);
      readNews(s, id);
    }
    expect(pendingNews(s).some((n) => n.id === 'surti_sri')).toBe(false);
    s.story.relations.surti = { points: 8, stage: 2, talks: 3, lastTalkDay: 0, lastVisitDay: 0 };
    expect(pendingNews(s).some((n) => n.id === 'surti_sri')).toBe(true);
  });
});

describe('kunjungan & hubungan', () => {
  it('pembicara kabar pasti mampir; maksimal satu obrolan per hari', () => {
    const s = createInitialState();
    const visits = planVisits(s);
    expect(visits.find((v) => v.who === 'surti')?.newsId).toBe('gerobak_kosong');
    expect(visits.every((v) => v.minute >= 1020 && v.minute <= 1440)).toBe(true);
    expect(visits.some((v) => v.who === 'hendra')).toBe(false);
    expect(planVisits(s)).toEqual(visits); // deterministik
    namedArrived(s, visits.find((v) => v.who === 'surti')!);
    expect(s.story.news.gerobak_kosong?.status).toBe('belum_dibaca');
    const talk = talkContent(s, 'surti');
    expect(talk.newsId).toBe('gerobak_kosong');
    applyTalk(s, 'surti', talk.newsId);
    expect(s.story.news.gerobak_kosong?.status).toBe('dibaca');
    expect(relationOf(s, 'surti').points).toBe(1);
    applyTalk(s, 'surti', null);
    expect(relationOf(s, 'surti').points).toBe(1);
    expect(talkContent(s, 'surti').newsId).toBeNull();
  });

  it('pelayanan: puas +1, menu favorit +1, pergi −1; tahap tidak turun', () => {
    const s = createInitialState();
    expect(applyNamedService(s, 'gito', 90, ['kopi_panas'])).toBeNull();
    applyNamedService(s, 'gito', 90, ['kopi_panas']);
    expect(relationOf(s, 'gito').points).toBe(4);
    expect(relationOf(s, 'gito').stage).toBe(1);
    applyNamedWalkAway(s, 'gito');
    applyNamedWalkAway(s, 'gito');
    expect(relationOf(s, 'gito').points).toBe(2);
    expect(relationOf(s, 'gito').stage).toBe(1);
  });
});

describe('alur cerita penuh', () => {
  it('pemain rajin: semua bab terbuka, keputusan di hari ±43, akhir lengkap bisa dicapai', () => {
    const s = createInitialState();
    s.player.popularity = 60;
    s.player.money = 2_000_000;
    let decisionDay = 0;
    for (let d = 1; d <= 46; d++) {
      if (d === 20) s.story.flags.pasar = true;
      attentiveDay(s);
      if (!decisionDay && decisionAvailable(s)) decisionDay = storyDay(s);
      if (d < 46) nextDay(s);
    }
    expect(decisionDay).toBeGreaterThanOrEqual(43);
    expect(decisionDay).toBeLessThanOrEqual(46);
    for (let n = 1; n <= 6; n++) expect(isChapterOpen(s, n), `bab ${n}`).toBe(true);
    expect(refreshUnlocks(s, CATALOG).map((r) => r.id)).toContain('sego_sambal_sri');
    expect(relationOf(s, 'surti').stage).toBe(3);
    expect(relationOf(s, 'bayu').stage).toBe(3);
    for (const c of ['bertahan', 'gotong', 'warisan', 'jual'] as const) expect(choiceBlocker(s, c), c).toBeNull();
    applyChoice(s, 'gotong');
    expect(endingFor(s)).toBe('lengkap');
    expect(currentAct(s)).toBe(4);
    nextDay(s);
    nextDay(s);
    expect(s.story.ending).toBeNull();
    nextDay(s);
    expect(s.story.ending).toBe('lengkap');
    expect(isChapterOpen(s, 7)).toBe(true);
    expect(pendingNews(s)).toHaveLength(0);
  });

  it('pemain cuek tidak pernah terkunci: keputusan tetap datang (lewat ringkasan)', () => {
    const s = createInitialState();
    let decisionDay = 0;
    for (let d = 1; d <= 90 && !decisionDay; d++) {
      neglectfulDay(s);
      if (decisionAvailable(s)) decisionDay = storyDay(s);
      nextDay(s);
    }
    expect(decisionDay).toBeGreaterThan(43);
    expect(decisionDay).toBeLessThan(75);
    expect(isChapterOpen(s, 4)).toBe(true); // pengaman Pinggir Pasar
    expect(choiceBlocker(s, 'jual')).toBeNull();
    expect(choiceBlocker(s, 'warisan')).not.toBeNull();
  });

  it('efek pilihan: jual menambah kas & mereset hubungan; bertahan butuh kas', () => {
    const base = (): GameState => {
      const s = createInitialState();
      s.calendar.day = 43;
      receiveNews(s, 'keputusan');
      readNews(s, 'keputusan');
      s.story.relations.surti = { points: 15, stage: 3, talks: 9, lastTalkDay: 0, lastVisitDay: 0 };
      return s;
    };
    const sold = base();
    applyChoice(sold, 'jual');
    expect(sold.player.money).toBe(3_500_000);
    expect(relationOf(sold, 'surti').stage).toBe(0);
    expect(endingFor(sold)).toBe('kota');
    expect(() => applyChoice(sold, 'jual')).toThrow();
    const poor = base();
    expect(() => applyChoice(poor, 'bertahan')).toThrow(/Kas belum cukup/);
    const sell = base();
    sell.phase = 'berjualan';
    expect(() => applyChoice(sell, 'jual')).toThrow(/persiapan/);
  });
});

describe('save v9', () => {
  it('save lama memulai cerita dari hari saat ini', () => {
    const old = createInitialState() as unknown as Record<string, unknown>;
    delete old.story;
    (old.calendar as { day: number }).day = 25;
    const s = migrateSave({ version: 8, savedAt: '', state: old });
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(9);
    expect(s.story.startDay).toBe(25);
    expect(storyDay(s)).toBe(1);
    expect(pendingNews(s).map((n) => n.id)).toEqual(['gerobak_kosong']);
  });
});

describe('kunjungan di simulasi berjualan', () => {
  it('pelanggan bernama datang sesuai jadwal, kabar masuk log, hubungan ikut dihitung', async () => {
    const { GameContext } = await import('../src/core/GameContext');
    const { MemoryStorage } = await import('../src/systems/SaveSystem');
    const { SalesSimulation } = await import('../src/systems/SalesSimulation');
    const { CUSTOMER_TYPES } = await import('../src/data/customers');
    const { addStock } = await import('../src/systems/InventorySystem');
    const { parseMapData } = await import('../src/world/MapData');
    const mainStreet = (await import('../src/data/maps/main-street.json')).default;
    const ctx = new GameContext({ storage: new MemoryStorage() });
    ctx.startNewGame();
    ctx.store.update('uji', (d) => {
      for (const id of ['teh_hangat', 'tahu_goreng', 'kopi_panas', 'tempe_goreng', 'nasi_goreng', 'es_teh']) addStock(d.inventory.products, id, 30, 1, 1500);
    });
    expect(ctx.actions.startSelling().ok).toBe(true);
    const visits = planVisits(ctx.store.get());
    const map = parseMapData(mainStreet);
    const sim = new SalesSimulation(map.customers!, CATALOG, CUSTOMER_TYPES, {
      getState: () => ctx.store.get(),
      order: (p, w, rng) => ctx.actions.serveCustomer(p, w, rng),
      walkAway: (p) => ctx.actions.customerWalkedAway(p),
      setClock: (m) => ctx.actions.setClock(m),
    }, { seed: 'cerita', startMinutes: 17 * 60, namedVisits: visits });
    const arrived: string[] = [];
    let guard = 0;
    while (!sim.isEnded && guard++ < 20_000) {
      for (const e of sim.advance(0.25)) {
        if (e.type === 'named-arrive') {
          arrived.push(e.visit.who);
          expect(e.group.plan.namedId).toBe(e.visit.who);
          expect(e.group.plan.partySize).toBe(1);
          ctx.actions.storyArrive(e.visit);
        }
      }
    }
    expect(arrived.sort()).toEqual(visits.map((v) => v.who).sort());
    const s = ctx.store.get();
    expect(s.story.news.gerobak_kosong?.status).toBe('belum_dibaca');
    expect(relationOf(s, 'surti').lastVisitDay).toBe(1);
    // Dilayani dengan stok cukup: kedekatan bertambah.
    expect(relationOf(s, 'surti').points + relationOf(s, 'gito').points).toBeGreaterThan(0);
  });
});
