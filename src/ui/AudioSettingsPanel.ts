import { GRAPHICS, type GraphicsQuality } from '../config/graphicsSettings';
import type { AudioSystem } from '../audio/AudioSystem';
import type { AudioSettings } from '../audio/AudioSettings';
import { el } from './dom';
// import { analyticsAvailable, analyticsEnabled, setAnalyticsEnabled } from '../analytics/analytics';
import { UI_SETTINGS } from '../config/uiSettings';
import type { UIManager } from './UIManager';
import { changeLanguage, lang, LANGUAGES, tr, type Lang } from '../i18n/i18n';

const SLIDERS: readonly { key: 'music' | 'sfx' | 'ambience'; label: string }[] = [
  { key: 'music', label: tr('Musik') },
  { key: 'sfx', label: tr('Efek suara') },
  { key: 'ambience', label: tr('Suasana (jangkrik, hujan)') },
];

/**
 * Teks konfirmasi ganti bahasa ditulis dalam bahasa TUJUAN (bukan lewat `tr`): pemain yang memilih
 * bahasa itu pasti bisa membacanya, walaupun belum paham bahasa yang sedang aktif.
 */
const SWITCH_TEXT: Record<Lang, { title: string; body: string; ok: string; cancel: string }> = {
  id: {
    title: 'Ganti ke Bahasa Indonesia?',
    body: 'Game dimuat ulang supaya semua teks memakai bahasa baru. Progres disimpan dulu, lalu kamu kembali ke menu utama.',
    ok: 'Ganti bahasa',
    cancel: 'Batal',
  },
  en: {
    title: 'Switch to English?',
    body: 'The game will reload so all text uses the new language. Your progress is saved first, then you return to the main menu.',
    ok: 'Switch language',
    cancel: 'Cancel',
  },
};

/** Pilihan bahasa: radio Bahasa Indonesia / English. Memilih bahasa lain meminta konfirmasi lalu memuat ulang game. */
function languageRow(ui: UIManager, beforeReload?: () => void): HTMLElement {
  const inputs: HTMLInputElement[] = [];
  const row = el('div', {
    className: 'quality-row language-row',
    attrs: { role: 'radiogroup', 'aria-label': 'Bahasa · Language' },
    children: LANGUAGES.map((l) => {
      const input = el('input', { attrs: { type: 'radio', name: 'language', value: l.id, lang: l.id } }) as HTMLInputElement;
      input.checked = lang() === l.id;
      inputs.push(input);
      input.addEventListener('change', () => {
        if (!input.checked || l.id === lang()) return;
        const text = SWITCH_TEXT[l.id];
        const resetChoice = (): void => {
          for (const x of inputs) x.checked = x.value === lang();
        };
        ui.openModal({
          title: text.title,
          body: text.body,
          className: 'language-confirm',
          onClose: resetChoice,
          actions: [
            { label: text.cancel },
            { label: text.ok, variant: 'primary', onClick: () => changeLanguage(l.id, beforeReload) },
          ],
        });
      });
      return el('label', {
        className: 'check-row',
        children: [input, el('span', { text: l.label, attrs: { lang: l.id } })],
      });
    }),
  });
  return row;
}

/**
 * Panel Pengaturan: bahasa, volume musik/efek/suasana, kualitas grafis, tampilan. Tersimpan otomatis.
 * `beforeReload` dipanggil sebelum game dimuat ulang karena ganti bahasa (mis. simpan progres).
 */
export function openAudioSettings(ui: UIManager, audio: AudioSystem, onGraphics?: (lowPower: boolean) => void, beforeReload?: () => void): void {
  const s = audio.settings;
  const rows = SLIDERS.map(({ key, label }) => {
    const value = el('span', { className: 'slider-value', text: `${Math.round(s[key] * 100)}%` });
    const input = el('input', {
      className: 'volume-slider',
      attrs: { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(s[key] * 100)), 'aria-label': tr('Volume {label}', { label }) },
    }) as HTMLInputElement;
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      value.textContent = `${Math.round(v * 100)}%`;
      audio.update({ [key]: v } as Partial<AudioSettings>);
    });
    input.addEventListener('change', () => {
      if (key === 'sfx') audio.play('coin');
    });
    return el('label', { className: 'slider-row', children: [el('span', { text: label }), input, value] });
  });
  const mute = el('input', { attrs: { type: 'checkbox', 'aria-label': tr('Bisukan semua suara') } }) as HTMLInputElement;
  mute.checked = s.muted;
  mute.addEventListener('change', () => audio.update({ muted: mute.checked }));
  const qualities: readonly { id: GraphicsQuality; label: string; hint: string }[] = [
    { id: 'auto', label: tr('Otomatis'), hint: tr('dipilih dari kemampuan perangkat') },
    { id: 'tinggi', label: tr('Tinggi'), hint: tr('60 FPS, cahaya penuh') },
    { id: 'hemat', label: tr('Hemat baterai'), hint: tr('30 FPS, efek dikurangi') },
  ];
  const qualityRow = el('div', {
    className: 'quality-row',
    attrs: { role: 'radiogroup', 'aria-label': tr('Kualitas grafis') },
    children: qualities.map((q) => {
      const input = el('input', { attrs: { type: 'radio', name: 'quality', value: q.id } }) as HTMLInputElement;
      input.checked = GRAPHICS.quality === q.id;
      input.addEventListener('change', () => {
        GRAPHICS.set(q.id);
        onGraphics?.(GRAPHICS.lowPower);
      });
      return el('label', { className: 'check-row', children: [input, el('span', { text: q.label }), el('small', { className: 'muted', text: q.hint })] });
    }),
  });
  const auto = el('input', { attrs: { type: 'checkbox', role: 'switch', 'aria-label': tr('Gulir otomatis ke daftar persiapan') } }) as HTMLInputElement;
  auto.checked = UI_SETTINGS.autoScroll;
  auto.addEventListener('change', () => UI_SETTINGS.setAutoScroll(auto.checked));
  // const stats = el('input', { attrs: { type: 'checkbox', role: 'switch', 'aria-label': 'Kirim statistik anonim' } }) as HTMLInputElement;
  // stats.checked = analyticsEnabled();
  // stats.addEventListener('change', () => setAnalyticsEnabled(stats.checked));
  ui.openModal({
    title: tr('Pengaturan'),
    className: 'audio-modal',
    body: el('div', {
      className: 'audio-settings',
      children: [
        // Judul dua bahasa supaya bagian ini tetap ketemu walau pemain belum paham bahasa yang aktif.
        el('h3', { className: 'settings-heading', text: '🌐 Bahasa · Language' }),
        languageRow(ui, beforeReload),
        el('h3', { className: 'settings-heading', text: tr('Suara') }),
        ...rows,
        el('label', { className: 'check-row', children: [mute, el('span', { text: tr('Bisukan semua suara') })] }),
        el('h3', { className: 'settings-heading', text: tr('Grafis') }),
        qualityRow,
        el('h3', { className: 'settings-heading', text: tr('Tampilan') }),
        el('label', {
          className: 'check-row',
          children: [
            auto,
            el('span', { text: tr('Gulir otomatis') }),
            el('small', { className: 'muted', text: tr('setelah "+ Tambah" di Persiapan Dapur, layar pindah ke Daftar persiapan') }),
          ],
        }),
        // analyticsAvailable()
        //   ? el('label', {
        //       className: 'check-row',
        //       children: [
        //         stats,
        //         el('span', { text: 'Kirim statistik anonim' }),
        //         el('small', { className: 'muted', text: 'jumlah pemain, lama bermain & hasil hari (Google Analytics), tanpa data pribadi' }),
        //       ],
        //     })
        //   : null,
        audio.ready ? null : el('p', { className: 'panel-note muted', text: tr('Suara aktif setelah kamu menyentuh/klik layar.') }),
      ],
    }),
    actions: [{ label: tr('Selesai'), variant: 'primary' }],
  });
}
