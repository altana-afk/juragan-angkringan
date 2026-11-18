/**
 * Penulis JSON dengan gaya yang sama seperti file peta yang sudah ada:
 * indentasi 2 spasi, objek kecil berisi nilai primitif ditulis satu baris
 * ({ "type": "tree", "x": 1, "y": 2 }), kecuali "legend" yang tetap bertingkat.
 * Dengan begitu, menyimpan ulang peta lama menghasilkan diff git yang kecil.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isPrimitive = (v: Json): v is null | boolean | number | string => v === null || typeof v !== 'object';

function inlineObject(obj: Record<string, Json>): string {
  const parts = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}

function write(value: Json, indent: string, parentKey: string | null): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => inner + write(v, inner, null)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  if (parentKey !== 'legend' && entries.every(([, v]) => isPrimitive(v))) return inlineObject(value);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${write(v, inner, k)}`).join(',\n')}\n${indent}}`;
}

export function formatMapJson(raw: unknown): string {
  return `${write(raw as Json, '', null)}\n`;
}
