import type { GameState } from '../core/GameState';
import { ONLINE_EVENT_GAP, ONLINE_EVENTS, onlineEventById, type OnlineEventDef } from '../data/online';
import { SeededRandom } from '../utils/random';

/**
 * Event pesanan online harian (mis. "Diskon Toko Online"). Berjalan terpisah dari event harian biasa:
 * paling banyak satu per hari, berlaku satu hari, dan ada jeda minimal antar event.
 */

/** Event online yang berlaku hari ini (null jika tidak ada). */
export function activeOnlineEvent(state: Readonly<GameState>): OnlineEventDef | null {
  const e = state.online.event;
  return e && e.day === state.calendar.day ? onlineEventById(e.id) : null;
}

/** Undi event online untuk hari yang baru dimulai (dipanggil saat ganti hari). */
export function rollOnlineEvent(draft: GameState): OnlineEventDef | null {
  const day = draft.calendar.day;
  draft.online.event = null;
  // Belum memilih cara mengantar = pesanan online belum aktif, tidak perlu event.
  if (!draft.online.mode) return null;
  if (draft.online.lastEventDay > 0 && day - draft.online.lastEventDay < ONLINE_EVENT_GAP) return null;
  const rng = new SeededRandom(`online-event-${day}`);
  for (const ev of ONLINE_EVENTS) {
    const roll = rng.next();
    if (draft.online.rating < ev.minRating) continue;
    if (roll < ev.chance) {
      draft.online.event = { id: ev.id, day };
      draft.online.lastEventDay = day;
      return ev;
    }
  }
  return null;
}
