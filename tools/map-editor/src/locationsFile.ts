/**
 * Menyunting src/data/locations.json tanpa menulis ulang seluruh file:
 * hanya entri lokasi yang berubah yang diganti (format & angka lain tetap utuh).
 * Murni (tanpa fs) agar bisa diuji.
 */

export interface LocationEntry {
  id: string;
  mapId: string;
  [key: string]: unknown;
}

interface Span {
  start: number;
  end: number;
}

/** Cari rentang teks setiap elemen array "locations" (kurung kurawal pembuka s.d. penutup). */
function locationSpans(text: string): { spans: Span[]; arrayEnd: number } {
  const keyAt = text.indexOf('"locations"');
  if (keyAt < 0) throw new Error('locations.json tidak punya kunci "locations"');
  let i = text.indexOf('[', keyAt);
  if (i < 0) throw new Error('locations.json: array "locations" tidak ditemukan');
  const spans: Span[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (i = i + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) return { spans, arrayEnd: i };
      depth--;
      if (depth === 0) spans.push({ start, end: i + 1 });
    }
  }
  throw new Error('locations.json tidak lengkap');
}

const indentBlock = (json: string, indent: string): string => json.split('\n').join(`\n${indent}`);

/** Tambah atau ganti entri lokasi (berdasarkan id). */
export function upsertLocationText(text: string, entry: LocationEntry): string {
  const data = JSON.parse(text) as { locations: LocationEntry[] };
  const index = data.locations.findIndex((l) => l.id === entry.id);
  const { spans, arrayEnd } = locationSpans(text);
  const body = indentBlock(JSON.stringify(entry, null, 2), '    ');
  let out: string;
  if (index >= 0) {
    const span = spans[index] as Span;
    out = text.slice(0, span.start) + body + text.slice(span.end);
  } else {
    const last = spans[spans.length - 1];
    if (!last) out = `${text.slice(0, arrayEnd)}\n    ${body}\n  ${text.slice(arrayEnd)}`;
    else out = `${text.slice(0, last.end)},\n    ${body}${text.slice(last.end)}`;
  }
  const check = JSON.parse(out) as { locations: LocationEntry[] };
  const saved = check.locations.find((l) => l.id === entry.id);
  if (JSON.stringify(saved) !== JSON.stringify(entry)) throw new Error('Gagal menyisipkan lokasi ke locations.json');
  return out;
}

/** Hapus entri lokasi (berdasarkan id). Teks tidak berubah jika id tidak ada. */
export function removeLocationText(text: string, id: string): string {
  const data = JSON.parse(text) as { locations: LocationEntry[] };
  const index = data.locations.findIndex((l) => l.id === id);
  if (index < 0) return text;
  if (data.locations.length === 1) throw new Error('Lokasi terakhir tidak boleh dihapus');
  const { spans } = locationSpans(text);
  const span = spans[index] as Span;
  // Buang juga koma pemisah di depan (atau di belakang untuk elemen pertama).
  let start = span.start;
  let end = span.end;
  if (index > 0) {
    const prev = spans[index - 1] as Span;
    start = prev.end;
  } else {
    const next = spans[index + 1] as Span;
    end = next.start;
    start = span.start;
  }
  const out = text.slice(0, start) + text.slice(end);
  const check = JSON.parse(out) as { locations: LocationEntry[] };
  if (check.locations.some((l) => l.id === id) || check.locations.length !== data.locations.length - 1) {
    throw new Error('Gagal menghapus lokasi dari locations.json');
  }
  return out;
}

/** "17:30" → 1050 menit. Jam lewat tengah malam ditulis 25:00, 26:00, … */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 30) return null;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
