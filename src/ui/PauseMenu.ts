import { showAchievements } from './AchievementsPanel';
import type { AudioSystem } from '../audio/AudioSystem';
import { openAudioSettings } from './AudioSettingsPanel';
import type { GameContext } from '../core/GameContext';
import { el, type UIComponent } from './dom';
import type { ModalHandle, UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/**
 * Menu jeda (tombol ☰ atau Esc): lanjutkan, layar penuh, kembali ke menu utama.
 * Scene permainan dijeda selama menu terbuka.
 */
export class PauseMenu implements UIComponent {
  readonly root = el('div', { className: 'pause-menu-anchor' });
  private modal: ModalHandle | null = null;
  private readonly offs: (() => void)[] = [];
  private fullscreenActive = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly ui: UIManager,
    private readonly audio: AudioSystem | null = null,
  ) {
    this.offs.push(
      ctx.bus.on('ui:open-pause-menu', () => this.open()),
      ctx.bus.on('system:fullscreen-changed', ({ active }) => {
        this.fullscreenActive = active;
      }),
    );
    window.addEventListener('keydown', this.onKeyDown);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && !this.modal && !this.ui.hasOpenModal()) {
      event.preventDefault();
      this.ctx.bus.emit('ui:open-pause-menu');
    }
  };

  private open(): void {
    if (this.modal) return;
    this.modal = this.ui.openModal({
      title: tr('Menu'),
      className: 'pause-modal',
      body: el('p', { className: 'modal-body muted', text: this.ctx.persistentStorage ? tr('Permainan dijeda. Progres tersimpan otomatis.') : tr('Permainan dijeda. Browser ini tidak bisa menyimpan progres.') }),
      actions: [
        { label: tr('Lanjutkan'), variant: 'primary' },
        {
          label: tr('Simpan sekarang'),
          onClick: () => {
            const ok = this.ctx.saveNow();
            this.ctx.notify(ok ? tr('Progres tersimpan.') : tr('Gagal menyimpan progres.'), ok ? 'success' : 'error');
            return false;
          },
        },
        {
          label: tr('Pindah lokasi'),
          onClick: () => {
            this.modal?.close();
            this.ctx.bus.emit('ui:open-panel', { panel: 'location' });
          },
        },
        {
          label: tr('Kabar Kampung'),
          onClick: () => {
            this.ctx.bus.emit('ui:open-panel', { panel: 'story' });
            return false;
          },
        },
        {
          label: tr('Panduan & Info'),
          onClick: () => {
            this.ctx.bus.emit('ui:open-panel', { panel: 'guide' });
            return false;
          },
        },
        {
          label: tr('Pencapaian'),
          onClick: () => {
            showAchievements(this.ctx, this.ui);
            return false;
          },
        },
        {
          label: tr('Pengaturan'),
          onClick: () => {
            if (this.audio) openAudioSettings(this.ui, this.audio, (lowPower) => this.ctx.bus.emit('settings:graphics-changed', { lowPower }), () => this.ctx.flushSave());
            return false;
          },
        },
        {
          label: this.fullscreenActive ? tr('Keluar layar penuh') : tr('Layar penuh'),
          onClick: () => this.ctx.bus.emit('system:toggle-fullscreen'),
        },
        { label: tr('Kembali ke menu utama'), variant: 'danger', onClick: () => this.confirmExit() },
      ],
      onClose: () => {
        this.modal = null;
        this.ctx.bus.emit('ui:pause-menu-closed');
      },
    });
  }

  private confirmExit(): boolean {
    this.ui.openModal({
      title: tr('Kembali ke menu utama?'),
      body: tr('Progres disimpan dulu, lalu kamu kembali ke menu utama.'),
      actions: [
        { label: tr('Batal') },
        {
          label: tr('Ya, keluar'),
          variant: 'danger',
          onClick: () => {
            this.modal?.close();
            this.ctx.bus.emit('game:return-to-menu');
          },
        },
      ],
    });
    return false;
  }

  destroy(): void {
    for (const off of this.offs) off();
    window.removeEventListener('keydown', this.onKeyDown);
    this.modal?.close();
    this.root.remove();
  }
}
