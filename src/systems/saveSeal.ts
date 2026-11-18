/**
 * Segel save: tanda tangan sederhana supaya edit manual (LocalStorage, Firebase Console) ketahuan.
 * Ini pengaman tanpa server — orang yang membongkar kode game masih bisa memalsukannya,
 * tapi save yang diedit langsung akan ditandai `tampered` dan tidak boleh masuk leaderboard.
 */
export const SEAL_SALT = 'juragan-angkringan:segel:v1';

/** Hash cepat & sinkron (cyrb53) untuk save di perangkat. */
export function quickSeal(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = SEAL_SALT + text;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** SHA-256 (hex huruf kecil) dari SALT + teks — sama persis dengan yang dicek aturan Firestore. */
export async function cloudSeal(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(SEAL_SALT + text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
