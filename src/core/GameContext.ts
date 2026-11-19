import { hasNewAchievement, unlockAchievements, type AchievementDef } from '../systems/AchievementSystem';
import { formatRupiah } from '../utils/formatting';
import { CATALOG, type Catalog } from '../data/catalog';
import { GameActions } from '../systems/GameActions';
import { syncBranchNames } from '../systems/BranchSystem';
import { detectStorage, SaveError, SaveSystem, type StorageLike } from '../systems/SaveSystem';
import { EventBus } from './EventBus';
import type { GameEvents } from './GameEvents';
import { GameStore } from './GameStore';
import { tr } from '../i18n/i18n';

const AUTOSAVE_DELAY_MS = 1500;
/** Perubahan dengan alasan ini tidak memicu autosave. */
const NO_AUTOSAVE_REASONS = new Set(['load', 'title-screen']);

/**
 * Wadah layanan inti yang dibagikan ke semua scene & UI:
 * event bus, store, katalog data, aksi pemain, dan sistem save (dengan autosave).
 */
export class GameContext {
  readonly bus = new EventBus<GameEvents>();
  readonly store = new GameStore(this.bus);
  readonly catalog: Catalog;
  readonly actions: GameActions;
  readonly saves: SaveSystem;
  /** False jika browser tidak mengizinkan LocalStorage (progres hanya bertahan selama tab terbuka). */
  readonly persistentStorage: boolean;
  /** Autosave hanya aktif selama sesi permainan berlangsung (bukan di menu utama). */
  private autosaveEnabled = false;
  /** Akun & simpan di awan (diisi di main.ts; null jika Firebase belum diatur). */
  cloud: import('../cloud/CloudSync').CloudSync | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private warnedSaveFailure = false;

  constructor(options: { storage?: StorageLike; catalog?: Catalog } = {}) {
    this.catalog = options.catalog ?? CATALOG;
    const detected = options.storage ? { storage: options.storage, persistent: true } : detectStorage();
    this.saves = new SaveSystem(detected.storage, this.catalog);
    this.persistentStorage = detected.persistent;
    this.actions = new GameActions(
      this.store,
      this.catalog,
      (recipes) => {
        for (const r of recipes) this.notify(tr('Menu baru terbuka: {name}!', { name: r.name }), 'success', 4500);
      },
      (notice) => this.bus.emit('story:notice', notice),
    );
    this.bus.on('state:changed', ({ reason, state }) => {
      if (this.autosaveEnabled && !NO_AUTOSAVE_REASONS.has(reason)) this.scheduleSave();
      // Pencapaian diperiksa setelah setiap perubahan (hanya saat sesi bermain).
      if (this.autosaveEnabled && reason !== 'pencapaian' && !state.bankrupt && hasNewAchievement(state)) {
        queueMicrotask(() => {
          let got: AchievementDef[] = [];
          this.store.update('pencapaian', (d) => {
            got = unlockAchievements(d);
          });
          for (const a of got) {
            this.notify(tr('{icon} Pencapaian: {name}! Hadiah {reward}', { icon: a.icon, name: a.name, reward: formatRupiah(a.reward) }), 'success', 5000);
            this.bus.emit('achievement:unlocked', { id: a.id });
          }
        });
      }
    });
  }

  notify(message: string, kind: GameEvents['notify']['kind'] = 'info', durationMs?: number): void {
    this.bus.emit('notify', durationMs === undefined ? { message, kind } : { message, kind, durationMs });
  }

  /** Mulai permainan baru (menimpa save lama). */
  startNewGame(locationId = 'main-street'): void {
    this.store.reset();
    if (locationId !== 'main-street') {
      this.store.update('lokasi', (d) => {
        d.mapId = locationId;
      });
    }
    this.autosaveEnabled = true;
    this.saveNow();
  }

  /** Lanjutkan dari save. Mengembalikan pesan error jika data rusak. */
  continueGame(): { ok: true } | { ok: false; message: string } {
    try {
      const state = this.saves.load();
      if (!state) return { ok: false, message: tr('Belum ada data simpanan.') };
      syncBranchNames(state);
      this.store.replace(state, 'load');
      this.actions.syncUnlocks();
      this.autosaveEnabled = true;
      return { ok: true };
    } catch (error) {
      if (error instanceof SaveError) return { ok: false, message: error.message };
      throw error;
    }
  }

  /** Permainan sedang berjalan (bukan di menu utama). */
  get autosaveRunning(): boolean {
    return this.autosaveEnabled;
  }

  /** Keluar ke menu utama: simpan dulu, lalu matikan autosave. */
  leaveToTitle(): void {
    if (this.autosaveEnabled) this.saveNow();
    this.autosaveEnabled = false;
  }

  /** Simpan segera jika permainan sedang berlangsung (dipanggil saat tab ditutup). */
  flushSave(): void {
    if (this.autosaveEnabled) this.saveNow();
  }

  saveNow(): boolean {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const ok = this.saves.save(this.store.get());
    if (!ok && !this.warnedSaveFailure) {
      this.warnedSaveFailure = true;
      this.notify(tr('Progres gagal disimpan: penyimpanan browser penuh atau diblokir.'), 'error', 6000);
    }
    if (ok) this.bus.emit('save:completed', { savedAt: new Date().toISOString() });
    return ok;
  }

  /** Throttle: perubahan beruntun (mis. jam berjalan) tetap tersimpan paling lambat AUTOSAVE_DELAY_MS kemudian. */
  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), AUTOSAVE_DELAY_MS);
  }
}

export const CONTEXT_REGISTRY_KEY = 'gameContext';
