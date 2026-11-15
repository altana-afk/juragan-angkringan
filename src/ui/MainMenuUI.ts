import { GAME_CONFIG } from '../config/gameConfig';
import { CATALOG } from '../data/catalog';
import { openGuide } from './GuidePanel';
import type { SaveSummary } from '../systems/SaveSystem';
import { installMode, onInstallModeChange, promptInstall } from '../pwa/pwa';
import { formatRupiah } from '../utils/formatting';
import { el, type UIComponent } from './dom';
import { icon } from './icons';
import { renderPixelTitle, toHtmlCanvas } from './pixelImage';
import type { UIManager } from './UIManager';

export interface MainMenuActions {
  /** Mulai permainan baru (menimpa simpanan lama). */
  onNewGame: () => void;
  onContinue: () => void;
  onDeleteSave: () => void;
  onToggleFullscreen: () => void;
  /** Buka pengaturan suara. */
  onAudioSettings: () => void;
  /** Ringkasan simpanan yang ada, atau null. */
  getSave: () => SaveSummary | null;
  /** False jika browser tidak bisa menyimpan progres. */
  persistent: boolean;
}

/** Layar menu utama (DOM) di atas pemandangan angkringan malam. */
export class MainMenuUI implements UIComponent {
  readonly root: HTMLElement;
  private readonly actionsEl = el('div', { className: 'menu-actions' });
  private readonly saveInfo = el('p', { className: 'menu-save-info' });
  private readonly minorActions = el('div', { className: 'menu-actions menu-actions-minor' });
  private readonly installButton = el('button', {
    className: 'btn btn-secondary',
    text: 'Pasang game',
    attrs: { type: 'button', title: 'Pasang ke layar utama — bisa dibuka seperti aplikasi & dimainkan offline' },
    onClick: () => void this.install(),
  });
  private readonly stopInstallWatch: () => void;

  constructor(
    private readonly ui: UIManager,
    private readonly actions: MainMenuActions,
  ) {
    const title = toHtmlCanvas(
      renderPixelTitle(
        GAME_CONFIG.title
          .toUpperCase()
          .split(' ')
          .map((word, i) => ({ text: word, color: i === 0 ? 0xffe2a0 : 0xf6c453 })),
        0x2a1520,
        0x9a4a22,
      ),
    );
    title.className = 'menu-title-canvas';
    title.setAttribute('role', 'img');
    title.setAttribute('aria-label', GAME_CONFIG.title);

    const fullscreen = el('button', {
      className: 'btn btn-secondary',
      attrs: { type: 'button' },
      children: [icon('fullscreen'), el('span', { text: 'Layar penuh' })],
      onClick: () => actions.onToggleFullscreen(),
    });
    const sound = el('button', {
      className: 'btn btn-secondary',
      text: 'Pengaturan',
      attrs: { type: 'button' },
      onClick: () => actions.onAudioSettings(),
    });
    const guide = el('button', {
      className: 'btn btn-secondary btn-guide',
      attrs: { type: 'button', title: 'Info lengkap: cara main, event, cuaca, lokasi, pelanggan, menu, upgrade, bank, pencapaian' },
      children: [el('span', { text: '📖', attrs: { 'aria-hidden': 'true' } }), el('span', { text: 'Panduan & Info' })],
      onClick: () => openGuide(this.ui, { catalog: CATALOG, centered: true }),
    });
    const about = el('button', {
      className: 'btn btn-secondary',
      text: 'Tentang game',
      attrs: { type: 'button' },
      onClick: () => this.showAbout(),
    });

    this.root = el('section', {
      className: 'main-menu',
      attrs: { 'aria-label': 'Menu utama' },
      children: [
        el('div', {
          className: 'panel main-menu-panel',
          children: [
            el('h1', { className: 'visually-hidden', text: `${GAME_CONFIG.title} ${GAME_CONFIG.subtitle}` }),
            title,
            el('p', { className: 'menu-subtitle', text: GAME_CONFIG.subtitle.toUpperCase() }),
            el('p', { className: 'menu-tagline', text: 'Rintis angkringanmu dari nol — dari satu gerobak sampai jadi tujuan favorit warga.' }),
            this.actionsEl,
            this.saveInfo,
            this.minorActions,
          ],
        }),
        el('p', { className: 'menu-footer', text: `v${GAME_CONFIG.version} · ${GAME_CONFIG.stage}` }),
      ],
    });
    this.minorActions.append(guide, fullscreen, sound, about);
    ui.layers.screen.append(this.root);
    this.renderSaveButtons();
    this.renderInstallButton();
    this.stopInstallWatch = onInstallModeChange(() => this.renderInstallButton());
    requestAnimationFrame(() => {
      this.root.classList.add('is-visible');
      (this.actionsEl.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    });
  }

  /** Tombol utama tergantung ada/tidaknya simpanan. */
  renderSaveButtons(): void {
    const save = this.actions.getSave();
    const buttons: HTMLElement[] = [];
    if (save) {
      buttons.push(
        el('button', {
          className: 'btn btn-primary btn-lg',
          attrs: { type: 'button' },
          children: [el('span', { text: 'Lanjutkan' }), el('small', { className: 'btn-sub', text: `Hari ${save.day} · ${formatRupiah(save.money)}` })],
          onClick: () => this.actions.onContinue(),
        }),
        el('button', {
          className: 'btn btn-secondary',
          text: 'Mulai Baru',
          attrs: { type: 'button' },
          onClick: () =>
            this.ui.openModal({
              title: 'Mulai permainan baru?',
              body: `Progres tersimpan (Hari ${save.day}) akan ditimpa dan tidak bisa dikembalikan.`,
              actions: [{ label: 'Batal' }, { label: 'Ya, mulai baru', variant: 'danger', onClick: () => this.actions.onNewGame() }],
            }),
        }),
      );
    } else {
      buttons.push(
        el('button', {
          className: 'btn btn-primary btn-lg',
          text: 'Mulai Bermain',
          attrs: { type: 'button' },
          onClick: () => this.actions.onNewGame(),
        }),
      );
    }
    this.actionsEl.replaceChildren(...buttons);

    const info: (HTMLElement | string)[] = [];
    if (!this.actions.persistent) info.push('Browser ini tidak mengizinkan penyimpanan — progres hilang saat halaman ditutup.');
    if (save) {
      const del = el('button', {
        className: 'link-btn',
        text: 'Hapus data simpanan',
        attrs: { type: 'button' },
        onClick: () =>
          this.ui.openModal({
            title: 'Hapus data simpanan?',
            body: 'Semua progres (uang, stok, menu terbuka) akan dihapus permanen.',
            actions: [
              { label: 'Batal' },
              {
                label: 'Hapus permanen',
                variant: 'danger',
                onClick: () => {
                  this.actions.onDeleteSave();
                  this.renderSaveButtons();
                },
              },
            ],
          }),
      });
      info.push(del);
    }
    this.saveInfo.replaceChildren(...info);
  }

  /** Tombol "Pasang game" hanya tampil jika browser mendukung install (atau di iPhone/iPad). */
  private renderInstallButton(): void {
    if (installMode() === 'none') this.installButton.remove();
    else if (!this.installButton.isConnected) this.minorActions.prepend(this.installButton);
  }

  private async install(): Promise<void> {
    if (installMode() === 'prompt') {
      await promptInstall();
      return;
    }
    this.ui.openModal({
      title: 'Pasang ke layar utama',
      body: el('div', {
        children: [
          el('ol', {
            className: 'about-list',
            children: [
              el('li', { text: 'Buka game ini di Safari.' }),
              el('li', { text: 'Ketuk tombol Bagikan (kotak dengan panah ke atas).' }),
              el('li', { text: 'Pilih "Tambah ke Layar Utama", lalu ketuk "Tambah".' }),
            ],
          }),
          el('p', {
            className: 'modal-body muted',
            text: 'Setelah itu buka game dari ikon di layar utama: tampil layar penuh dan tetap bisa dimainkan tanpa internet.',
          }),
        ],
      }),
      actions: [{ label: 'Mengerti', variant: 'primary' }],
    });
  }

  private showAbout(): void {
    const controls = el('ul', {
      className: 'about-list',
      children: [
        el('li', { text: 'Geser layar (mouse / satu jari) untuk menggeser kamera.' }),
        el('li', { text: 'Scroll mouse atau cubit dua jari untuk zoom.' }),
        el('li', { text: 'Keyboard: WASD / panah untuk geser, Q / E untuk zoom, F untuk fokus ke gerobak, B belanja, P persiapan, Esc untuk menu.' }),
        el('li', { text: 'Progres tersimpan otomatis di browser ini.' }),
      ],
    });
    this.ui.openModal({
      title: 'Tentang game',
      body: el('div', {
        children: [
          el('p', {
            className: 'modal-body',
            text: 'Kelola angkringan: belanja bahan, siapkan nasi kucing, sate, dan wedang, layani pelanggan, lalu kembangkan usahamu hari demi hari.',
          }),
          el('h3', { className: 'modal-subtitle', text: 'Kontrol' }),
          controls,
          el('p', { className: 'modal-body muted', text: `Versi ${GAME_CONFIG.version} — ${GAME_CONFIG.stage}. Semua aset adalah placeholder orisinal buatan prosedural.` }),
        ],
      }),
      actions: [{ label: 'Tutup', variant: 'primary' }],
    });
  }

  setBusy(busy: boolean): void {
    this.root.classList.toggle('is-busy', busy);
    for (const button of this.root.querySelectorAll('button')) button.disabled = busy;
  }

  hide(): void {
    this.root.classList.remove('is-visible');
  }

  destroy(): void {
    this.stopInstallWatch();
    this.root.remove();
  }
}
