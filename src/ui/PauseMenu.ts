import { showAchievements } from './AchievementsPanel';
import type { AudioSystem } from '../audio/AudioSystem';
import { openAudioSettings } from './AudioSettingsPanel';
import type { GameContext } from '../core/GameContext';
import { el, type UIComponent } from './dom';
import type { ModalHandle, UIManager } from './UIManager';

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
      title: 'Menu',
      className: 'pause-modal',
      body: el('p', { className: 'modal-body muted', text: this.ctx.persistentStorage ? 'Permainan dijeda. Progres tersimpan otomatis.' : 'Permainan dijeda. Browser ini tidak bisa menyimpan progres.' }),
      actions: [
        { label: 'Lanjutkan', variant: 'primary' },
        {
          label: 'Simpan sekarang',
          onClick: () => {
            const ok = this.ctx.saveNow();
            this.ctx.notify(ok ? 'Progres tersimpan.' : 'Gagal menyimpan progres.', ok ? 'success' : 'error');
            return false;
          },
        },
        {
          label: 'Pindah lokasi',
          onClick: () => {
            this.modal?.close();
            this.ctx.bus.emit('ui:open-panel', { panel: 'location' });
          },
        },
        {
          label: 'Kabar Kampung',
          onClick: () => {
            this.ctx.bus.emit('ui:open-panel', { panel: 'story' });
            return false;
          },
        },
        {
          label: 'Panduan & Info',
          onClick: () => {
            this.ctx.bus.emit('ui:open-panel', { panel: 'guide' });
            return false;
          },
        },
        {
          label: 'Pencapaian',
          onClick: () => {
            showAchievements(this.ctx, this.ui);
            return false;
          },
        },
        {
          label: 'Pengaturan',
          onClick: () => {
            if (this.audio) openAudioSettings(this.ui, this.audio, (lowPower) => this.ctx.bus.emit('settings:graphics-changed', { lowPower }));
            return false;
          },
        },
        {
          label: this.fullscreenActive ? 'Keluar layar penuh' : 'Layar penuh',
          onClick: () => this.ctx.bus.emit('system:toggle-fullscreen'),
        },
        { label: 'Kembali ke menu utama', variant: 'danger', onClick: () => this.confirmExit() },
      ],
      onClose: () => {
        this.modal = null;
        this.ctx.bus.emit('ui:pause-menu-closed');
      },
    });
  }

  private confirmExit(): boolean {
    this.ui.openModal({
      title: 'Kembali ke menu utama?',
      body: 'Progres disimpan dulu, lalu kamu kembali ke menu utama.',
      actions: [
        { label: 'Batal' },
        {
          label: 'Ya, keluar',
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
