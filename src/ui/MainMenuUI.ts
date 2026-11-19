import { openLeaderboard } from './LeaderboardPanel';
import type { CloudSync } from '../cloud/CloudSync';
import { openAccountPanel } from './AccountPanel';
import { GAME_CONFIG } from '../config/gameConfig';
import { CATALOG } from '../data/catalog';
import { hasUnseenChangelog, openChangelog } from './ChangelogPanel';
import { openGuide } from './GuidePanel';
import type { SaveSummary } from '../systems/SaveSystem';
import { installMode, onInstallModeChange, promptInstall } from '../pwa/pwa';
import { formatRupiah } from '../utils/formatting';
import { el, type UIComponent } from './dom';
import { icon } from './icons';
import { renderPixelTitle, toHtmlCanvas } from './pixelImage';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

export interface MainMenuActions {
  /** Mulai permainan baru (menimpa simpanan lama). */
  onNewGame: () => void;
  onContinue: () => void;
  onDeleteSave: () => void;
  onToggleFullscreen: () => void;
  /** Buka pengaturan suara. */
  onAudioSettings: () => void;
  /** Akun & simpan di awan (null jika belum diatur). */
  cloud: CloudSync | null;
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
    text: tr('Pasang game'),
    attrs: { type: 'button', title: tr('Pasang ke layar utama — bisa dibuka seperti aplikasi & dimainkan offline') },
    onClick: () => void this.install(),
  });
  private readonly stopInstallWatch: () => void;
  /** Ikon 📜 di pojok kanan atas untuk membuka lagi catatan pembaruan. */
  private readonly changelogButton = el('button', {
    className: 'changelog-btn',
    attrs: { type: 'button', title: tr('Apa yang baru (catatan pembaruan)'), 'aria-label': tr('Apa yang baru') },
    children: [el('span', { text: '📜', attrs: { 'aria-hidden': 'true' } }), el('span', { className: 'changelog-dot', attrs: { 'aria-hidden': 'true' } })],
    onClick: () => this.showChangelog(),
  });

  /** Tombol Akun di pojok kanan atas (sebelah 📜). */
  private readonly accountButton = el('button', {
    className: 'changelog-btn account-btn',
    attrs: { type: 'button', title: tr('Akun — simpan progres di akun'), 'aria-label': tr('Akun') },
    children: [el('span', { text: '👤', attrs: { 'aria-hidden': 'true' } }), el('span', { className: 'account-dot', attrs: { 'aria-hidden': 'true' } })],
    onClick: () => {
      if (this.actions.cloud) openAccountPanel(this.ui, this.actions.cloud);
    },
  });

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
      children: [icon('fullscreen'), el('span', { text: tr('Layar penuh') })],
      onClick: () => actions.onToggleFullscreen(),
    });
    const sound = el('button', {
      className: 'btn btn-secondary',
      text: tr('Pengaturan'),
      attrs: { type: 'button' },
      onClick: () => actions.onAudioSettings(),
    });
    const guide = el('button', {
      className: 'btn btn-secondary btn-guide',
      attrs: { type: 'button', title: tr('Info lengkap: cara main, event, cuaca, lokasi, pelanggan, menu, upgrade, bank, pencapaian') },
      children: [el('span', { text: '📖', attrs: { 'aria-hidden': 'true' } }), el('span', { text: tr('Panduan & Info') })],
      onClick: () => openGuide(this.ui, { catalog: CATALOG, centered: true }),
    });
    const about = el('button', {
      className: 'btn btn-secondary',
      text: tr('Tentang game'),
      attrs: { type: 'button' },
      onClick: () => this.showAbout(),
    });

    this.root = el('section', {
      className: 'main-menu',
      attrs: { 'aria-label': tr('Menu utama') },
      children: [
        el('div', {
          className: 'panel main-menu-panel',
          children: [
            el('h1', { className: 'visually-hidden', text: tr('{title} {subtitle}', { title: GAME_CONFIG.title, subtitle: GAME_CONFIG.subtitle }) }),
            title,
            el('p', { className: 'menu-subtitle', text: GAME_CONFIG.subtitle.toUpperCase() }),
            el('p', { className: 'menu-tagline', text: tr('Rintis angkringanmu dari nol — dari satu gerobak sampai jadi tujuan favorit warga.') }),
            this.actionsEl,
            this.saveInfo,
            this.minorActions,
          ],
        }),
        el('p', { className: 'menu-footer', text: tr('v{version} · {stage}', { version: GAME_CONFIG.version, stage: GAME_CONFIG.stage }) }),
        this.changelogButton,
        ...(this.actions.cloud?.available ? [this.accountButton] : []),
      ],
    });
    const cloud = this.actions.cloud;
    const leaderboard = cloud?.available
      ? el('button', {
          className: 'btn btn-secondary btn-guide',
          attrs: { type: 'button', title: tr('Peringkat pemain: hari terlama, pendapatan 1 hari, kas terbanyak') },
          children: [el('span', { text: '🏆', attrs: { 'aria-hidden': 'true' } }), el('span', { text: tr('Leaderboard') })],
          onClick: () => openLeaderboard(this.ui, cloud),
        })
      : null;
    this.minorActions.append(guide, ...(leaderboard ? [leaderboard] : []), fullscreen, sound, about);
    ui.layers.screen.append(this.root);
    this.renderSaveButtons();
    this.renderInstallButton();
    this.stopInstallWatch = onInstallModeChange(() => this.renderInstallButton());
    this.changelogButton.classList.toggle('has-new', hasUnseenChangelog());
    requestAnimationFrame(() => {
      this.root.classList.add('is-visible');
      (this.actionsEl.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
      // Muncul sendiri sekali setiap ada versi baru; setelah itu hanya lewat ikon 📜.
      if (hasUnseenChangelog() && !this.ui.hasOpenModal()) this.showChangelog();
    });
  }

  /** Tanda hijau di ikon akun saat sudah masuk. */
  setSignedIn(on: boolean): void {
    this.accountButton.classList.toggle('is-signed-in', on);
    this.accountButton.title = on ? tr('Akun — progres tersimpan di akun') : tr('Akun — masuk untuk menyimpan progres di akun');
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
          children: [el('span', { text: tr('Lanjutkan') }), el('small', { className: 'btn-sub', text: tr('Hari {day} · {money}', { day: save.day, money: formatRupiah(save.money) }) })],
          onClick: () => this.actions.onContinue(),
        }),
        el('button', {
          className: 'btn btn-secondary',
          text: tr('Mulai Baru'),
          attrs: { type: 'button' },
          onClick: () =>
            this.ui.openModal({
              title: tr('Mulai permainan baru?'),
              body: tr('Progres tersimpan (Hari {day}) akan ditimpa dan tidak bisa dikembalikan.', { day: save.day }),
              actions: [{ label: tr('Batal') }, { label: tr('Ya, mulai baru'), variant: 'danger', onClick: () => this.actions.onNewGame() }],
            }),
        }),
      );
    } else {
      buttons.push(
        el('button', {
          className: 'btn btn-primary btn-lg',
          text: tr('Mulai Bermain'),
          attrs: { type: 'button' },
          onClick: () => this.actions.onNewGame(),
        }),
      );
    }
    this.actionsEl.replaceChildren(...buttons);

    const info: (HTMLElement | string)[] = [];
    if (!this.actions.persistent) info.push(tr('Browser ini tidak mengizinkan penyimpanan — progres hilang saat halaman ditutup.'));
    if (save) {
      const del = el('button', {
        className: 'link-btn',
        text: tr('Hapus data simpanan'),
        attrs: { type: 'button' },
        onClick: () =>
          this.ui.openModal({
            title: tr('Hapus data simpanan?'),
            body: tr('Semua progres (uang, stok, menu terbuka) akan dihapus permanen.'),
            actions: [
              { label: tr('Batal') },
              {
                label: tr('Hapus permanen'),
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
      title: tr('Pasang ke layar utama'),
      body: el('div', {
        children: [
          el('ol', {
            className: 'about-list',
            children: [
              el('li', { text: tr('Buka game ini di Safari.') }),
              el('li', { text: tr('Ketuk tombol Bagikan (kotak dengan panah ke atas).') }),
              el('li', { text: tr('Pilih "Tambah ke Layar Utama", lalu ketuk "Tambah".') }),
            ],
          }),
          el('p', {
            className: 'modal-body muted',
            text: tr('Setelah itu buka game dari ikon di layar utama: tampil layar penuh dan tetap bisa dimainkan tanpa internet.'),
          }),
        ],
      }),
      actions: [{ label: tr('Mengerti'), variant: 'primary' }],
    });
  }

  private showChangelog(): void {
    openChangelog(this.ui);
    this.changelogButton.classList.remove('has-new');
  }

  private showAbout(): void {
    const controls = el('ul', {
      className: 'about-list',
      children: [
        el('li', { text: tr('Geser layar (mouse / satu jari) untuk menggeser kamera.') }),
        el('li', { text: tr('Scroll mouse atau cubit dua jari untuk zoom.') }),
        el('li', { text: tr('Keyboard: WASD / panah untuk geser, Q / E untuk zoom, F untuk fokus ke gerobak, B belanja, P persiapan, Esc untuk menu.') }),
        el('li', { text: tr('Progres tersimpan otomatis di browser ini.') }),
      ],
    });
    this.ui.openModal({
      title: tr('Tentang game'),
      body: el('div', {
        children: [
          el('p', {
            className: 'modal-body',
            text: tr('Kelola angkringan: belanja bahan, siapkan nasi kucing, sate, dan wedang, layani pelanggan, lalu kembangkan usahamu hari demi hari.'),
          }),
          el('h3', { className: 'modal-subtitle', text: tr('Kontrol') }),
          controls,
          el('p', { className: 'modal-body muted', text: tr('Versi {version} — {stage}. Semua aset adalah placeholder orisinal buatan prosedural.', { version: GAME_CONFIG.version, stage: GAME_CONFIG.stage }) }),
        ],
      }),
      actions: [{ label: tr('Tutup'), variant: 'primary' }],
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
