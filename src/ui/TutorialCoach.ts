import type { GameContext } from '../core/GameContext';
import { TUTORIAL_DONE, TUTORIAL_STEPS } from '../systems/TutorialSystem';
import { el, setText, type UIComponent } from './dom';

/**
 * Tutorial singkat berupa kartu petunjuk di atas bilah aksi.
 * Maju otomatis saat pemain melakukan langkahnya; tombol disorot berdenyut. Bisa dilewati.
 */
export class TutorialCoach implements UIComponent {
  readonly root: HTMLElement;
  private readonly title = el('strong', { className: 'coach-title' });
  private readonly text = el('p', { className: 'coach-text' });
  private readonly counter = el('span', { className: 'coach-counter' });
  private readonly off: () => void;
  private hinted: HTMLElement | null = null;

  constructor(private readonly ctx: GameContext, parent: HTMLElement) {
    this.root = el('aside', {
      className: 'tutorial-coach',
      attrs: { role: 'status', 'aria-live': 'polite' },
      children: [
        el('div', { className: 'coach-head', children: [this.counter, this.title] }),
        this.text,
        el('button', {
          className: 'link-btn coach-skip',
          text: 'Lewati tutorial',
          attrs: { type: 'button' },
          onClick: () => this.ctx.actions.updateTutorial(true),
        }),
      ],
    });
    parent.append(this.root);
    this.off = ctx.bus.on('state:changed', ({ reason }) => {
      if (reason !== 'tutorial') queueMicrotask(() => this.ctx.actions.updateTutorial());
      queueMicrotask(() => this.render());
    });
    queueMicrotask(() => {
      this.ctx.actions.updateTutorial();
      this.render();
    });
  }

  private render(): void {
    const s = this.ctx.store.get();
    const step = TUTORIAL_STEPS[s.tutorial];
    const active = s.tutorial < TUTORIAL_DONE && step !== undefined && !s.bankrupt;
    this.root.classList.toggle('is-visible', active);
    this.setHint(active && step?.highlight ? step.highlight : null);
    if (!active || !step) return;
    setText(this.counter, `${s.tutorial + 1}/${TUTORIAL_STEPS.length}`);
    setText(this.title, step.title);
    setText(this.text, step.text);
  }

  private setHint(label: string | null): void {
    this.hinted?.classList.remove('is-hint');
    this.hinted = null;
    if (!label) return;
    const btn = [...document.querySelectorAll<HTMLElement>('.action-bar .action-btn')].find(
      (b) => b.getAttribute('aria-label') === label || b.textContent?.trim().startsWith(label),
    );
    if (btn) {
      btn.classList.add('is-hint');
      this.hinted = btn;
    }
  }

  destroy(): void {
    this.off();
    this.setHint(null);
    this.root.remove();
  }
}
