/** Klien untuk API dev server editor (tools/map-editor/server.ts). */
import type { LocationEntry } from './locationsFile';

const BASE = '/__map-editor';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Map-Editor': '1', ...init?.headers } });
  } catch {
    throw new ApiError(0, 'Server editor tidak terhubung. Jalankan "npm run editor" lalu muat ulang halaman ini.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 404 && !body.error) throw new ApiError(404, 'API editor tidak ada. Buka editor lewat "npm run editor", bukan "npm run dev".');
    throw new ApiError(res.status, body.error ?? `Server membalas ${res.status}`);
  }
  return body as T;
}

export const fetchMaps = (): Promise<{ maps: unknown[] }> => call('/maps');
export const fetchLocations = (): Promise<{ locations: LocationEntry[] }> => call('/locations');

export type LocationAction = { action: 'keep' } | { action: 'remove' } | { action: 'upsert'; entry: LocationEntry };

export const saveMap = (map: unknown, overwrite: boolean, location: LocationAction): Promise<{ ok: true; file: string; location: string }> =>
  call('/save', { method: 'POST', body: JSON.stringify({ map, overwrite, location }) });

// ---------------------------------------------------------------- objek kustom & generator

export interface ProviderInfo {
  id: 'procedural' | 'openai' | 'gemini' | 'http';
  label: string;
  ready: boolean;
  note: string;
}

export const fetchCustom = (): Promise<{ objects: unknown[]; images: Record<string, string> }> => call('/custom');
export const saveCustom = (def: unknown, png: string): Promise<{ ok: true; id: string }> =>
  call('/custom/save', { method: 'POST', body: JSON.stringify({ def, png }) });
export const deleteCustom = (id: string): Promise<{ ok: true }> => call('/custom/delete', { method: 'POST', body: JSON.stringify({ id }) });
export const fetchProviders = (): Promise<{ providers: ProviderInfo[] }> => call('/generators');
export const generateRemote = (provider: string, prompt: string, width: number, height: number): Promise<{ image: string }> =>
  call('/generate', { method: 'POST', body: JSON.stringify({ provider, prompt, width, height }) });
