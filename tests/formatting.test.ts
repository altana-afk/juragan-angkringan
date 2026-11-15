import { describe, expect, it } from 'vitest';
import { clamp, formatClock, formatNumber, formatRupiah, formatRupiahShort } from '../src/utils/formatting';

describe('formatNumber & formatRupiah', () => {
  it('memakai titik sebagai pemisah ribuan', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1.000');
    expect(formatNumber(1234567)).toBe('1.234.567');
  });

  it('memformat Rupiah termasuk nilai negatif', () => {
    expect(formatRupiah(500_000)).toBe('Rp500.000');
    expect(formatRupiah(10_000)).toBe('Rp10.000');
    expect(formatRupiah(-2_500)).toBe('-Rp2.500');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(Number.NaN)).toBe('Rp0');
  });

  it('membulatkan pecahan', () => {
    expect(formatRupiah(1499.6)).toBe('Rp1.500');
  });
});

describe('formatRupiahShort', () => {
  it('meringkas ribuan & jutaan tanpa membuang nol bilangan bulat', () => {
    expect(formatRupiahShort(9_999)).toBe('Rp9.999');
    expect(formatRupiahShort(75_000)).toBe('Rp75 rb');
    expect(formatRupiahShort(500_000)).toBe('Rp500 rb');
    expect(formatRupiahShort(100_000)).toBe('Rp100 rb');
    expect(formatRupiahShort(1_250_000)).toBe('Rp1,25 jt');
    expect(formatRupiahShort(2_000_000)).toBe('Rp2 jt');
    expect(formatRupiahShort(1_500_000)).toBe('Rp1,5 jt');
    expect(formatRupiahShort(3_000_000_000)).toBe('Rp3 M');
    expect(formatRupiahShort(-1_250_000)).toBe('-Rp1,25 jt');
  });
});

describe('formatClock', () => {
  it('menampilkan jam dengan format 17.00', () => {
    expect(formatClock(17 * 60)).toBe('17.00');
    expect(formatClock(0)).toBe('00.00');
    expect(formatClock(23 * 60 + 59)).toBe('23.59');
  });

  it('membungkus jam lewat tengah malam', () => {
    expect(formatClock(25 * 60 + 30)).toBe('01.30');
    expect(formatClock(26 * 60)).toBe('02.00');
  });

  it('aman untuk input tidak valid', () => {
    expect(formatClock(Number.NaN)).toBe('00.00');
  });
});

describe('clamp', () => {
  it('membatasi nilai', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
