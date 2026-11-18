/**
 * Penyedia gambar AI untuk studio objek. Berjalan di server editor (Node), jadi kunci API
 * tidak pernah sampai ke browser. Atur lewat file .env.local di root project:
 *
 *   OPENAI_API_KEY=...            (opsional) OPENAI_IMAGE_MODEL=gpt-image-2
 *   GEMINI_API_KEY=...            (opsional) GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
 *   PIXEL_TOOL_URL=http://localhost:8000/api/generate   (tool pixel asset milikmu)
 *
 * Semua penyedia mengembalikan gambar PNG/JPEG sebagai data URL; studio lalu membuang latar,
 * memperkecil, dan menyesuaikan warna ke palet game.
 */

export type ProviderId = 'openai' | 'gemini' | 'http';

export interface ProviderInfo {
  id: ProviderId | 'procedural';
  label: string;
  ready: boolean;
  /** Penjelasan singkat (model yang dipakai, atau cara mengaktifkan). */
  note: string;
}

export type Env = Record<string, string | undefined>;

const DEFAULT_OPENAI_MODEL = 'gpt-image-2';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-image';

export function listProviders(env: Env): ProviderInfo[] {
  return [
    { id: 'procedural', label: 'Prosedural (bawaan)', ready: true, note: 'Gratis & offline. Bentuk dasar dari kata kunci deskripsi.' },
    {
      id: 'openai',
      label: 'OpenAI',
      ready: !!env.OPENAI_API_KEY,
      note: env.OPENAI_API_KEY
        ? `Model ${env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_MODEL} (berbayar per gambar).`
        : 'Isi OPENAI_API_KEY di .env.local lalu jalankan ulang npm run editor.',
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      ready: !!env.GEMINI_API_KEY,
      note: env.GEMINI_API_KEY
        ? `Model ${env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_MODEL}.`
        : 'Isi GEMINI_API_KEY di .env.local lalu jalankan ulang npm run editor.',
    },
    {
      id: 'http',
      label: 'Tool pixel asset milikku',
      ready: !!env.PIXEL_TOOL_URL,
      note: env.PIXEL_TOOL_URL ? `Mengirim ke ${env.PIXEL_TOOL_URL}.` : 'Isi PIXEL_TOOL_URL (alamat endpoint generate tool-mu) di .env.local.',
    },
  ];
}

/** Prompt bahasa Inggris membuat model gambar lebih patuh; deskripsi asli tetap disertakan. */
export function buildPrompt(description: string): string {
  return [
    `Isometric pixel art game sprite of: ${description}.`,
    'Classic 2:1 dimetric isometric view (like SimCity / Habbo pixel art), viewed from the front-right corner.',
    'One single object, centered, fully visible, nothing cropped. Crisp hard pixels, no anti-aliasing, no blur, limited warm palette, dark outline.',
    'Setting: Indonesian street food (angkringan) at dusk. No text, no letters, no ground shadow, no floor tile.',
    'Solid flat pure magenta (#FF00FF) background filling the whole image.',
  ].join(' ');
}

class ProviderError extends Error {}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 120_000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { __image: `data:${type.split(';')[0]};base64,${buf.toString('base64')}` };
    }
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* bukan JSON */
    }
    if (!res.ok) {
      const msg = (body as { error?: { message?: string } | string })?.error;
      throw new ProviderError(`Penyedia membalas ${res.status}: ${typeof msg === 'string' ? msg : (msg?.message ?? String(text).slice(0, 200))}`);
    }
    return body;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if ((e as Error).name === 'AbortError') throw new ProviderError('Penyedia tidak menjawab dalam 2 menit.');
    throw new ProviderError(`Tidak bisa menghubungi penyedia: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Cari gambar di balasan JSON yang bentuknya tidak pasti (untuk tool HTTP generik). */
export function findImage(body: unknown, depth = 0): string | null {
  if (depth > 5 || body === null || body === undefined) return null;
  if (typeof body === 'string') {
    if (body.startsWith('data:image/')) return body;
    if (/^[A-Za-z0-9+/=\s]{200,}$/.test(body)) return `data:image/png;base64,${body.replace(/\s/g, '')}`;
    return null;
  }
  if (Array.isArray(body)) {
    for (const v of body) {
      const f = findImage(v, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.__image === 'string') return o.__image;
    for (const k of ['b64_json', 'image_base64', 'b64', 'base64', 'image', 'png', 'data_url', 'dataUrl', 'data', 'images', 'output', 'result']) {
      if (k in o) {
        const f = findImage(o[k], depth + 1);
        if (f) return f;
      }
    }
    for (const v of Object.values(o)) {
      const f = findImage(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

export async function generateImage(provider: ProviderId, description: string, env: Env, size: { width: number; height: number }): Promise<string> {
  const prompt = buildPrompt(description);
  if (provider === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new ProviderError('OPENAI_API_KEY belum diisi di .env.local.');
    const body = await fetchJson('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_MODEL, prompt, size: '1024x1024', n: 1 }),
    });
    const b64 = (body as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
    if (b64?.b64_json) return `data:image/png;base64,${b64.b64_json}`;
    if (b64?.url) {
      const img = await fetchJson(b64.url, {});
      const found = findImage(img);
      if (found) return found;
    }
    throw new ProviderError('Balasan OpenAI tidak berisi gambar.');
  }
  if (provider === 'gemini') {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new ProviderError('GEMINI_API_KEY belum diisi di .env.local.');
    const model = env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_MODEL;
    const body = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
    });
    const parts =
      (body as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) if (p.inlineData?.data) return `data:${p.inlineData.mimeType ?? 'image/png'};base64,${p.inlineData.data}`;
    throw new ProviderError('Balasan Gemini tidak berisi gambar (coba deskripsi yang lebih jelas).');
  }
  const url = env.PIXEL_TOOL_URL;
  if (!url) throw new ProviderError('PIXEL_TOOL_URL belum diisi di .env.local.');
  const body = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.PIXEL_TOOL_TOKEN ? { Authorization: `Bearer ${env.PIXEL_TOOL_TOKEN}` } : {}) },
    body: JSON.stringify({ prompt: description, full_prompt: prompt, width: size.width, height: size.height, transparent: true }),
  });
  const found = findImage(body);
  if (!found) throw new ProviderError('Balasan tool tidak berisi gambar. Tool harus membalas PNG, atau JSON berisi base64/data URL.');
  return found;
}

export { ProviderError };
