import { describe, expect, it } from 'vitest';
import { formatDateLong, formatDateShort, getCalendarDate } from '../src/utils/calendar';

describe('kalender permainan', () => {
  it('Hari 1 adalah Senin, 6 Juli 2026', () => {
    const d = getCalendarDate(1);
    expect(d).toMatchObject({ year: 2026, month: 7, dayOfMonth: 6, weekdayName: 'Senin' });
    expect(formatDateShort(1)).toBe('Sen, 6 Jul');
    expect(formatDateLong(1)).toBe('Senin, 6 Juli 2026');
  });

  it('berganti hari & bulan dengan benar', () => {
    expect(getCalendarDate(7).weekdayName).toBe('Minggu');
    expect(getCalendarDate(8).weekdayName).toBe('Senin');
    const aug = getCalendarDate(27);
    expect(aug).toMatchObject({ month: 8, dayOfMonth: 1, weekdayName: 'Sabtu', monthName: 'Agustus' });
  });

  it('bisa memakai tanggal mulai lain', () => {
    expect(formatDateShort(1, { year: 2025, month: 12, day: 31 })).toBe('Rab, 31 Des');
    expect(formatDateShort(2, { year: 2025, month: 12, day: 31 })).toBe('Kam, 1 Jan');
  });

  it('menolak hari tidak valid', () => {
    expect(() => getCalendarDate(0)).toThrow();
    expect(() => getCalendarDate(1.5)).toThrow();
  });
});
