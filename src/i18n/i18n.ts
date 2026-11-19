/**
 * Bahasa permainan: Indonesia (bawaan) atau Inggris.
 *
 * Teks pemain ditulis dalam bahasa Indonesia dan dibungkus `tr('…')`. Teks Indonesia itu sekaligus
 * kunci kamus: di mode Inggris `tr` mencari terjemahannya di `en/strings.ts`. Data JSON (menu,
 * bahan, upgrade, cerita, dst.) diterjemahkan lewat berkas tumpangan di `en/data/` (lihat `localizeData`).
 *
 * Bahasa dibaca SEKALI saat modul dimuat, sebelum modul lain menyusun teksnya. Mengganti bahasa
 * menyimpan pilihan lalu memuat ulang halaman (lihat `changeLanguage`), jadi semua teks (termasuk
 * yang disusun saat modul dimuat) selalu satu bahasa.
 */
import { EN_STRINGS, type PluralEntry } from './en/strings';

export type Lang = 'id' | 'en';

/** Nama bahasa ditulis dalam bahasanya sendiri, supaya mudah dikenali dari bahasa mana pun. */
export const LANGUAGES: readonly { id: Lang; label: string }[] = [
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'en', label: 'English' },
];

export const LANG_STORAGE_KEY = 'juragan-angkringan:lang';
/** Sama dengan SAVE_KEY di SaveSystem (tidak di-import supaya modul ini tetap paling dasar). */
const SAVE_STORAGE_KEY = 'juragan-angkringan:save';

/**
 * `?lang=` di alamat → dipakai. Lalu pilihan tersimpan → dipakai. Belum ada pilihan: pemain lama (sudah punya save) tetap Indonesia;
 * pemain baru mengikuti bahasa browser (Indonesia jika browser berbahasa Indonesia, selain itu Inggris).
 * Di luar browser (test) selalu Indonesia.
 */
export function detectLanguage(): Lang {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 'id';
  // ?lang=en / ?lang=id di alamat halaman (berguna untuk tautan & cadangan jika penyimpanan diblokir).
  const fromUrl = new URLSearchParams(window.location?.search ?? '').get('lang');
  if (fromUrl === 'id' || fromUrl === 'en') return fromUrl;
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'id' || stored === 'en') return stored;
    if (localStorage.getItem(SAVE_STORAGE_KEY)) return 'id';
  } catch {
    /* penyimpanan diblokir: lanjut ke bahasa browser */
  }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return prefs.some((l) => /^(id|in)\b/i.test(l ?? '')) ? 'id' : 'en';
}

let current: Lang = detectLanguage();

export function lang(): Lang {
  return current;
}

export function isEnglish(): boolean {
  return current === 'en';
}

/** Kode lokal untuk Intl/toLocale*. */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'id-ID';
}

/** Hanya untuk test: ganti bahasa `tr` tanpa memuat ulang. Data JSON tidak ikut berubah. */
export function setLanguageForTest(next: Lang): void {
  current = next;
}

/** Simpan pilihan bahasa. Kembalikan false jika penyimpanan browser tidak bisa dipakai. */
export function storeLanguage(next: Lang): boolean {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
    return true;
  } catch {
    return false;
  }
}

/** Simpan pilihan lalu muat ulang halaman supaya seluruh teks memakai bahasa baru. */
export function changeLanguage(next: Lang, beforeReload?: () => void): void {
  if (next === current) return;
  const stored = storeLanguage(next);
  beforeReload?.();
  const url = new URL(window.location.href);
  if (stored) {
    // Pilihan tersimpan: buang ?lang= lama supaya tidak menimpa pilihan baru.
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang');
      window.location.replace(url.toString());
    } else window.location.reload();
    return;
  }
  // Penyimpanan diblokir: bawa pilihan lewat alamat halaman.
  url.searchParams.set('lang', next);
  window.location.replace(url.toString());
}

export type Params = Record<string, string | number | null | undefined>;

const missing = new Set<string>();

function interpolate(text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name] ?? '') : whole));
}

function pickPlural(entry: PluralEntry, params: Params | undefined): string {
  const raw = params?.[entry.count];
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
  return n === 1 ? entry.one : entry.other;
}

/**
 * Terjemahkan teks pemain. `source` = teks Indonesia (juga kunci kamus), `{nama}` diganti nilai `params`.
 * Teks yang belum ada terjemahannya tetap tampil dalam bahasa Indonesia (dicatat sekali di console saat dev).
 */
export function tr(source: string, params?: Params): string {
  let text = source;
  if (current === 'en') {
    const entry = EN_STRINGS[source];
    if (entry === undefined) {
      if (!missing.has(source)) {
        missing.add(source);
        if (import.meta.env?.DEV) console.warn(`[i18n] Belum ada terjemahan: ${JSON.stringify(source)}`);
      }
    } else text = typeof entry === 'string' ? entry : pickPlural(entry, params);
  }
  return params ? interpolate(text, params) : text;
}

/**
 * Seperti `tr`, untuk teks pendek yang di bahasa Inggris berbeda arti menurut konteks. Contoh: "Tutup" sebagai
 * tombol = "Close", sebagai status cabang = "Closed". Kunci kamusnya `konteks|teks`, mis. `status|Tutup`.
 */
export function trc(context: string, source: string, params?: Params): string {
  if (current !== 'en') return params ? interpolate(source, params) : source;
  const key = `${context}|${source}`;
  return key in EN_STRINGS ? tr(key, params) : tr(source, params);
}

/** Teks yang diminta di mode Inggris tetapi belum diterjemahkan (untuk uji & debug). */
export function missingTranslations(): readonly string[] {
  return [...missing];
}

// ---------- Data JSON ----------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecord(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Gabungkan teks terjemahan ke data dasar. Aturan:
 * - objek: digabung per kunci (kunci yang tidak ada di tumpangan tetap dari data dasar);
 * - array berisi objek ber-`id`: digabung per `id` (urutan & angka tetap dari data dasar);
 * - array berisi objek tanpa `id` (mis. daftar area): digabung per urutan, panjangnya harus sama;
 * - array lain (daftar teks) & nilai biasa: diganti utuh oleh tumpangan.
 * Angka/aturan permainan tidak pernah ditulis di tumpangan, jadi keseimbangan tetap satu sumber.
 */
export function mergeOverlay<T>(base: T, overlay: unknown): T {
  if (overlay === undefined) return base;
  if (Array.isArray(base) && Array.isArray(overlay)) {
    if (base.length > 0 && base.every((x) => isRecord(x) && typeof x.id === 'string')) {
      const byId = new Map(overlay.filter(isRecord).map((x) => [x.id as string, x]));
      return base.map((x) => mergeOverlay(x, byId.get((x as { id: string }).id))) as T;
    }
    if (base.length > 0 && base.every(isRecord) && overlay.length === base.length) {
      return base.map((x, i) => mergeOverlay(x, overlay[i])) as T;
    }
    return overlay as T;
  }
  if (isRecord(base) && isRecord(overlay)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(overlay)) out[k] = k in base ? mergeOverlay((base as Record<string, unknown>)[k], v) : v;
    return out as T;
  }
  return overlay as T;
}

/** Data JSON dalam bahasa aktif: di mode Inggris digabung dengan tumpangan terjemahannya. */
export function localizeData<T>(base: T, english: unknown): T {
  return current === 'en' ? mergeOverlay(base, english) : base;
}
