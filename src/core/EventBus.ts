/**
 * Event bus bertipe (tanpa ketergantungan Phaser) untuk komunikasi antar-modul.
 * Sistem gameplay, UI, dan scene saling bicara lewat event, bukan saling import.
 */

type Listener<T> = (payload: T) => void;
type EmitArgs<T> = [T] extends [void] ? [] : [payload: T];

export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Daftarkan listener. Mengembalikan fungsi untuk berhenti mendengarkan. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<never>);
    if (set.size === 0) this.listeners.delete(event);
  }

  emit<K extends keyof Events>(event: K, ...args: EmitArgs<Events[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    const payload = args[0] as Events[K];
    // Salin dulu supaya listener yang melepas diri saat dipanggil tidak mengacaukan iterasi.
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        console.error(`[EventBus] Listener untuk "${String(event)}" gagal:`, error);
      }
    }
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Jumlah seluruh listener (untuk mendeteksi kebocoran saat scene dibuat ulang). */
  totalListeners(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  clear(): void {
    this.listeners.clear();
  }
}
