/** Utilitas format angka, uang, dan jam (gaya Indonesia). */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 1234567 → "1.234.567" */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(Math.abs(value));
  const digits = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return value < 0 && rounded !== 0 ? `-${digits}` : digits;
}

/** 500000 → "Rp500.000", -2500 → "-Rp2.500" */
export function formatRupiah(value: number): string {
  if (!Number.isFinite(value)) return 'Rp0';
  const rounded = Math.round(value);
  const body = `Rp${formatNumber(Math.abs(rounded))}`;
  return rounded < 0 ? `-${body}` : body;
}

/** Versi ringkas untuk layar sempit: 1250000 → "Rp1,25 jt", 75000 → "Rp75 rb". */
export function formatRupiahShort(value: number): string {
  if (!Number.isFinite(value)) return 'Rp0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(value));
  if (abs >= 1_000_000_000) return `${sign}Rp${trimDecimal(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}Rp${trimDecimal(abs / 1_000_000)} jt`;
  if (abs >= 10_000) return `${sign}Rp${trimDecimal(abs / 1_000)} rb`;
  return `${sign}Rp${formatNumber(abs)}`;
}

function trimDecimal(value: number): string {
  if (value >= 100) return String(Math.round(value));
  // Buang nol di belakang koma saja ("1.50" → "1,5", "2.00" → "2"), bukan nol pada bilangan bulat.
  return value.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

/** Menit sejak 00.00 → "17.00". Nilai > 1440 dibungkus (25.30 → "01.30"). */
export function formatClock(totalMinutes: number): string {
  const safe = Number.isFinite(totalMinutes) ? Math.floor(totalMinutes) : 0;
  const minutesInDay = ((safe % 1440) + 1440) % 1440;
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  return `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}`;
}
