import type { CloudSync } from '../cloud/CloudSync';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { locale, tr } from '../i18n/i18n';

/**
 * Panel Akun: login Google / email agar progres tersimpan di akun dan bisa dilanjutkan di perangkat lain.
 * Tanpa login, permainan tetap menyimpan di perangkat ini saja.
 */
export function openAccountPanel(ui: UIManager, cloud: CloudSync): void {
  const body = el('div', { className: 'account' });
  let mode: 'masuk' | 'daftar' = 'masuk';
  let busy = false;
  let editingName = false;
  let message: { text: string; bad: boolean } | null = null;

  const run = async (fn: () => Promise<void>, ok?: string): Promise<void> => {
    if (busy) return;
    busy = true;
    message = null;
    render();
    try {
      await fn();
      if (ok) message = { text: ok, bad: false };
    } catch (e) {
      message = { text: cloud.errorText(e), bad: true };
    } finally {
      busy = false;
      render();
    }
  };

  const note = (): HTMLElement | null => (message ? el('p', { className: `account-msg${message.bad ? ' is-bad' : ''}`, text: message.text, attrs: { role: 'status' } }) : null);

  const loggedOut = (): HTMLElement[] => {
    const email = el('input', { className: 'account-input', attrs: { type: 'email', autocomplete: 'email', placeholder: tr('email@contoh.com'), 'aria-label': tr('Email'), required: '' } }) as HTMLInputElement;
    const pass = el('input', {
      className: 'account-input',
      attrs: { type: 'password', autocomplete: mode === 'daftar' ? 'new-password' : 'current-password', placeholder: mode === 'daftar' ? tr('Kata sandi (min. 6 karakter)') : tr('Kata sandi'), 'aria-label': tr('Kata sandi'), required: '', minlength: '6' },
    }) as HTMLInputElement;
    const form = el('form', {
      className: 'account-form',
      children: [
        email,
        pass,
        el('button', { className: 'btn btn-primary', text: busy ? tr('Memproses…') : mode === 'daftar' ? tr('Daftar') : tr('Masuk'), attrs: { type: 'submit', ...(busy ? { disabled: '' } : {}) } }),
      ],
    }) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void run(() => cloud.signInEmail(email.value.trim(), pass.value, mode === 'daftar'));
    });
    const nodes: (HTMLElement | null)[] = [
      el('p', { className: 'guide-text', text: tr('Masuk supaya progres tersimpan di akun dan bisa dilanjutkan di HP atau komputer lain. Tidak wajib — tanpa akun, progres tetap tersimpan di perangkat ini.') }),
      el('button', {
        className: 'btn account-google',
        attrs: { type: 'button', ...(busy ? { disabled: '' } : {}) },
        children: [el('span', { className: 'account-g', text: 'G', attrs: { 'aria-hidden': 'true' } }), el('span', { text: tr('Masuk dengan Google') })],
        onClick: () => void run(() => cloud.signInGoogle()),
      }),
      el('div', { className: 'account-or', text: tr('atau dengan email') }),
      el('div', {
        className: 'account-switch',
        attrs: { role: 'tablist' },
        children: (['masuk', 'daftar'] as const).map((m) =>
          el('button', {
            className: `stats-tab${mode === m ? ' is-active' : ''}`,
            text: m === 'masuk' ? tr('Masuk') : tr('Daftar baru'),
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(mode === m) },
            onClick: () => {
              mode = m;
              message = null;
              render();
            },
          }),
        ),
      }),
      form,
      mode === 'masuk'
        ? el('button', {
            className: 'link-btn account-forgot',
            text: tr('Lupa kata sandi?'),
            attrs: { type: 'button' },
            onClick: () => {
              if (!email.value.trim()) {
                message = { text: tr('Isi email dulu, lalu tekan "Lupa kata sandi?" lagi.'), bad: true };
                render();
                return;
              }
              void run(() => cloud.resetPassword(email.value.trim()), tr('Tautan reset kata sandi dikirim ke {0}. Cek juga folder spam.', { 0: email.value.trim() }));
            },
          })
        : null,
    ];
    return nodes.filter((n): n is HTMLElement => n !== null);
  };

  /** Pilih / ganti username (tampil di leaderboard). */
  const usernameBlock = (): HTMLElement => {
    const p = cloud.profile;
    if (!p) return el('p', { className: 'muted account-small', text: tr('Memuat profil…') });
    const need = !p.username;
    const cooldown = cloud.usernameCooldownDays;
    if (!need && !editingName) {
      return el('div', {
        className: 'account-name',
        children: [
          el('div', { className: 'account-who', children: [el('span', { className: 'muted', text: tr('Username (tampil di leaderboard)') }), el('strong', { text: tr('@{username}', { username: p.username }) })] }),
          el('button', {
            className: 'btn btn-secondary btn-sm',
            text: cooldown ? tr('Ganti ({cooldown} hari lagi)', { cooldown }) : tr('Ganti'),
            attrs: { type: 'button', ...(cooldown || busy ? { disabled: '' } : {}) },
            onClick: () => {
              editingName = true;
              render();
            },
          }),
        ],
      });
    }
    const input = el('input', {
      className: 'account-input',
      attrs: { type: 'text', autocomplete: 'nickname', maxlength: '16', placeholder: tr('mis. juragan_sate'), 'aria-label': tr('Username'), value: p.username, autocapitalize: 'off', spellcheck: 'false' },
    }) as HTMLInputElement;
    const form = el('form', {
      className: 'account-form',
      children: [
        el('label', { className: 'account-label', text: need ? tr('Pilih username untuk leaderboard') : tr('Username baru') }),
        input,
        el('span', { className: 'muted account-small', text: tr('3–16 karakter: huruf, angka, garis bawah. Tidak bisa dipakai pemain lain. Bisa diganti 30 hari sekali.') }),
        el('div', {
          className: 'account-actions',
          children: ([
            need ? null : el('button', { className: 'btn btn-secondary', text: tr('Batal'), attrs: { type: 'button' }, onClick: () => { editingName = false; message = null; render(); } }),
            el('button', { className: 'btn btn-primary', text: busy ? tr('Menyimpan…') : tr('Simpan username'), attrs: { type: 'submit', ...(busy ? { disabled: '' } : {}) } }),
          ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null),
        }),
      ],
    }) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      void run(async () => {
        await cloud.setUsername(name);
        editingName = false;
      }, tr('Username @{name} tersimpan.', { name }));
    });
    if (need) queueMicrotask(() => input.focus());
    return el('div', { className: `account-name-edit${need ? ' is-required' : ''}`, children: [form] });
  };

  const loggedIn = (): HTMLElement[] => {
    const u = cloud.user!;
    const status =
      cloud.status === 'syncing'
        ? tr('Menyinkronkan…')
        : cloud.status === 'error'
          ? tr('Gagal sinkron: {0}', { 0: cloud.lastError ?? '' })
          : cloud.lastSync
            ? tr('Tersimpan di akun {0}', { 0: new Date(cloud.lastSync).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })
            : tr('Siap menyimpan ke akun');
    return [
      el('div', {
        className: 'account-card',
        children: [
          el('span', { className: 'account-avatar', text: (u.name ?? u.email ?? '?').charAt(0).toUpperCase(), attrs: { 'aria-hidden': 'true' } }),
          el('div', {
            className: 'account-who',
            children: [el('strong', { text: u.name ?? u.email ?? tr('Pemain') }), el('span', { className: 'muted', text: `${u.email ?? ''} · ${u.provider === 'google' ? 'Google' : tr('Email')}` })],
          }),
        ],
      }),
      usernameBlock(),
      el('p', { className: `account-msg${cloud.status === 'error' ? ' is-bad' : ''}`, text: status, attrs: { role: 'status' } }),
      el('p', { className: 'guide-text', text: tr('Progres otomatis disimpan ke akun selama bermain dan saat kembali ke menu. Di perangkat lain, cukup masuk dengan akun yang sama.') }),
      el('div', {
        className: 'account-actions',
        children: [
          el('button', { className: 'btn btn-secondary', text: tr('Simpan ke akun sekarang'), attrs: { type: 'button', ...(busy ? { disabled: '' } : {}) }, onClick: () => void run(async () => void (await cloud.upload(true)), tr('Progres disimpan ke akun.')) }),
          el('button', { className: 'btn btn-secondary', text: tr('Keluar akun'), attrs: { type: 'button', ...(busy ? { disabled: '' } : {}) }, onClick: () => void run(() => cloud.signOut(), tr('Sudah keluar. Progres tetap ada di perangkat ini.')) }),
        ],
      }),
    ];
  };

  const render = (): void => {
    const nodes = cloud.user ? loggedIn() : loggedOut();
    const n = note();
    body.replaceChildren(...nodes, ...(n ? [n] : []));
  };

  const off = cloud.onChange(() => {
    if (cloud.user) message = null;
    render();
  });
  void cloud.load().catch(() => {
    message = { text: tr('Tidak bisa memuat layanan akun. Cek koneksi internet.'), bad: true };
    render();
  });
  render();
  ui.openModal({ title: tr('Akun'), className: 'sheet sheet-account', closeButton: true, body, actions: [{ label: tr('Tutup') }], onClose: off });
}
