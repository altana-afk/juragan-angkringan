import { GAME_CONFIG, isDebugMode } from '../config/gameConfig';
import type { GameContext } from '../core/GameContext';

/**
 * Google Analytics 4 (opsional). Aktif hanya jika:
 * - ID pengukuran diisi lewat VITE_GA_ID (file .env / variabel build), dan
 * - bukan mode ?debug / localhost, dan
 * - pemain tidak mematikannya di Pengaturan.
 * Tanpa cookie iklan, tanpa data pribadi: hanya event permainan & data perangkat bawaan GA4.
 */
const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined)?.trim() ?? '';
const OPT_KEY = 'juragan-angkringan:analytics';

type Params = Record<string, string | number | boolean | undefined>;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let started = false;

function localHost(): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

export function analyticsAvailable(): boolean {
  return GA_ID !== '' && !isDebugMode() && !localHost();
}

export function analyticsEnabled(): boolean {
  try {
    return localStorage.getItem(OPT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAnalyticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(OPT_KEY, on ? 'on' : 'off');
  } catch {
    /* penyimpanan tidak tersedia */
  }
  if (on) start();
  // GA4 menghormati flag ini tanpa perlu memuat ulang halaman.
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !on;
}

function start(): void {
  if (started || !analyticsAvailable() || !analyticsEnabled()) return;
  started = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    app_version: GAME_CONFIG.version,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.append(s);
}

/** Kirim event (diabaikan bila analytics tidak aktif). */
export function track(name: string, params: Params = {}): void {
  if (!started || !analyticsEnabled() || !window.gtag) return;
  window.gtag('event', name, { app_version: GAME_CONFIG.version, ...params });
}

/** Pasang analytics & pendengar event permainan. */
export function initAnalytics(ctx: GameContext): void {
  start();
  if (!analyticsAvailable()) return;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  track('game_open', { pwa: standalone });

  ctx.bus.on('state:changed', ({ state, prev, reason }) => {
    // Hari selesai: ringkasan hasil (angka dibulatkan, tanpa data pribadi).
    if (state.lastReport && state.lastReport !== prev.lastReport) {
      const r = state.lastReport;
      track('day_end', {
        day: r.day,
        revenue: Math.round(r.revenue),
        net_profit: Math.round(r.netProfit),
        customers: r.customers,
        satisfaction: Math.round(r.avgSatisfaction),
        popularity: Math.round(r.popularityAfter),
        location: r.mapId,
        weather: r.weather,
        branches: state.branches.list.length,
        online_mode: state.online.mode ?? 'none',
      });
    }
    if (state.phase === 'berjualan' && prev.phase !== 'berjualan') track('sales_start', { day: state.calendar.day });
    if (state.upgrades.length > prev.upgrades.length) track('upgrade_buy', { upgrade: state.upgrades[state.upgrades.length - 1], day: state.calendar.day });
    if (state.branches.list.length > prev.branches.list.length) track('branch_open', { slot: state.branches.list.length, day: state.calendar.day });
    if (state.mapId !== prev.mapId && reason !== 'muat') track('location_move', { location: state.mapId, day: state.calendar.day });
    if (state.bankrupt && !prev.bankrupt) track('bankrupt', { day: state.calendar.day });
  });
  ctx.bus.on('achievement:unlocked', ({ id }) => track('achievement_unlock', { achievement: id }));
  ctx.bus.on('ui:open-panel', ({ panel }) => track('panel_open', { panel }));
}
