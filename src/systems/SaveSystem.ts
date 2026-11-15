import { createEmptyBank, createEmptyLedger, createInitialState, validateState, type GameState } from '../core/GameState';
import { CATALOG, type Catalog } from '../data/catalog';

/**
 * Penyimpanan progres berversi di LocalStorage.
 * Setiap perubahan struktur data menaikkan SAVE_VERSION dan menambah satu fungsi migrasi,
 * sehingga save lama tetap bisa dimuat setelah game diperbarui.
 */

export const SAVE_VERSION = 8;
export const SAVE_KEY = 'juragan-angkringan:save';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveFile {
  version: number;
  savedAt: string;
  state: GameState;
}

export interface SaveSummary {
  day: number;
  money: number;
  savedAt: string;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] mengubah data versi n menjadi versi n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 (Stage 1): hanya pemain, kalender, cuaca, fase → tambahkan inventaris, resep, buku harian, statistik, pengaturan.
  1: (s) => {
    const base = createInitialState();
    const calendar = (s.calendar ?? base.calendar) as GameState['calendar'];
    return {
      ...base,
      ...s,
      inventory: base.inventory,
      unlockedRecipes: base.unlockedRecipes,
      ledger: createEmptyLedger(calendar.day),
      stats: base.stats,
      settings: base.settings,
    };
  },
  // v2 (Stage 2) → v3 (Stage 3): buku harian & statistik penjualan.
  2: (s) => {
    const ledger = (s.ledger ?? {}) as Partial<GameState['ledger']>;
    const stats = (s.stats ?? {}) as Partial<GameState['stats']>;
    const calendar = (s.calendar ?? { day: 1 }) as GameState['calendar'];
    return {
      ...s,
      // Fase "berjualan" lama tidak bisa dilanjutkan tanpa simulasi; kembali ke persiapan.
      phase: s.phase === 'berjualan' ? 'persiapan' : s.phase,
      ledger: { ...createEmptyLedger(calendar.day), ...ledger },
      stats: { totalPurchases: 0, totalPortionsPrepared: 0, totalRevenue: 0, totalCustomers: 0, totalPortionsSold: 0, ...stats },
    };
  },
  // v3 (Stage 3) → v4 (Stage 4): loyalitas, iklan & biaya di buku harian, laporan & riwayat.
  3: (s) => {
    const player = (s.player ?? {}) as Partial<GameState['player']>;
    const ledger = (s.ledger ?? {}) as Partial<GameState['ledger']>;
    const calendar = (s.calendar ?? { day: 1 }) as GameState['calendar'];
    return {
      ...s,
      // Laporan Stage 3 tidak lengkap: hari yang sudah tutup kembali ke persiapan hari berikutnya saat lanjut.
      player: { loyalty: 0, ...player },
      ledger: { ...createEmptyLedger(calendar.day), ...ledger },
      lastReport: null,
      history: [],
    };
  },
  // v4 (Stage 4) → v5 (Stage 5): upgrade, harga jual, status utang/bangkrut.
  4: (s) => {
    const ledger = (s.ledger ?? {}) as Partial<GameState['ledger']>;
    const report = s.lastReport as Partial<GameState['lastReport']> | null;
    return {
      ...s,
      upgrades: [],
      prices: {},
      debtDays: 0,
      bankrupt: false,
      ledger: { ...ledger, upgradeCost: 0 },
      lastReport: report ? { upgradeCost: 0, weather: s.weather ?? 'cerah', debtDays: 0, ...report } : null,
    };
  },
  // v5 (Stage 5) → v6 (Stage 6): tutorial. Pemain lama dianggap sudah paham → tutorial selesai.
  5: (s) => ({ ...s, tutorial: 99 }),
  // v7 → v8: pindah lokasi saat persiapan.
  7: (s) => {
    const ledger = (s.ledger ?? {}) as Record<string, unknown>;
    const report = s.lastReport as Record<string, unknown> | null;
    return {
      ...s,
      lastMoveDay: 0,
      ledger: { moveCost: 0, ...ledger },
      lastReport: report ? { moveCost: 0, mapId: s.mapId ?? 'main-street', ...report } : null,
    };
  },
  // v6 → v7: lokasi, event harian, bank, pencapaian.
  6: (s) => {
    const ledger = (s.ledger ?? {}) as Record<string, unknown>;
    const stats = (s.stats ?? {}) as Record<string, unknown>;
    const report = s.lastReport as Record<string, unknown> | null;
    return {
      ...s,
      mapId: 'main-street',
      event: null,
      bank: createEmptyBank(),
      achievements: {},
      ledger: { ...ledger, bankIncome: 0, loanCost: 0 },
      stats: { bulkDelivered: 0, perfectDays: 0, ...stats },
      lastReport: report
        ? { bankIncome: 0, loanCost: 0, bankMatured: 0, loanAutoPaid: 0, depositsUsed: 0, reviewDelta: 0, event: null, ...report }
        : null,
    };
  },
};

export function migrateSave(raw: unknown): GameState {
  if (typeof raw !== 'object' || raw === null) throw new SaveError('Data simpanan rusak.');
  const file = raw as Partial<SaveFile>;
  let version = file.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new SaveError('Versi data simpanan tidak dikenal.');
  if (version > SAVE_VERSION) throw new SaveError('Data simpanan berasal dari versi game yang lebih baru.');
  let state = file.state as unknown as Record<string, unknown>;
  if (typeof state !== 'object' || state === null) throw new SaveError('Data simpanan tidak berisi state permainan.');
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new SaveError(`Tidak ada migrasi dari versi ${version}.`);
    state = migrate(state);
    version++;
  }
  return state as unknown as GameState;
}

export class SaveSystem {
  constructor(
    private readonly storage: StorageLike,
    private readonly catalog: Catalog = CATALOG,
  ) {}

  serialize(state: Readonly<GameState>, now = new Date()): string {
    const file: SaveFile = { version: SAVE_VERSION, savedAt: now.toISOString(), state: structuredClone(state) as GameState };
    return JSON.stringify(file);
  }

  /** Simpan state. Mengembalikan false jika penyimpanan browser menolak (penuh / diblokir). */
  save(state: Readonly<GameState>): boolean {
    try {
      this.storage.setItem(SAVE_KEY, this.serialize(state));
      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean {
    try {
      return this.storage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  /** Muat & migrasi save. Null jika belum ada; SaveError jika rusak. */
  load(): GameState | null {
    let text: string | null;
    try {
      text = this.storage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (text === null) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SaveError('Data simpanan rusak (bukan JSON yang valid).');
    }
    const state = migrateSave(raw);
    try {
      validateState(state, this.catalog);
    } catch (error) {
      throw new SaveError(`Data simpanan tidak valid: ${(error as Error).message}`);
    }
    return state;
  }

  summary(): SaveSummary | null {
    try {
      const text = this.storage.getItem(SAVE_KEY);
      if (!text) return null;
      const file = JSON.parse(text) as Partial<SaveFile>;
      const state = file.state;
      if (!state?.calendar || !state.player) return null;
      return { day: state.calendar.day, money: state.player.money, savedAt: file.savedAt ?? '' };
    } catch {
      return null;
    }
  }

  /** Simpan salinan data rusak lalu hapus, agar pemain bisa mulai lagi tanpa kehilangan bukti. */
  quarantine(): void {
    try {
      const text = this.storage.getItem(SAVE_KEY);
      if (text !== null) this.storage.setItem(`${SAVE_KEY}:rusak`, text);
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* abaikan */
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* abaikan */
    }
  }
}

/** Penyimpanan di memori (cadangan jika LocalStorage tidak tersedia, juga untuk test). */
export class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** LocalStorage jika bisa dipakai; jika tidak (mode privat / iframe terbatas), memori sementara. */
export function detectStorage(): { storage: StorageLike; persistent: boolean } {
  try {
    const ls = globalThis.localStorage;
    const probe = `${SAVE_KEY}:probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { storage: ls, persistent: true };
  } catch {
    return { storage: new MemoryStorage(), persistent: false };
  }
}
