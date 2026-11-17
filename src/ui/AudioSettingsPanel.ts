import { GRAPHICS, type GraphicsQuality } from '../config/graphicsSettings';
import type { AudioSystem } from '../audio/AudioSystem';
import type { AudioSettings } from '../audio/AudioSettings';
import { el } from './dom';
import { analyticsAvailable, analyticsEnabled, setAnalyticsEnabled } from '../analytics/analytics';
import { UI_SETTINGS } from '../config/uiSettings';
import type { UIManager } from './UIManager';

const SLIDERS: readonly { key: 'music' | 'sfx' | 'ambience'; label: string }[] = [
  { key: 'music', label: 'Musik' },
  { key: 'sfx', label: 'Efek suara' },
  { key: 'ambience', label: 'Suasana (jangkrik, hujan)' },
];

/** Panel pengaturan suara: volume musik/efek/suasana + bisukan semua. Tersimpan otomatis. */
export function openAudioSettings(ui: UIManager, audio: AudioSystem, onGraphics?: (lowPower: boolean) => void): void {
  const s = audio.settings;
  const rows = SLIDERS.map(({ key, label }) => {
    const value = el('span', { className: 'slider-value', text: `${Math.round(s[key] * 100)}%` });
    const input = el('input', {
      className: 'volume-slider',
      attrs: { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(s[key] * 100)), 'aria-label': `Volume ${label}` },
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
  const mute = el('input', { attrs: { type: 'checkbox', 'aria-label': 'Bisukan semua suara' } }) as HTMLInputElement;
  mute.checked = s.muted;
  mute.addEventListener('change', () => audio.update({ muted: mute.checked }));
  const qualities: readonly { id: GraphicsQuality; label: string; hint: string }[] = [
    { id: 'auto', label: 'Otomatis', hint: 'dipilih dari kemampuan perangkat' },
    { id: 'tinggi', label: 'Tinggi', hint: '60 FPS, cahaya penuh' },
    { id: 'hemat', label: 'Hemat baterai', hint: '30 FPS, efek dikurangi' },
  ];
  const qualityRow = el('div', {
    className: 'quality-row',
    attrs: { role: 'radiogroup', 'aria-label': 'Kualitas grafis' },
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
  const auto = el('input', { attrs: { type: 'checkbox', role: 'switch', 'aria-label': 'Gulir otomatis ke daftar persiapan' } }) as HTMLInputElement;
  auto.checked = UI_SETTINGS.autoScroll;
  auto.addEventListener('change', () => UI_SETTINGS.setAutoScroll(auto.checked));
  // const stats = el('input', { attrs: { type: 'checkbox', role: 'switch', 'aria-label': 'Kirim statistik anonim' } }) as HTMLInputElement;
  // stats.checked = analyticsEnabled();
  // stats.addEventListener('change', () => setAnalyticsEnabled(stats.checked));
  ui.openModal({
    title: 'Pengaturan',
    className: 'audio-modal',
    body: el('div', {
      className: 'audio-settings',
      children: [
        el('h3', { className: 'settings-heading', text: 'Suara' }),
        ...rows,
        el('label', { className: 'check-row', children: [mute, el('span', { text: 'Bisukan semua suara' })] }),
        el('h3', { className: 'settings-heading', text: 'Grafis' }),
        qualityRow,
        el('h3', { className: 'settings-heading', text: 'Tampilan' }),
        el('label', {
          className: 'check-row',
          children: [
            auto,
            el('span', { text: 'Gulir otomatis' }),
            el('small', { className: 'muted', text: 'setelah "+ Tambah" di Persiapan Dapur, layar pindah ke Daftar persiapan' }),
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
        audio.ready ? null : el('p', { className: 'panel-note muted', text: 'Suara aktif setelah kamu menyentuh/klik layar.' }),
      ],
    }),
    actions: [{ label: 'Selesai', variant: 'primary' }],
  });
}
