import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** File di public/ yang tidak perlu disimpan ke cache offline (konfigurasi hosting saja). */
const PUBLIC_SKIP = new Set(['_headers', '_redirects', '.nojekyll']);

function listPublicFiles(dir: string, root = dir): string[] {
  let files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files = files.concat(listPublicFiles(full, root));
    else if (!PUBLIC_SKIP.has(name)) files.push(relative(root, full).split(sep).join('/'));
  }
  return files;
}

/**
 * Membuat dist/sw.js dari template pwa/sw.js: daftar semua file hasil build (supaya game
 * bisa offline sejak kunjungan pertama) + versi cache yang berubah setiap isi build berubah.
 */
function pwaServiceWorker(): Plugin {
  let publicDir = 'public';
  return {
    name: 'pwa-service-worker',
    apply: 'build',
    enforce: 'post', // jalan setelah Vite menulis index.html ke bundle
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.map'));
      const publicFiles = listPublicFiles(publicDir);
      const urls = ['./', ...new Set(['index.html', ...built, ...publicFiles])].sort();

      const hash = createHash('sha256');
      for (const file of built) {
        const chunk = bundle[file]!;
        hash.update(file);
        hash.update(chunk.type === 'chunk' ? chunk.code : chunk.source);
      }
      for (const file of publicFiles) hash.update(file).update(readFileSync(join(publicDir, file)));
      const template = readFileSync('pwa/sw.js', 'utf8');
      hash.update(template); // logika service worker berubah → cache baru juga
      const version = hash.digest('hex').slice(0, 12);

      if (!template.includes("'__CACHE_VERSION__'") || !template.includes('= __PRECACHE_MANIFEST__;')) {
        this.error('pwa/sw.js: penanda __CACHE_VERSION__ / __PRECACHE_MANIFEST__ tidak ditemukan.');
      }
      const source = template
        .replace("'__CACHE_VERSION__'", `'${version}'`)
        .replace('= __PRECACHE_MANIFEST__;', `= ${JSON.stringify(urls, null, 2)};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// base './' agar hasil build bisa dibuka dari subfolder mana pun (hosting statis, itch.io, dll).
export default defineConfig({
  base: './',
  plugins: [pwaServiceWorker()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    // Phaser memang besar (~1,2 MB minified); peringatan ukuran chunk dinaikkan.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Phaser dipisah ke chunk sendiri: jarang berubah → tetap tersimpan di cache browser
        // saat kode game diperbarui, sehingga pembaruan hanya mengunduh ±200 kB.
        advancedChunks: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] },
      },
    },
  },
});
