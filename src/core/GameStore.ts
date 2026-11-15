import type { EventBus } from './EventBus';
import type { GameEvents } from './GameEvents';
import { createInitialState, validateState, type GameState } from './GameState';

/**
 * Satu-satunya sumber kebenaran untuk data permainan.
 * Perubahan dilakukan lewat update() agar selalu tervalidasi dan memicu event.
 */
export class GameStore {
  private state: GameState;

  constructor(
    private readonly bus: EventBus<GameEvents>,
    initial: GameState = createInitialState(),
  ) {
    validateState(initial);
    this.state = structuredClone(initial);
  }

  get(): Readonly<GameState> {
    return this.state;
  }

  /** Salinan dalam (deep copy) — aman diubah tanpa memengaruhi store. */
  snapshot(): GameState {
    return structuredClone(this.state);
  }

  /**
   * Ubah state secara atomik. Jika hasilnya tidak valid, perubahan dibatalkan
   * dan error dilempar sehingga state lama tetap utuh.
   */
  update(reason: string, mutate: (draft: GameState) => void): void {
    const prev = this.state;
    const draft = structuredClone(prev);
    mutate(draft);
    validateState(draft);
    this.state = draft;
    this.bus.emit('state:changed', { state: this.state, prev, reason });
  }

  /** Ganti seluruh state (dipakai untuk New Game dan nanti Load). */
  replace(next: GameState, reason: string): void {
    validateState(next);
    const prev = this.state;
    this.state = structuredClone(next);
    this.bus.emit('state:changed', { state: this.state, prev, reason });
  }

  reset(): void {
    this.replace(createInitialState(), 'new-game');
  }
}
