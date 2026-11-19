import type { FavoriteRound } from '../systems/MinigameSystem';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/**
 * Minigame "Pesanan kesukaan" (0.18.1): setelah mengobrol, kenalan menyebut pesanannya secara tidak langsung.
 * Pilih satu dari tiga kartu menu. Benar = hati +2, salah = hati +1. Memakai gaya panel tantangan.
 */
export interface FavoriteQuizOptions {
  readonly name: string;
  readonly round: FavoriteRound;
  readonly recipeName: (id: string) => string;
  readonly onAnswer: (right: boolean) => string;
}

export function openFavoriteQuiz(ui: UIManager, options: FavoriteQuizOptions): void {
  const release = ui.holdTime();
  const { round } = options;
  const body = el('div', { className: 'challenge-body' });
  const root = el('section', {
    className: 'challenge-panel',
    attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'favorite-title' },
    children: [el('h2', { className: 'challenge-title', text: tr('Pesanan kesukaan'), attrs: { id: 'favorite-title' } }), body],
  });
  let answered = false;
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-visible');
    window.setTimeout(() => root.remove(), 200);
    release();
  };
  const answer = (id: string): void => {
    if (answered) return;
    answered = true;
    const right = id === round.answer;
    const text = options.onAnswer(right);
    const ok = el('button', { className: 'btn btn-primary challenge-btn', attrs: { type: 'button' }, text: tr('Lanjut berjualan'), onClick: close });
    body.replaceChildren(
      el('p', {
        className: `challenge-result ${right ? 'is-good' : 'is-bad'}`,
        text: right ? tr('Tepat! {name} tersenyum. {text}', { name: options.name, text }) : tr('Bukan itu, maksudnya {answer}. {text}', { answer: options.recipeName(round.answer), text }),
      }),
      el('div', { className: 'challenge-actions', children: [ok] }),
    );
    ok.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent): void => {
    const id = round.options[Number(e.key) - 1];
    if (!answered && id) {
      e.preventDefault();
      e.stopPropagation();
      answer(id);
    } else if (answered && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const cards = round.options.map((id, i) =>
    el('button', {
      className: 'btn btn-secondary challenge-btn',
      attrs: { type: 'button' },
      children: [el('kbd', { className: 'challenge-key', text: String(i + 1) }), el('span', { text: options.recipeName(id) })],
      onClick: (ev) => {
        ev.stopPropagation();
        answer(id);
      },
    }),
  );
  body.replaceChildren(
    el('p', { className: 'challenge-text', text: tr('{name}: "{hint}"', { name: options.name, hint: round.hint }) }),
    el('p', { className: 'challenge-note', text: tr('Menu mana yang dia maksud? Tebakan benar: hati +2. Salah: hati +1.') }),
    el('div', { className: 'challenge-cards favorite-cards', children: cards }),
  );
  root.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey, true);
  ui.layers.hud.append(root);
  requestAnimationFrame(() => root.classList.add('is-visible'));
  (cards[0] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
}
