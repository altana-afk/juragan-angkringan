import { CHANGELOG } from '../data/changelog';
import { el } from './dom';
import type { ModalHandle, UIManager } from './UIManager';

/** Versi changelog terakhir yang sudah dilihat pemain (disimpan terpisah dari save permainan). */
const SEEN_KEY = 'juragan-angkringan.changelog-seen';

export const latestVersion = (): string => CHANGELOG[0]?.version ?? '';

export function lastSeenVersion(): string | null {
  try {
    return globalThis.localStorage?.getItem(SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function markChangelogSeen(): void {
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, latestVersion());
  } catch {
    /* penyimpanan diblokir: panel akan muncul lagi, tidak apa-apa */
  }
}

/** True jika ada pembaruan yang belum dilihat. */
export function hasUnseenChangelog(): boolean {
  return lastSeenVersion() !== latestVersion();
}

/** Bandingkan "0.10.0" vs "0.9.0" secara angka. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Buka panel changelog. Versi yang lebih baru dari kunjungan terakhir diberi tanda "Baru". */
export function openChangelog(ui: UIManager, onClose?: () => void): ModalHandle {
  const seen = lastSeenVersion();
  markChangelogSeen();
  const entries = CHANGELOG.map((entry, i) => {
    const isNew = seen !== null && compareVersions(entry.version, seen) > 0;
    return el('article', {
      className: `changelog-entry${i === 0 ? ' is-latest' : ''}`,
      children: [
        el('header', {
          className: 'changelog-head',
          children: [
            el('span', { className: 'changelog-version', text: `v${entry.version}` }),
            el('strong', { text: entry.title }),
            i === 0 ? el('span', { className: 'guide-badge tone-good', text: 'Terbaru' }) : isNew ? el('span', { className: 'guide-badge tone-info', text: 'Baru' }) : null,
          ],
        }),
        el('ul', { className: 'about-list', children: entry.items.map((t) => el('li', { text: t })) }),
      ],
    });
  });
  return ui.openModal({
    title: 'Apa yang baru',
    className: 'sheet sheet-changelog sheet-centered',
    closeButton: true,
    body: el('div', { className: 'changelog-list', children: entries }),
    actions: [{ label: 'Mengerti', variant: 'primary' }],
    onClose,
  });
}
