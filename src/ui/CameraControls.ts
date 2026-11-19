import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { el, type UIComponent } from './dom';
import { icon } from './icons';
import { tr } from '../i18n/i18n';

/** Tombol kamera di sisi kanan: perbesar, perkecil, fokus ke gerobak. */
export class CameraControls implements UIComponent {
  readonly root: HTMLElement;
  private readonly zoomIn: HTMLButtonElement;
  private readonly zoomOut: HTMLButtonElement;
  private readonly off: () => void;

  constructor(bus: EventBus<GameEvents>, parent: HTMLElement) {
    this.zoomIn = el('button', {
      className: 'cam-btn',
      attrs: { type: 'button', 'aria-label': tr('Perbesar'), title: tr('Perbesar (E / +)') },
      children: [icon('plus')],
      onClick: () => bus.emit('camera:zoom-in'),
    });
    this.zoomOut = el('button', {
      className: 'cam-btn',
      attrs: { type: 'button', 'aria-label': tr('Perkecil'), title: tr('Perkecil (Q / −)') },
      children: [icon('minus')],
      onClick: () => bus.emit('camera:zoom-out'),
    });
    const focus = el('button', {
      className: 'cam-btn',
      attrs: { type: 'button', 'aria-label': tr('Fokus ke gerobak'), title: tr('Fokus ke gerobak (F)') },
      children: [icon('target')],
      onClick: () => bus.emit('camera:focus-home'),
    });
    this.root = el('nav', { className: 'cam-controls', attrs: { 'aria-label': tr('Kontrol kamera') }, children: [this.zoomIn, this.zoomOut, focus] });
    parent.append(this.root);
    this.off = bus.on('camera:zoom-changed', ({ zoom, min, max }) => {
      this.zoomIn.disabled = zoom >= max - 0.01;
      this.zoomOut.disabled = zoom <= min + 0.01;
    });
  }

  destroy(): void {
    this.off();
    this.root.remove();
  }
}
