import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/GameState';
import type { AudioSystem, SfxName } from './AudioSystem';

/** Pilih efek suara dari perubahan state (murni, mudah diuji). */
export function soundsForChange(reason: string, prev: Readonly<GameState>, next: Readonly<GameState>): SfxName[] {
  const out: SfxName[] = [];
  if (reason === 'beli-bahan') out.push('cash');
  else if (reason === 'masak') out.push('cook');
  else if (reason === 'beli-upgrade') out.push('upgrade');
  else if (reason === 'pasang-iklan') out.push('ad');
  else if (reason.startsWith('bank-')) out.push('cash');
  if (next.ledger.revenue > prev.ledger.revenue) out.push('coin');
  const disappointed = (s: Readonly<GameState>): number => s.ledger.leftEmpty + s.ledger.leftWaiting + s.ledger.unhappy;
  if (disappointed(next) > disappointed(prev)) out.push('sad');
  if (prev.phase !== 'berjualan' && next.phase === 'berjualan') out.push('open');
  if (prev.phase === 'berjualan' && next.phase === 'evaluasi') out.push('chime');
  if (!prev.bankrupt && next.bankrupt) out.push('bankrupt');
  if (next.unlockedRecipes.length > prev.unlockedRecipes.length && reason !== 'load' && reason !== 'reset') out.push('unlock');
  return out;
}

/** Menghubungkan event permainan & UI ke AudioSystem. */
export function attachSoundDirector(ctx: GameContext, audio: AudioSystem, uiRoot: HTMLElement): void {
  const unlock = (): void => {
    audio.unlock();
    audio.setMusic(true);
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  ctx.bus.on('state:changed', ({ reason, prev, state }) => {
    for (const s of soundsForChange(reason, prev, state)) audio.play(s);
  });
  ctx.bus.on('achievement:unlocked', () => audio.play('unlock'));
  ctx.bus.on('notify', ({ kind }) => {
    if (kind === 'error') audio.play('error');
  });
  // Klik tombol UI (kecuali tombol yang punya suaranya sendiri lewat state).
  uiRoot.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest('button');
    if (btn && !btn.disabled) audio.play('click');
  });
}
