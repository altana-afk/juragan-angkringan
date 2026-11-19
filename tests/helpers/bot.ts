import { getMap } from '../../src/world/maps';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { GameContext } from '../../src/core/GameContext';
import { CATALOG } from '../../src/data/catalog';
import { CUSTOMER_TYPES } from '../../src/data/customers';
import { maxPortionsPerOrder } from '../../src/systems/CookingSystem';
import { arrivalChancePerMinute } from '../../src/systems/DemandSystem';
import { storageCapacity, storedUnits } from '../../src/systems/EconomySystem';
import { totalQty } from '../../src/systems/InventorySystem';
import { MemoryStorage } from '../../src/systems/SaveSystem';
import { SalesSimulation, modifiersOf } from '../../src/systems/SalesSimulation';
import { UPGRADES, upgradeBlockers } from '../../src/systems/UpgradeSystem';
import { activeAnchors } from '../../src/world/MapData';
import { TUTORIAL_DONE } from '../../src/systems/TutorialSystem';
import { CHALLENGE_CONFIG } from '../../src/data/challenges';
import { SeededRandom } from '../../src/utils/random';


export interface BotDay {
  day: number;
  money: number;
  popularity: number;
  customers: number;
  revenue: number;
  net: number;
  weather: string;
  upgrades: number;
}

export interface BotOptions {
  /** Pengali stok yang dimasak (1 = sesuai perkiraan). */
  stockFactor?: number;
  /** Beli upgrade saat kas cukup. */
  buyUpgrades?: boolean;
  /** Pengali harga jual semua menu. */
  priceFactor?: number;
  location?: string;
  /** Jalankan tantangan kampung (0.18.0) dengan cara terburuk: tidak pernah menjawab, selalu membayar. */
  challenges?: boolean;
}

/** Pemain bot sederhana: belanja & masak sesuai perkiraan, jualan, tutup, kadang upgrade. */
export function runBot(days: number, opts: BotOptions = {}): { ctx: GameContext; log: BotDay[] } {
  const location = opts.location ?? 'main-street';
  const { stockFactor = 1, buyUpgrades = true, priceFactor = 1 } = opts;
  const ctx = new GameContext({ storage: new MemoryStorage() });
  ctx.startNewGame(location);
  if (opts.challenges) ctx.store.update('uji-lewati-tutorial', (d) => {
    d.tutorial = TUTORIAL_DONE;
  });
  const log: BotDay[] = [];
  for (let d = 0; d < days; d++) {
    let s = ctx.store.get();
    if (s.bankrupt) break;
    if (buyUpgrades) {
      for (const u of UPGRADES) {
        s = ctx.store.get();
        if (upgradeBlockers(s, u).length === 0 && s.player.money > u.cost * 1.6 + 150_000) ctx.actions.buyUpgrade(u.id);
      }
    }
    s = ctx.store.get();
    if (priceFactor !== 1) for (const id of s.unlockedRecipes) ctx.actions.setPrice(id, CATALOG.recipe(id).salePrice * priceFactor);
    s = ctx.store.get();
    let groups = 0;
    const mods = modifiersOf(s);
    for (let m = GAME_CONFIG.dayCycle.openMinutes; m < GAME_CONFIG.dayCycle.closeMinutes; m++) groups += arrivalChancePerMinute(m, s.player.popularity, mods);
    const menu = s.unlockedRecipes.map((id) => CATALOG.recipe(id));
    const foods = menu.filter((r) => r.category !== 'minuman');
    const drinks = menu.filter((r) => r.category === 'minuman');
    const target = new Map<string, number>();
    const persons = groups * 2;
    for (const r of foods) target.set(r.id, Math.ceil((persons * 1.5 * stockFactor) / foods.length));
    for (const r of drinks) target.set(r.id, Math.ceil((persons * 0.8 * stockFactor) / drinks.length));
    // kebutuhan bahan
    const need = new Map<string, number>();
    for (const [id, n] of target) {
      const portions = Math.min(n - totalQty(s.inventory.products[id]), maxPortionsPerOrder(s));
      target.set(id, Math.max(0, portions));
      for (const [ing, per] of Object.entries(CATALOG.recipe(id).ingredients)) need.set(ing, (need.get(ing) ?? 0) + per * Math.max(0, portions));
    }
    const cart = [...need.entries()]
      .map(([ing, units]) => {
        const def = CATALOG.ingredient(ing);
        const missing = units - totalQty(s.inventory.ingredients[ing]);
        return { ingredientId: ing, packs: Math.max(0, Math.min(50, Math.ceil(missing / def.packSize))) };
      })
      .filter((l) => l.packs > 0);
    // muat gudang: kurangi kemasan jika penuh
    let room = storageCapacity(s) - storedUnits(s);
    const fitted = cart.map((l) => {
      const size = CATALOG.ingredient(l.ingredientId).packSize;
      const packs = Math.max(0, Math.min(l.packs, Math.floor(room / size)));
      room -= packs * size;
      return { ...l, packs };
    }).filter((l) => l.packs > 0);
    let buy = fitted;
    for (let k = 0; k < 30 && buy.length; k++) {
      const r = ctx.actions.buyIngredients(buy);
      if (r.ok) break;
      // Uang kurang: kurangi jumlah, lalu kurangi ragam menu (bahan untuk menu terakhir dulu).
      buy = buy.some((l) => l.packs > 1) ? buy.map((l) => ({ ...l, packs: Math.max(1, Math.floor(l.packs / 2)) })) : buy.slice(0, -1);
    }
    s = ctx.store.get();
    const orders = [...target.entries()].map(([recipeId, portions]) => ({ recipeId, portions: Math.min(portions, maxPortionsOf(ctx, recipeId)) })).filter((o) => o.portions > 0);
    for (const o of orders) ctx.actions.prepare([o]);
    ctx.actions.startSelling();
    const sim = new SalesSimulation(activeAnchors(getMap(location).customers!, ctx.store.get().upgrades), CATALOG, CUSTOMER_TYPES, {
      getState: () => ctx.store.get(),
      order: (p, w, rng) => ctx.actions.serveCustomer(p, w, rng),
      walkAway: (p) => ctx.actions.customerWalkedAway(p),
      setClock: (m) => ctx.actions.setClock(m),
    }, { seed: `bot-${d}`, startMinutes: GAME_CONFIG.dayCycle.openMinutes });
    let guard = 0;
    let lastMinute = GAME_CONFIG.dayCycle.openMinutes;
    while (!sim.isEnded && guard++ < 40_000) {
      sim.advance(0.5);
      if (!opts.challenges) continue;
      const now = Math.floor(ctx.store.get().calendar.clockMinutes);
      const plan = ctx.store.get().challenges.today;
      for (let m = lastMinute + 1; m <= now && plan; m++) {
        plan.cats.forEach((c, i) => c === m && ctx.actions.challengeCat(new SeededRandom(`bot-kucing-${d}-${i}`)));
        if (plan.odgj?.minute === m) {
          ctx.actions.challengeArrive('odgj');
          sim.scare(CHALLENGE_CONFIG.odgj.fleeChance);
        }
        if (plan.ormas?.minute === m) ctx.actions.challengeArrive('ormas');
        if (plan.ormas?.status === 'datang' && m >= plan.ormas.minute + CHALLENGE_CONFIG.ormas.patienceMinutes) ctx.actions.ormasPay();
        if (plan.odgj?.status === 'datang' && m >= CHALLENGE_CONFIG.odgj.untilMinute) ctx.actions.odgjLeaves();
      }
      lastMinute = Math.max(lastMinute, now);
    }
    const report = ctx.actions.finishSelling();
    s = ctx.store.get();
    log.push({
      day: s.calendar.day,
      money: s.player.money,
      popularity: Math.round(s.player.popularity),
      customers: report?.customers ?? 0,
      revenue: report?.revenue ?? 0,
      net: report?.netProfit ?? 0,
      weather: s.weather,
      upgrades: s.upgrades.length,
    });
    if (s.bankrupt) break;
    ctx.actions.startNextDay();
  }
  return { ctx, log };
}

function maxPortionsOf(ctx: GameContext, recipeId: string): number {
  const s = ctx.store.get();
  let max = Infinity;
  for (const [ing, per] of Object.entries(CATALOG.recipe(recipeId).ingredients)) max = Math.min(max, Math.floor(totalQty(s.inventory.ingredients[ing]) / per));
  return Number.isFinite(max) ? max : 0;
}
