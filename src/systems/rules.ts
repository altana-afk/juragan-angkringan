/** Kesalahan aturan permainan (bukan bug): ditampilkan ke pemain sebagai pesan. */
export class GameRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'GameRuleError';
  }
}
