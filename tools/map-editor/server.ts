/**
 * Plugin dev server untuk editor peta: membaca & menulis file peta langsung ke project.
 * Hanya aktif saat `npm run editor` (vite serve), tidak ikut ke build game.
 *
 *   GET  /__map-editor/maps       semua peta di src/data/maps (mentah)
 *   GET  /__map-editor/locations  isi src/data/locations.json
 *   POST /__map-editor/save       simpan peta (+ daftarkan/hapus lokasi)
 *   GET  /__map-editor/custom     objek kustom + gambarnya (data URL)
 *   POST /__map-editor/custom/save    simpan objek kustom (PNG + data)
 *   POST /__map-editor/custom/delete  hapus objek kustom yang tidak dipakai peta mana pun
 *   GET  /__map-editor/generators     penyedia gambar yang siap dipakai
 *   POST /__map-editor/generate       buat gambar dari deskripsi lewat AI
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { normalizePath, type Plugin, type ViteDevServer } from 'vite';
import { formatMapJson } from './src/format.ts';
import { generateImage, listProviders, ProviderError, type Env, type ProviderId } from './generators.ts';
import { removeLocationText, upsertLocationText, type LocationEntry } from './src/locationsFile.ts';

const MAP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const API = '/__map-editor';

interface SaveBody {
  map: { id?: unknown; [key: string]: unknown };
  overwrite?: boolean;
  location?: { action: 'keep' } | { action: 'remove' } | { action: 'upsert'; entry: LocationEntry };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 20_000_000) throw new HttpError(413, 'Data terlalu besar');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body bukan JSON yang valid');
  }
}

/** Tolak permintaan dari situs lain: hanya halaman editor di server ini yang boleh menulis file. */
function assertSameOrigin(req: IncomingMessage): void {
  if (req.headers['x-map-editor'] !== '1') throw new HttpError(403, 'Permintaan ditolak');
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
    throw new HttpError(403, 'Asal permintaan ditolak');
  }
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export function mapEditorApi(options: { env?: Env } = {}): Plugin {
  let root = process.cwd();
  const env: Env = { ...process.env, ...options.env };
  /** File yang baru saja ditulis editor (path → waktu tulis). */
  const ownWrites = new Map<string, number>();
  const markWrite = (file: string): void => void ownWrites.set(normalizePath(file), Date.now());
  return {
    name: 'map-editor-api',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    /**
     * Tulisan editor sendiri tidak memicu muat ulang halaman (editor tidak kehilangan riwayat
     * urungkan). Modul tetap ditandai usang, jadi tab game yang dimuat ulang memakai data baru.
     */
    hotUpdate: {
      // 'post': jalan setelah plugin glob Vite menambahkan pengimpor peta (src/world/maps.ts).
      order: 'post',
      handler({ file, modules }) {
        const at = ownWrites.get(normalizePath(file));
        if (at === undefined || Date.now() - at > 5000) return;
        for (const mod of modules) this.environment.moduleGraph.invalidateModule(mod);
        return [];
      },
    },
    configureServer(server: ViteDevServer) {
      const mapsDir = join(root, 'src/data/maps');
      const locationsFile = join(root, 'src/data/locations.json');
      const backupDir = join(root, 'tools/map-editor/backups');

      const customFile = join(root, 'src/data/customObjects.json');
      const customImgDir = join(root, 'src/assets/custom-objects');

      const backup = async (file: string, name: string, ext = 'json'): Promise<void> => {
        if (!existsSync(file)) return;
        await mkdir(backupDir, { recursive: true });
        await copyFile(file, join(backupDir, `${name}-${stamp()}.${ext}`));
      };

      type Types = typeof import('../../src/world/objectTypes');
      type Customs = typeof import('../../src/world/customObjects');
      const loadTypes = async (): Promise<Types> => (await server.ssrLoadModule('/src/world/objectTypes.ts')) as Types;
      const loadCustoms = async (): Promise<Customs> => (await server.ssrLoadModule('/src/world/customObjects.ts')) as Customs;

      async function readCustomRaw(): Promise<{ objects: Record<string, unknown>[] }> {
        if (!existsSync(customFile)) return { objects: [] };
        return JSON.parse(await readFile(customFile, 'utf8')) as { objects: Record<string, unknown>[] };
      }

      /** Samakan daftar jenis objek di modul server dengan file di disk (modul bisa usang). */
      async function syncCustomTypes(): Promise<void> {
        const { parseCustomObjects } = await loadCustoms();
        const types = await loadTypes();
        const defs = parseCustomObjects(await readCustomRaw());
        for (const id of types.listObjectTypeIds()) if (types.isCustomObjectTypeId(id) && !defs.some((d) => d.id === id)) types.unregisterCustomObjectType(id);
        for (const d of defs) types.registerCustomObjectType(d);
      }

      async function listCustom(): Promise<{ objects: unknown[]; images: Record<string, string> }> {
        const raw = await readCustomRaw();
        const images: Record<string, string> = {};
        for (const o of raw.objects) {
          const file = join(customImgDir, `${String(o.id)}.png`);
          if (existsSync(file)) images[String(o.id)] = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
        }
        return { objects: raw.objects, images };
      }

      async function saveCustom(body: { def?: Record<string, unknown>; png?: unknown }): Promise<{ id: string }> {
        const def = body.def;
        const png = typeof body.png === 'string' ? body.png : '';
        if (!def || !png.startsWith('data:image/png;base64,')) throw new HttpError(400, 'Data objek atau gambar PNG tidak ada');
        const { parseCustomObjects } = await loadCustoms();
        const raw = await readCustomRaw();
        const list = raw.objects.filter((o) => o.id !== def.id);
        const index = raw.objects.findIndex((o) => o.id === def.id);
        if (index >= 0) list.splice(index, 0, def);
        else list.push(def);
        let parsed;
        try {
          parsed = parseCustomObjects({ objects: list });
        } catch (e) {
          throw new HttpError(422, e instanceof Error ? e.message : String(e));
        }
        const id = String(def.id);
        const bytes = Buffer.from(png.slice('data:image/png;base64,'.length), 'base64');
        // Cek ukuran PNG = frameWidth*frames × frameHeight (header IHDR).
        const w = bytes.readUInt32BE(16);
        const h = bytes.readUInt32BE(20);
        const d = parsed.find((x) => x.id === id)!;
        if (w !== d.frameWidth * d.frames || h !== d.frameHeight)
          throw new HttpError(422, `Ukuran PNG ${w}×${h} tidak cocok dengan ${d.frames} frame ${d.frameWidth}×${d.frameHeight}`);
        await mkdir(customImgDir, { recursive: true });
        const imgFile = join(customImgDir, `${id}.png`);
        await backup(imgFile, id, 'png');
        await backup(customFile, 'customObjects');
        markWrite(imgFile);
        await writeFile(imgFile, bytes);
        markWrite(customFile);
        await writeFile(customFile, `${JSON.stringify({ objects: list }, null, 2)}\n`, 'utf8');
        await syncCustomTypes();
        return { id };
      }

      async function deleteCustom(id: string): Promise<void> {
        const users = (await listMaps())
          .filter((m) => ((m as { objects?: { type?: unknown }[] }).objects ?? []).some((o) => o.type === id))
          .map((m) => (m as { id: string }).id);
        if (users.length) throw new HttpError(409, `Objek masih dipakai di peta: ${users.join(', ')}. Hapus dulu dari peta tersebut.`);
        const raw = await readCustomRaw();
        if (!raw.objects.some((o) => o.id === id)) throw new HttpError(404, 'Objek tidak ditemukan');
        const imgFile = join(customImgDir, `${id}.png`);
        await backup(imgFile, id, 'png');
        await backup(customFile, 'customObjects');
        markWrite(customFile);
        await writeFile(customFile, `${JSON.stringify({ objects: raw.objects.filter((o) => o.id !== id) }, null, 2)}\n`, 'utf8');
        if (existsSync(imgFile)) {
          markWrite(imgFile);
          await rm(imgFile);
        }
        await syncCustomTypes();
      }

      async function listMaps(): Promise<unknown[]> {
        const files = (await readdir(mapsDir)).filter((f) => f.endsWith('.json')).sort();
        return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(mapsDir, f), 'utf8')) as unknown));
      }

      async function save(body: SaveBody): Promise<{ file: string; location: string }> {
        const id = body.map?.id;
        if (typeof id !== 'string' || !MAP_ID.test(id)) throw new HttpError(400, 'Id peta tidak valid');

        // Validasi memakai parser asli game (objek kustom terbaru ikut dikenali).
        await syncCustomTypes();
        const { parseMapData } = (await server.ssrLoadModule('/src/world/MapData.ts')) as typeof import('../../src/world/MapData');
        try {
          parseMapData(body.map);
        } catch (e) {
          throw new HttpError(422, e instanceof Error ? e.message : String(e));
        }

        const file = join(mapsDir, `${id}.json`);
        if (existsSync(file) && !body.overwrite) throw new HttpError(409, `Peta "${id}" sudah ada di project`);

        // Siapkan perubahan locations.json dulu agar error ketahuan sebelum menulis apa pun.
        const action = body.location ?? { action: 'keep' };
        const oldLocations = await readFile(locationsFile, 'utf8');
        let newLocations = oldLocations;
        if (action.action === 'upsert') {
          const entry = action.entry;
          if (!entry || entry.id !== id || entry.mapId !== id) throw new HttpError(400, 'Data lokasi harus ber-id sama dengan peta');
          newLocations = upsertLocationText(oldLocations, entry);
          const { parseLocations } = (await server.ssrLoadModule('/src/data/locations.ts')) as typeof import('../../src/data/locations');
          try {
            parseLocations(JSON.parse(newLocations));
          } catch (e) {
            throw new HttpError(422, e instanceof Error ? e.message : String(e));
          }
        } else if (action.action === 'remove') {
          newLocations = removeLocationText(oldLocations, id);
        }

        await backup(file, id);
        markWrite(file);
        await writeFile(file, formatMapJson(body.map), 'utf8');
        let location = 'tetap';
        if (newLocations !== oldLocations) {
          await backup(locationsFile, 'locations');
          markWrite(locationsFile);
          await writeFile(locationsFile, newLocations, 'utf8');
          location = action.action === 'remove' ? 'dihapus' : 'disimpan';
        }
        return { file: `src/data/maps/${id}.json`, location };
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith(API)) return next();
        try {
          if (req.method === 'GET' && url === `${API}/maps`) return send(res, 200, { maps: await listMaps() });
          if (req.method === 'GET' && url === `${API}/locations`) return send(res, 200, JSON.parse(await readFile(locationsFile, 'utf8')));
          if (req.method === 'POST' && url === `${API}/save`) {
            assertSameOrigin(req);
            const result = await save((await readBody(req)) as SaveBody);
            server.config.logger.info(`[editor peta] tersimpan ${result.file} (lokasi: ${result.location})`, { timestamp: true });
            return send(res, 200, { ok: true, ...result });
          }
          if (req.method === 'GET' && url === `${API}/custom`) return send(res, 200, await listCustom());
          if (req.method === 'GET' && url === `${API}/generators`) return send(res, 200, { providers: listProviders(env) });
          if (req.method === 'POST' && url === `${API}/custom/save`) {
            assertSameOrigin(req);
            const result = await saveCustom((await readBody(req)) as { def?: Record<string, unknown>; png?: unknown });
            server.config.logger.info(`[editor peta] objek kustom ${result.id} tersimpan`, { timestamp: true });
            return send(res, 200, { ok: true, ...result });
          }
          if (req.method === 'POST' && url === `${API}/custom/delete`) {
            assertSameOrigin(req);
            const { id } = (await readBody(req)) as { id?: unknown };
            if (typeof id !== 'string') throw new HttpError(400, 'Id objek tidak ada');
            await deleteCustom(id);
            return send(res, 200, { ok: true });
          }
          if (req.method === 'POST' && url === `${API}/generate`) {
            assertSameOrigin(req);
            const b = (await readBody(req)) as { provider?: unknown; prompt?: unknown; width?: unknown; height?: unknown };
            if (b.provider !== 'openai' && b.provider !== 'gemini' && b.provider !== 'http') throw new HttpError(400, 'Penyedia tidak dikenal');
            if (typeof b.prompt !== 'string' || !b.prompt.trim()) throw new HttpError(400, 'Deskripsi masih kosong');
            try {
              const image = await generateImage(b.provider as ProviderId, b.prompt.trim().slice(0, 600), env, {
                width: Number(b.width) || 64,
                height: Number(b.height) || 64,
              });
              return send(res, 200, { image });
            } catch (e) {
              throw new HttpError(e instanceof ProviderError ? 502 : 500, e instanceof Error ? e.message : String(e));
            }
          }
          send(res, 404, { error: 'Tidak ditemukan' });
        } catch (e) {
          const status = e instanceof HttpError ? e.status : 500;
          send(res, status, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
