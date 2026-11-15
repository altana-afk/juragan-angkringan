import { GAME_CONFIG } from '../config/gameConfig';

export const WEEKDAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;
export const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;
export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;

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

/** "Sen, 6 Jul" */
export function formatDateShort(gameDay: number, start?: CalendarStart): string {
  const d = getCalendarDate(gameDay, start);
  return `${d.weekdayShort}, ${d.dayOfMonth} ${d.monthShort}`;
}

/** "Senin, 6 Juli 2026" */
export function formatDateLong(gameDay: number, start?: CalendarStart): string {
  const d = getCalendarDate(gameDay, start);
  return `${d.weekdayName}, ${d.dayOfMonth} ${d.monthName} ${d.year}`;
}
