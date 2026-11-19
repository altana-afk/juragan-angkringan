import { GAME_CONFIG } from '../config/gameConfig';
import { isEnglish } from '../i18n/i18n';

const NAMES_ID = {
  weekday: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
  weekdayShort: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
  month: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
  monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
} as const;
const NAMES_EN = {
  weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  weekdayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;
const NAMES = isEnglish() ? NAMES_EN : NAMES_ID;

/** Nama hari & bulan dalam bahasa aktif (dipilih sekali saat modul dimuat). */
export const WEEKDAY_NAMES: readonly string[] = NAMES.weekday;
export const WEEKDAY_SHORT: readonly string[] = NAMES.weekdayShort;
export const MONTH_NAMES: readonly string[] = NAMES.month;
export const MONTH_SHORT: readonly string[] = NAMES.monthShort;

export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  dayOfMonth: number;
  /** 0 = Minggu … 6 = Sabtu */
  weekday: number;
  weekdayName: string;
  weekdayShort: string;
  monthName: string;
  monthShort: string;
}

export interface CalendarStart {
  year: number;
  month: number;
  day: number;
}

/** Mengubah nomor hari permainan (mulai 1) menjadi tanggal kalender. */
export function getCalendarDate(gameDay: number, start: CalendarStart = GAME_CONFIG.calendarStart): CalendarDate {
  if (!Number.isInteger(gameDay) || gameDay < 1) {
    throw new Error(`Hari permainan tidak valid: ${gameDay}`);
  }
  // Pakai UTC agar tidak terpengaruh zona waktu / DST perangkat.
  const date = new Date(Date.UTC(start.year, start.month - 1, start.day + gameDay - 1));
  const weekday = date.getUTCDay();
  const monthIndex = date.getUTCMonth();
  return {
    year: date.getUTCFullYear(),
    month: monthIndex + 1,
    dayOfMonth: date.getUTCDate(),
    weekday,
    weekdayName: WEEKDAY_NAMES[weekday] ?? '',
    weekdayShort: WEEKDAY_SHORT[weekday] ?? '',
    monthName: MONTH_NAMES[monthIndex] ?? '',
    monthShort: MONTH_SHORT[monthIndex] ?? '',
  };
}

/** "Sen, 6 Jul" (Inggris: "Mon, Jul 6") */
export function formatDateShort(gameDay: number, start?: CalendarStart): string {
  const d = getCalendarDate(gameDay, start);
  return isEnglish() ? `${d.weekdayShort}, ${d.monthShort} ${d.dayOfMonth}` : `${d.weekdayShort}, ${d.dayOfMonth} ${d.monthShort}`;
}

/** "Senin, 6 Juli 2026" (Inggris: "Monday, July 6, 2026") */
export function formatDateLong(gameDay: number, start?: CalendarStart): string {
  const d = getCalendarDate(gameDay, start);
  return isEnglish() ? `${d.weekdayName}, ${d.monthName} ${d.dayOfMonth}, ${d.year}` : `${d.weekdayName}, ${d.dayOfMonth} ${d.monthName} ${d.year}`;
}
