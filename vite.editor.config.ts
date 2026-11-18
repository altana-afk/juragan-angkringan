import { defineConfig, loadEnv } from 'vite';
import { mapEditorApi } from './tools/map-editor/server.ts';

/**
 * Server khusus editor peta (npm run editor). Hanya bisa diakses dari komputer ini
 * karena editor menulis file ke project. Game tetap bisa dibuka di alamat yang sama (/).
 * Kunci API generator gambar dibaca dari .env.local (tidak dikirim ke browser).
 */
export default defineConfig(({ mode }) => ({
  plugins: [mapEditorApi({ env: loadEnv(mode, process.cwd(), '') })],
  server: { host: 'localhost', port: 5180, open: '/tools/map-editor/' },
}));
