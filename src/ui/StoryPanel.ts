import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/GameState';
import { CHAPTERS, CHOICES, LAST_PAGE, NAMED_CUSTOMERS, choiceById, endingById, namedById, type ChoiceId } from '../data/story';
import {
  ACT_TITLES,
  ENDING_AFTER_DAYS,
  STAGE_POINTS,
  SUMMARY_AFTER_DAYS,
  choiceBlocker,
  currentAct,
  decisionAvailable,
  isChapterOpen,
  newsLog,
  relationOf,
  storyDay,
  unreadNews,
  unseenChapters,
} from '../systems/StorySystem';
import { portraitUrl } from './DialoguePanel';
import { el } from './dom';
import type { ModalHandle, UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/**
 * Panel "Kabar Kampung": log kabar, Buku Dapur Kardi, warga (tahap hubungan), dan keputusan.
 */

export type StoryTab = 'kabar' | 'buku' | 'warga' | 'keputusan';

const STATUS_LABEL = { belum_dibaca: tr('Belum dibaca'), dibaca: tr('Dibaca'), diringkas: tr('Didengar dari warga') } as const;
const STAGE_LABEL = [tr('Kenalan'), tr('Akrab'), tr('Dekat'), tr('Seperti keluarga')] as const;

/** Jumlah untuk lencana HUD: kabar belum dibaca + bab baru + keputusan menunggu. */
export function storyBadgeCount(state: Readonly<GameState>): number {
  return unreadNews(state).length + unseenChapters(state).length + (decisionAvailable(state) ? 1 : 0);
}

function hearts(stage: number): string {
  return '❤'.repeat(stage) + '♡'.repeat(3 - stage);
}

export function openStoryPanel(ctx: GameContext, ui: UIManager, initial: StoryTab = 'kabar'): ModalHandle {
  let tab: StoryTab = initial;
  let expanded: string | null = null;
  const tabs = el('div', { className: 'tab-row guide-tabs', attrs: { role: 'tablist', 'aria-label': tr('Kabar Kampung') } });
  const content = el('div', { className: 'guide-content story-content', attrs: { role: 'tabpanel' } });
  const where = el('span', { className: 'guide-where' });
  let handle: ModalHandle | null = null;

  const tabList = (s: Readonly<GameState>): { id: StoryTab; label: string; count: number }[] => [
    { id: 'kabar', label: tr('📰 Kabar'), count: unreadNews(s).length },
    { id: 'buku', label: tr('📖 Buku Dapur'), count: unseenChapters(s).length },
    { id: 'warga', label: tr('👥 Warga'), count: 0 },
    ...(decisionAvailable(s) || s.story.choice ? [{ id: 'keputusan' as StoryTab, label: tr('⚖️ Keputusan'), count: decisionAvailable(s) ? 1 : 0 }] : []),
  ];

  const render = (): void => {
    if (tab === 'buku') for (const id of unseenChapters(ctx.store.get())) ctx.actions.markChapterSeen(id);
    const s = ctx.store.get();
    where.textContent = tr('{0} · hari cerita ke-{s}', { 0: ACT_TITLES[currentAct(s)], s: storyDay(s) });
    tabs.replaceChildren(
      ...tabList(s).map((t) =>
        el('button', {
          className: `tab-btn${t.id === tab ? ' is-active' : ''}`,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(t.id === tab), 'data-tab': t.id },
          children: [el('span', { text: t.label }), t.count ? el('span', { className: 'tab-count', text: String(t.count) }) : null],
          onClick: () => {
            tab = t.id;
            render();
          },
        }),
      ),
    );
    content.replaceChildren(...(tab === 'kabar' ? renderNews(s) : tab === 'buku' ? renderBook(s) : tab === 'warga' ? renderPeople(s) : renderDecision(s)));
  };

  const renderNews = (s: Readonly<GameState>): HTMLElement[] => {
    const log = newsLog(s);
    if (!log.length) {
      return [el('p', { className: 'guide-text', text: tr('Belum ada kabar. Kabar datang lewat pelanggan bernama yang mampir saat berjualan — ketuk gelembung "..." di atas kepala mereka.') })];
    }
    return [
      el('p', { className: 'panel-note', text: tr('Kabar yang tidak dibaca selama {SUMMARY_AFTER_DAYS} hari akan didengar dari warga dalam bentuk ringkasan. Kabar penting (⭐) harus didengar dulu sebelum cerita berlanjut.', { SUMMARY_AFTER_DAYS }) }),
      ...log.map(({ def, rec }) => {
        const open = expanded === def.id;
        const who = namedById(def.speaker);
        const unread = rec.status === 'belum_dibaca';
        const body = open
          ? def.lines.map((t) => el('p', { className: 'guide-line story-line', text: tr('“{t}”', { t }) }))
          : [el('p', { className: 'guide-line story-summary', text: rec.status === 'belum_dibaca' ? tr('{name} ingin bercerita…', { name: who.name }) : def.summary })];
        return el('article', {
          className: `guide-card story-news${unread ? ' is-unread' : ''}${def.important ? ' is-important' : ''}`,
          children: [
            el('img', { className: 'story-avatar', attrs: { src: portraitUrl(def.speaker), alt: '' } }),
            el('div', {
              className: 'guide-card-body',
              children: [
                el('div', {
                  className: 'guide-card-head',
                  children: [
                    el('strong', { text: `${def.important ? '⭐ ' : ''}${def.title}` }),
                    el('span', { className: `guide-badge tone-${unread ? 'warn' : rec.status === 'dibaca' ? 'good' : 'info'}`, text: STATUS_LABEL[rec.status] }),
                  ],
                }),
                el('div', { className: 'item-meta', text: tr('{name} · Hari {receivedDay}', { name: who.name, receivedDay: rec.receivedDay }) }),
                ...body,
                el('button', {
                  className: 'btn btn-secondary btn-sm story-read',
                  text: open ? tr('Tutup') : unread ? tr('Baca') : rec.status === 'diringkas' ? tr('Baca lengkap') : tr('Baca lagi'),
                  attrs: { type: 'button' },
                  onClick: () => {
                    if (open) expanded = null;
                    else {
                      expanded = def.id;
                      if (rec.status !== 'dibaca') {
                        const res = ctx.actions.readNews(def.id);
                        if (res.ok && res.value) ctx.notify(tr('Saatnya mengambil keputusan. Lihat tab Keputusan.'), 'warning', 5000);
                      }
                    }
                    render();
                  },
                }),
              ],
            }),
          ],
        });
      }),
    ];
  };

  const renderBook = (s: Readonly<GameState>): HTMLElement[] => [
    el('p', { className: 'guide-text', text: tr('Buku tulisan tangan Sri, almarhumah istri Mbah Kardi. Setiap bab berisi satu resep dan satu kenangan.') }),
    ...CHAPTERS.map((c) => {
      const open = isChapterOpen(s, c.id);
      if (!open) {
        return el('article', {
          className: 'guide-card is-dim',
          children: [
            el('span', { className: 'guide-icon', text: '🔒', attrs: { 'aria-hidden': 'true' } }),
            el('div', { className: 'guide-card-body', children: [el('strong', { text: tr('Bab {id}', { id: c.id }) }), el('div', { className: 'item-meta', text: c.condition })] }),
          ],
        });
      }
      const last = c.id === 7 && s.story.ending ? LAST_PAGE[s.story.ending] : null;
      const recipe = c.recipeId ? ctx.catalog.recipe(c.recipeId) : null;
      const inMenu = recipe && s.unlockedRecipes.includes(recipe.id);
      return el('article', {
        className: 'guide-card story-chapter',
        children: [
          el('span', { className: 'guide-icon', text: '📖', attrs: { 'aria-hidden': 'true' } }),
          el('div', {
            className: 'guide-card-body',
            children: [
              el('div', { className: 'guide-card-head', children: [el('strong', { text: tr('Bab {id} · {title}', { id: c.id, title: c.title }) })] }),
              recipe ? el('div', { className: 'item-meta', text: tr('Resep: {name}{1}', { name: recipe.name, 1: inMenu ? tr(' (ada di menumu)') : tr(' (belum ada di menumu)') }) }) : null,
              c.recipeNote ? el('p', { className: 'guide-line story-recipe', text: c.recipeNote }) : null,
              el('p', { className: 'guide-line story-memory', text: last ?? c.memory }),
            ],
          }),
        ],
      });
    }),
  ];

  const renderPeople = (s: Readonly<GameState>): HTMLElement[] => [
    el('p', { className: 'guide-text', text: tr('Layani pelanggan bernama dengan baik, sediakan menu favoritnya, dan ajak mengobrol (sekali sehari) agar makin dekat. Kedekatan membuka cerita pribadi dan pilihan di akhir cerita.') }),
    ...NAMED_CUSTOMERS.filter((c) => c.id !== 'hendra' || s.story.news.hendra_tawaran).map((c) => {
      const r = relationOf(s, c.id);
      const nextPts = STAGE_POINTS[r.stage + 1];
      const met = r.lastVisitDay > 0;
      const favs = c.favorites.map((id) => ctx.catalog.recipe(id).name).join(', ');
      return el('article', {
        className: `guide-card${met ? '' : ' is-dim'}`,
        children: [
          el('img', { className: 'story-avatar', attrs: { src: portraitUrl(c.id), alt: '' } }),
          el('div', {
            className: 'guide-card-body',
            children: [
              el('div', {
                className: 'guide-card-head',
                children: [el('strong', { text: c.name }), el('span', { className: 'story-hearts', text: hearts(r.stage), attrs: { title: tr('Tahap {stage}', { stage: r.stage }) } }), el('span', { className: 'item-meta', text: STAGE_LABEL[r.stage] })],
              }),
              el('div', { className: 'item-meta', text: met ? c.role : tr('Belum pernah mampir') }),
              met ? el('div', { className: 'guide-line', text: nextPts !== undefined ? tr('Kedekatan {points}/{nextPts} menuju tahap {2} · {talks}× mengobrol', { points: r.points, nextPts, 2: r.stage + 1, talks: r.talks }) : tr('Kedekatan penuh · {talks}× mengobrol', { talks: r.talks }) }) : null,
              met ? el('div', { className: 'guide-line', text: tr('Menu favorit: {0}', { 0: r.stage >= 1 || c.id === 'gito' ? favs : tr('??? (makin akrab, makin tahu)') }) }) : null,
              met && r.stage >= 2 ? el('div', { className: 'guide-line', text: tr('Ingin: {want} · Takut: {fear}', { want: c.want, fear: c.fear }) }) : null,
            ],
          }),
        ],
      });
    }),
  ];

  const renderDecision = (s: Readonly<GameState>): HTMLElement[] => {
    if (s.story.choice) {
      const chosen = choiceById(s.story.choice);
      const left = ENDING_AFTER_DAYS - (s.calendar.day - s.story.choiceDay);
      return [
        el('article', {
          className: 'guide-card',
          children: [el('span', { className: 'guide-icon', text: '⚖️' }), el('div', { className: 'guide-card-body', children: [el('strong', { text: tr('Pilihanmu: {title}', { title: chosen.title }) }), el('p', { className: 'guide-line', text: chosen.text })] })],
        }),
        el('p', {
          className: 'guide-text',
          text: s.story.ending
            ? tr('Cerita sudah mencapai akhir: {title}. Bab 7 Buku Dapur terbuka. Permainan tetap berlanjut dalam mode bebas.', { title: endingById(s.story.ending).title })
            : tr('Kabar akhirnya akan datang dalam {0} hari.', { 0: Math.max(1, left) }),
        }),
      ];
    }
    const selling = s.phase === 'berjualan';
    return [
      el('p', { className: 'guide-text', text: tr('Pak Hendra menunggu jawabanmu. Pilihan ini menentukan akhir cerita dan tidak bisa diubah. Ambil keputusan kapan pun kamu siap — permainan tidak akan menunggu, tapi ceritanya menunggu.') }),
      selling ? el('p', { className: 'panel-note', text: tr('Keputusan bisa diambil saat persiapan atau setelah tutup.') }) : null,
      ...CHOICES.map((c) => {
        const blocker = choiceBlocker(s, c.id);
        return el('article', {
          className: `guide-card story-choice${blocker ? ' is-dim' : ''}`,
          children: [
            el('div', {
              className: 'guide-card-body',
              children: [
                el('strong', { text: c.title }),
                el('p', { className: 'guide-line', text: c.text }),
                el('div', { className: 'item-meta', text: tr('Syarat: {requirement}', { requirement: c.requirement }) }),
                el('div', { className: 'item-meta', text: tr('Akibat: {effects}', { effects: c.effects }) }),
                blocker ? el('div', { className: 'guide-line story-blocker', text: blocker }) : null,
                el('button', {
                  className: 'btn btn-primary btn-sm',
                  text: tr('Pilih ini'),
                  attrs: { type: 'button', ...(blocker || selling ? { disabled: '' } : {}) },
                  onClick: () => confirmChoice(c.id),
                }),
              ],
            }),
          ],
        });
      }),
    ].filter((x): x is HTMLElement => x !== null);
  };

  const confirmChoice = (id: ChoiceId): void => {
    const c = choiceById(id);
    ui.openModal({
      title: c.title,
      body: el('div', {
        children: [el('p', { className: 'modal-body', text: c.text }), el('p', { className: 'modal-body muted', text: tr('Akibat: {effects}. Pilihan ini tidak bisa diubah.', { effects: c.effects }) })],
      }),
      actions: [
        { label: tr('Pikirkan lagi') },
        {
          label: tr('Ya, ini keputusanku'),
          variant: 'primary',
          onClick: () => {
            const res = ctx.actions.chooseEnding(id);
            ctx.notify(res.message, res.ok ? 'success' : 'error', 5000);
            render();
          },
        },
      ],
    });
  };

  const off = ctx.bus.on('state:changed', () => {
    if (handle) render();
  });
  render();
  handle = ui.openModal({
    title: tr('Kabar Kampung'),
    className: 'sheet sheet-guide sheet-story',
    closeButton: true,
    headerExtra: where,
    body: el('div', { className: 'guide-body', children: [tabs, content] }),
    actions: [],
    onClose: () => {
      off();
      handle = null;
    },
  });
  return handle;
}

