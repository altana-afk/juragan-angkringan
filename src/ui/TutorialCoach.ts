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
  /** Petunjuk sekali "ketuk gelembung" (cerita), tampil di atas tutorial biasa. */
  private storyHint = false;
  private readonly skip: HTMLElement;
  private readonly ok: HTMLElement;
  private readonly offHint: () => void;

  constructor(private readonly ctx: GameContext, parent: HTMLElement) {
    this.root = el('aside', {
      className: 'tutorial-coach',
      attrs: { role: 'status', 'aria-live': 'polite' },
      children: [
        el('div', { className: 'coach-head', children: [this.counter, this.title] }),
        this.text,
        (this.skip = el('button', {
          className: 'link-btn coach-skip',
          text: 'Lewati tutorial',
          attrs: { type: 'button' },
          onClick: () => this.ctx.actions.updateTutorial(true),
        })),
        (this.ok = el('button', {
          className: 'link-btn coach-skip',
          text: 'Mengerti',
          attrs: { type: 'button' },
          onClick: () => this.hideStoryHint(),
        })),
      ],
    });
    this.offHint = ctx.bus.on('story:hint', ({ show }) => {
      if (show && !this.ctx.store.get().story.flags.bubbleHint) {
        this.storyHint = true;
        this.render();
      } else if (!show && this.storyHint) this.hideStoryHint();
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

  private hideStoryHint(): void {
    this.storyHint = false;
    if (!this.ctx.store.get().story.flags.bubbleHint) this.ctx.actions.markStoryFlag('bubbleHint');
    this.render();
  }

  private render(): void {
    const s = this.ctx.store.get();
    this.ok.hidden = !this.storyHint;
    this.skip.hidden = this.storyHint;
    if (this.storyHint) {
      this.root.classList.add('is-visible', 'is-story');
      this.setHint(null);
      setText(this.counter, '💬');
      setText(this.title, 'Ada yang mau bercerita');
      setText(this.text, 'Ketuk gelembung "..." di atas pelanggan bernama untuk mendengar kabar kampung. Waktu berhenti selama kalian mengobrol.');
      return;
    }
    this.root.classList.remove('is-story');
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
    this.offHint();
    this.setHint(null);
    this.root.remove();
  }
}
