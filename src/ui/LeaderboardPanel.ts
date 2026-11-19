import type { CloudSync } from '../cloud/CloudSync';
import type { ScoreField } from '../cloud/firebase';
import { formatRupiah, formatRupiahShort } from '../utils/formatting';
import { openAccountPanel } from './AccountPanel';
import { el } from './dom';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

const CATEGORIES: { id: ScoreField; label: string; short: string; desc: string; fmt: (v: number) => string; full: (v: number) => string }[] = [
  { id: 'longestDay', label: tr('Hari terlama'), short: tr('Hari'), desc: tr('Hari terjauh yang pernah dicapai.'), fmt: (v) => tr('Hari {v}', { v }), full: (v) => tr('Hari {v}', { v }) },
  { id: 'bestDayRevenue', label: tr('Pendapatan 1 hari'), short: tr('Pendapatan'), desc: tr('Pendapatan terbanyak dalam satu hari (toko + cabang).'), fmt: formatRupiahShort, full: formatRupiah },
  { id: 'bestDayProfit', label: tr('Laba 1 hari'), short: tr('Laba'), desc: tr('Laba bersih terbesar dalam satu hari.'), fmt: formatRupiahShort, full: formatRupiah },
  { id: 'worstDayLoss', label: tr('Rugi 1 hari'), short: tr('Rugi'), desc: tr('Kerugian terbesar dalam satu hari — siapa yang paling nekat?'), fmt: (v) => tr('−{v}', { v: formatRupiahShort(v) }), full: (v) => tr('−{v}', { v: formatRupiah(v) }) },
  { id: 'peakMoney', label: tr('Kas terbanyak'), short: tr('Kas'), desc: tr('Kas tertinggi saat tutup hari.'), fmt: formatRupiahShort, full: formatRupiah },
];

/** Kategori terakhir yang dibuka (diingat selama permainan berjalan). */
let current: ScoreField = 'longestDay';

/** Leaderboard: 3 kategori, 50 teratas, baris sendiri disorot + peringkatmu bila di luar 50 besar. */
export function openLeaderboard(ui: UIManager, cloud: CloudSync): void {
  const body = el('div', { className: 'lb' });
  const listEl = el('div', { className: 'lb-list', attrs: { 'aria-live': 'polite' } });
  const tabs = el('div', { className: 'shop-tabs lb-tabs', attrs: { role: 'tablist', 'aria-label': tr('Kategori leaderboard') } });
  const descEl = el('p', { className: 'lb-desc' });
  const footEl = el('div', { className: 'lb-foot' });
  let token = 0;

  const renderTabs = (): void => {
    tabs.replaceChildren(
      ...CATEGORIES.map((c) =>
        el('button', {
          className: `shop-tab${current === c.id ? ' is-active' : ''}`,
          text: c.label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(current === c.id) },
          onClick: () => {
            if (current === c.id) return;
            current = c.id;
            for (const b of tabs.querySelectorAll('button')) {
              const on = b.textContent === c.label;
              b.classList.toggle('is-active', on);
              b.setAttribute('aria-selected', String(on));
            }
            void load(false);
          },
        }),
      ),
    );
  };

  const footer = (rank: number | null, value: number | null, inTop: boolean): void => {
    const cat = CATEGORIES.find((c) => c.id === current)!;
    if (!cloud.user) {
      footEl.replaceChildren(
        el('span', { text: tr('Masuk akun & pilih username supaya rekormu ikut tampil.') }),
        el('button', { className: 'btn btn-primary btn-sm', text: tr('Masuk'), attrs: { type: 'button' }, onClick: () => openAccountPanel(ui, cloud) }),
      );
    } else if (cloud.needsUsername) {
      footEl.replaceChildren(
        el('span', { text: tr('Pilih username dulu supaya rekormu tampil.') }),
        el('button', { className: 'btn btn-primary btn-sm', text: tr('Pilih username'), attrs: { type: 'button' }, onClick: () => openAccountPanel(ui, cloud) }),
      );
    } else if (cloud.localTampered()) {
      footEl.replaceChildren(el('span', { className: 'is-bad', text: tr('Save di perangkat ini pernah diubah di luar game, jadi rekornya tidak dikirim ke leaderboard.') }));
    } else if (rank !== null && value !== null) {
      footEl.replaceChildren(
        el('span', { text: inTop ? tr('Kamu ada di 50 besar!') : tr('Peringkatmu') }),
        el('strong', { className: 'lb-me', text: tr('#{rank} · {value}', { rank, value: cat.full(value) }) }),
      );
    } else {
      footEl.replaceChildren(el('span', { text: tr('Rekormu terkirim otomatis setelah hari pertama selesai.') }));
    }
  };

  const load = async (tabsToo = true): Promise<void> => {
    const my = ++token;
    if (tabsToo) renderTabs();
    const cat = CATEGORIES.find((c) => c.id === current)!;
    descEl.textContent = cat.desc;
    listEl.replaceChildren(el('p', { className: 'muted lb-state', text: tr('Memuat peringkat…') }));
    footEl.replaceChildren();
    try {
      const { rows, mine, myRank } = await cloud.leaderboard(current);
      if (my !== token) return;
      const me = cloud.user?.uid;
      listEl.replaceChildren(
        ...(rows.length
          ? rows.map((r, i) =>
              el('div', {
                className: `lb-row${r.uid === me ? ' is-me' : ''}${i < 3 ? ` is-top is-top-${i + 1}` : ''}`,
                children: [
                  el('span', { className: 'lb-rank', text: String(i + 1) }),
                  el('span', { className: 'lb-name', text: tr('@{username}', { username: r.username }) }),
                  el('span', { className: 'lb-value', text: cat.fmt(r[current]), attrs: { title: cat.full(r[current]) } }),
                ],
              }),
            )
          : [el('p', { className: 'muted lb-state', text: tr('Belum ada yang masuk leaderboard. Jadilah yang pertama!') })]),
      );
      footer(myRank, mine ? mine[current] : null, Boolean(me && rows.some((r) => r.uid === me)));
    } catch (e) {
      if (my !== token) return;
      listEl.replaceChildren(
        el('p', { className: 'is-bad lb-state', text: tr('Peringkat tidak bisa dimuat: {e}', { e: cloud.errorText(e) }) }),
        el('button', { className: 'btn btn-secondary btn-sm', text: tr('Coba lagi'), attrs: { type: 'button' }, onClick: () => void load() }),
      );
    }
  };

  body.append(tabs, descEl, listEl, footEl);
  const off = cloud.onChange(() => void load());
  void load();
  ui.openModal({ title: tr('Leaderboard'), className: 'sheet sheet-leaderboard', closeButton: true, body, actions: [{ label: tr('Tutup') }], onClose: off });
}
