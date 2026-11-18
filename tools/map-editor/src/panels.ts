/**
 * Isi panel kanan: Sunting (opsi alat & properti pilihan), Peta, Lokasi, Cek.
 */
import customersRaw from '../../../src/data/customers.json';
import upgradesRaw from '../../../src/data/upgrades.json';
import { isCustomObjectTypeId, listObjectTypeIds, objectType, type ObjectTypeId } from '../../../src/world/objectTypes';
import { TERRAINS } from '../../../src/world/terrain';
import { deleteSelection, duplicateSelection, finishDraft } from './actions';
import { objectThumb, terrainSwatch } from './art';
import { field, fmt, h, numberInput, select, textInput } from './dom';
import { formatClock, parseClock } from './locationsFile';
import { WEEKDAYS, type LocationDraft } from './locationDraft';
import { TERRAIN_IDS, round, type EObject } from './model';
import { selPoint, type AnchorMode, type EditorState, type Sel } from './state';
import type { Issue, IssueRef } from './validate';
import { COLORS } from './viewport';

type RawUpgrade = { id: string; name: string; effects?: { seats?: number } };
const RAW_UPGRADES = (upgradesRaw as { upgrades: RawUpgrade[] }).upgrades;
export const UPGRADES: { id: string; name: string }[] = RAW_UPGRADES.map((u) => ({ id: u.id, name: u.name }));
/** Upgrade yang menambah kursi: id → jumlah kursi yang dijanjikan. */
export const SEAT_UPGRADES = new Map(RAW_UPGRADES.flatMap((u) => (u.effects?.seats ? [[u.id, u.effects.seats] as const] : [])));
const CUSTOMER_TYPES: { id: string; name: string }[] = (customersRaw as { types: { id: string; name: string }[] }).types.map((t) => ({
  id: t.id,
  name: t.name,
}));

type Out = (Node | null | undefined | false)[];
const clean = (list: Out): Node[] => list.filter((n): n is Node => !!n);

export interface PanelHooks {
  status(msg: string, error?: boolean): void;
  centerOn(p: { x: number; y: number }): void;
  openResize(): void;
  locationChanged(): void;
  selectIssue(ref: IssueRef): void;
  /** Buka studio objek (null = objek baru). */
  openStudio(editId: string | null): void;
}

const requiresOptions = (value: string | undefined): { value: string; label: string }[] => {
  const list = [{ value: '', label: 'Selalu ada' }, ...UPGRADES.map((u) => ({ value: u.id, label: `Upgrade: ${u.name}` }))];
  if (value && !UPGRADES.some((u) => u.id === value)) list.push({ value, label: `(tak dikenal) ${value}` });
  return list;
};

const ANCHOR_MODES: { mode: AnchorMode; label: string; color: string; help: string }[] = [
  {
    mode: 'seat',
    label: 'Kursi',
    color: COLORS.seat,
    help: 'Klik tempat duduk, lalu klik jalur dari Pintu masuk ke kursi itu secara berurutan. Enter / klik kanan untuk selesai.',
  },
  { mode: 'spawn', label: 'Jalur datang', color: COLORS.spawn, help: 'Klik dari tepi/luar peta menuju Pintu masuk. Enter / klik kanan untuk selesai.' },
  { mode: 'queue', label: 'Antrean', color: COLORS.queue, help: 'Klik titik antre berurutan, dari depan gerobak ke belakang.' },
  { mode: 'lot', label: 'Pintu masuk', color: COLORS.lot, help: 'Titik di trotoar depan angkringan, tempat pelanggan masuk area.' },
  { mode: 'camera', label: 'Kamera', color: COLORS.camera, help: 'Titik fokus kamera saat game dibuka (biasanya gerobak).' },
];

export function anchorHelp(mode: AnchorMode): string {
  return ANCHOR_MODES.find((m) => m.mode === mode)?.help ?? '';
}

// ======================================================================= Sunting

export function renderEditPane(pane: HTMLElement, state: EditorState, hooks: PanelHooks): void {
  const parts =
    state.tool === 'select'
      ? selectionPanel(state, hooks)
      : state.tool === 'terrain'
        ? terrainPanel(state)
        : state.tool === 'object'
          ? objectPanel(state, hooks)
          : anchorPanel(state, hooks);
  pane.replaceChildren(...clean(parts));
}

function terrainPanel(state: EditorState): Out {
  const modes = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Cara mengecat' },
    ...(
      [
        ['brush', 'Kuas'],
        ['rect', 'Kotak'],
        ['fill', 'Ember'],
      ] as const
    ).map(([m, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(state.brushMode === m), onclick: () => ((state.brushMode = m), state.emit('tool')) }, label),
    ),
  );
  const size =
    state.brushMode === 'brush'
      ? h(
          'div',
          { class: 'seg', role: 'group', 'aria-label': 'Ukuran kuas' },
          ...[1, 2, 3, 5].map((n) =>
            h(
              'button',
              { type: 'button', 'aria-pressed': String(state.brushSize === n), onclick: () => ((state.brushSize = n), state.emit('tool')) },
              `${n}×${n}`,
            ),
          ),
        )
      : null;
  const swatches = h(
    'div',
    { class: 'swatches', role: 'group', 'aria-label': 'Jenis tanah' },
    ...TERRAIN_IDS.map((t) => {
      const c = h('canvas', { width: 32, height: 22, 'aria-hidden': 'true' });
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const sw = terrainSwatch(t);
        ctx.drawImage(sw, 0, 0, sw.width, Math.min(sw.height, 22), 0, 0, 32, Math.min(sw.height, 22));
      }
      return h(
        'button',
        { type: 'button', class: 'swatch', 'aria-pressed': String(state.brush === t), onclick: () => ((state.brush = t), state.emit('tool')) },
        c,
        TERRAINS[t].label,
      );
    }),
  );
  return [
    h('h2', {}, 'Cat tanah'),
    modes,
    size,
    swatches,
    h(
      'p',
      { class: 'help' },
      'Klik kanan (atau Alt+klik) pada peta untuk mengambil jenis tanah. Trotoar 2 piksel lebih tinggi dari jalan; marka tepi jalan muncul otomatis.',
    ),
  ];
}

function objectPanel(state: EditorState, hooks: PanelHooks): Out {
  const def = objectType(state.objType);
  const search = h('input', { type: 'search', placeholder: 'Cari objek…', 'aria-label': 'Cari objek' });
  const grid = h('div', { class: 'obj-grid', role: 'group', 'aria-label': 'Jenis objek' });
  const customGrid = h('div', { class: 'obj-grid', role: 'group', 'aria-label': 'Objek buatanmu' });
  const card = (id: ObjectTypeId): HTMLElement => {
    const d = objectType(id);
    return h(
      'button',
      {
        type: 'button',
        class: 'obj-card',
        'aria-pressed': String(state.objType === id),
        title: `${d.label} (${id}) · alas ${fmt(d.footprint.w / 16)}×${fmt(d.footprint.d / 16)} ubin`,
        onclick: () => {
          state.objType = id;
          state.objVariant = d.variants[0] as string;
          state.emit('tool');
        },
      },
      objectThumb(id, d.variants[0] as string, 48),
      d.label,
    );
  };
  const fill = (q: string): void => {
    const match = (id: ObjectTypeId): boolean => objectType(id).label.toLowerCase().includes(q.toLowerCase()) || id.includes(q.toLowerCase());
    const ids = listObjectTypeIds().filter(match);
    customGrid.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'obj-card obj-new', onclick: () => hooks.openStudio(null) },
        h('span', { class: 'obj-plus', 'aria-hidden': 'true' }, '+'),
        'Objek baru',
      ),
      ...ids.filter(isCustomObjectTypeId).map(card),
    );
    grid.replaceChildren(...ids.filter((id) => !isCustomObjectTypeId(id)).map(card));
    if (!grid.childElementCount) grid.append(h('p', { class: 'empty' }, 'Tidak ada objek bawaan yang cocok.'));
  };
  search.addEventListener('input', () => fill(search.value.trim()));
  fill('');
  return [
    h('h2', {}, `Pasang: ${def.label}`),
    h(
      'p',
      { class: 'help' },
      `Alas ${fmt(def.footprint.w / 16)}×${fmt(def.footprint.d / 16)} ubin · ${def.blocking ? 'menghalangi jalan' : 'bisa dilewati'}. Klik peta untuk memasang, berkali-kali. Pindahkan dengan alat Pilih (V).`,
    ),
    def.variants.length > 1
      ? field(
          'Varian',
          select(
            def.variants.map((v) => ({ value: v, label: v })),
            state.objVariant,
            (v) => ((state.objVariant = v), state.emit('tool')),
          ),
        )
      : null,
    field(
      'Muncul',
      select(requiresOptions(state.objRequires), state.objRequires, (v) => (state.objRequires = v)),
      'Objek upgrade hanya tampil setelah pemain membeli upgrade itu.',
    ),
    def.custom
      ? h(
          'div',
          { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => hooks.openStudio(state.objType) }, 'Edit gambar objek ini'),
        )
      : null,
    search,
    h('h3', {}, 'Objek buatanmu'),
    customGrid,
    h('p', { class: 'help' }, 'Gambar sendiri, impor PNG, atau buat dari deskripsi.'),
    h('h3', {}, 'Objek bawaan'),
    grid,
  ];
}

function anchorPanel(state: EditorState, hooks: PanelHooks): Out {
  const c = state.map.customers;
  const modes = h(
    'div',
    { class: 'seg seg-grid', role: 'group', 'aria-label': 'Jenis titik' },
    ...ANCHOR_MODES.map((m) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(state.anchorMode === m.mode),
          onclick: () => {
            state.anchorMode = m.mode;
            state.draft = null;
            state.emit('tool');
          },
        },
        h('span', { class: 'dot', style: `background:${m.color}`, 'aria-hidden': 'true' }),
        m.label,
      ),
    ),
  );

  const draftNote = state.draft
    ? h(
        'div',
        { class: 'card' },
        h(
          'p',
          { style: 'margin:0 0 6px' },
          state.draft.kind === 'spawn'
            ? `Sedang menggambar jalur "${c.spawns[state.draft.s]?.id ?? ''}". Klik titik berikutnya.`
            : `Sedang menggambar jalur kursi "${c.seats[state.draft.s]?.id ?? ''}". Klik dari Pintu masuk menuju kursi.`,
        ),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => hooks.status(finishDraft(state)) }, 'Selesai menggambar (Enter)'),
      )
    : null;

  // Kartu detail untuk kursi / jalur yang sedang dipilih.
  const focus = state.selection.length === 1 ? state.selection[0]! : null;
  let detail: HTMLElement | null = null;
  if (focus && (focus.k === 'seat' || focus.k === 'approach') && c.seats[focus.s]) detail = seatCard(state, focus.s, hooks);
  if (focus && focus.k === 'spawnPt' && c.spawns[focus.s]) detail = spawnCard(state, focus.s, hooks);

  const row = (
    sel: Sel,
    color: string,
    label: string,
    meta: string,
    p: { x: number; y: number } | null,
    tags: (string | undefined)[] = [],
    warn = false,
  ): HTMLElement =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'list-item',
          disabled: p === null,
          'aria-current': String(state.isSelected(sel)),
          onclick: () => {
            if (!p) return;
            state.select([sel]);
            hooks.centerOn(p);
          },
        },
        h('span', { class: 'dot', style: `background:${color}`, 'aria-hidden': 'true' }),
        label,
        ...tags.filter((t): t is string => !!t).map((t) => h('span', { class: 'tag' }, t)),
        h('span', { class: warn ? 'meta meta-warn' : 'meta' }, meta),
      ),
    );

  return [
    h('h2', {}, 'Titik pelanggan'),
    modes,
    h('p', { class: 'help' }, anchorHelp(state.anchorMode)),
    draftNote,
    detail,
    h('h3', {}, 'Titik tunggal'),
    h(
      'ul',
      { class: 'list' },
      row({ k: 'lot' }, COLORS.lot, 'Pintu masuk', c.lotEntry ? `${fmt(c.lotEntry.x)}, ${fmt(c.lotEntry.y)}` : 'belum dipasang', c.lotEntry, [], !c.lotEntry),
      row({ k: 'camera' }, COLORS.camera, 'Kamera', `${fmt(state.map.cameraHome.x)}, ${fmt(state.map.cameraHome.y)}`, state.map.cameraHome),
    ),
    h('h3', {}, `Kursi (${c.seats.length})`),
    c.seats.length
      ? h(
          'ul',
          { class: 'list' },
          ...c.seats.map((s, i) =>
            row(
              { k: 'seat', s: i },
              COLORS.seat,
              s.id,
              s.approach.length ? `${s.approach.length} titik jalur` : 'tanpa jalur',
              s,
              [s.requires],
              s.approach.length === 0,
            ),
          ),
        )
      : h('p', { class: 'empty' }, 'Belum ada kursi. Pilih "Kursi" lalu klik peta.'),
    h('h3', {}, `Jalur datang (${c.spawns.length})`),
    c.spawns.length
      ? h(
          'ul',
          { class: 'list' },
          ...c.spawns.map((s, i) => row({ k: 'spawnPt', s: i, i: 0 }, COLORS.spawn, s.id, `${s.path.length} titik`, s.path[0] ?? null)),
        )
      : h('p', { class: 'empty' }, 'Belum ada jalur. Pilih "Jalur datang" lalu klik dari tepi peta.'),
    h('h3', {}, `Antrean (${c.queue.length})`),
    c.queue.length
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small btn-danger',
            onclick: () => {
              state.select(c.queue.map((_, i) => ({ k: 'queue', i }) as Sel));
              hooks.status(`${deleteSelection(state)} titik antrean dihapus.`);
            },
          },
          'Hapus semua titik antrean',
        )
      : h('p', { class: 'empty' }, 'Belum ada titik antrean.'),
  ];
}

function seatCard(state: EditorState, i: number, hooks: PanelHooks): HTMLElement {
  const s = state.map.customers.seats[i]!;
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'dot', style: `background:${COLORS.seat}`, 'aria-hidden': 'true' }), h('strong', {}, 'Kursi terpilih')),
    field(
      'Id kursi',
      textInput(s.id, (v) => renameSeat(state, i, v, hooks)),
    ),
    field(
      'Muncul',
      select(requiresOptions(s.requires), s.requires ?? '', (v) => editSeat(state, i, (seat) => (v ? (seat.requires = v) : delete seat.requires))),
    ),
    h(
      'p',
      { class: 'help', style: 'margin:0 0 6px' },
      `(${fmt(s.x)}, ${fmt(s.y)}) · ${s.approach.length ? `${s.approach.length} titik jalur` : 'belum ada jalur'}`,
    ),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => redrawApproach(state, i, hooks) }, 'Gambar ulang jalur'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small btn-danger',
          onclick: () => (state.select([{ k: 'seat', s: i }]), hooks.status(`${deleteSelection(state)} kursi dihapus.`)),
        },
        'Hapus kursi',
      ),
    ),
  );
}

function spawnCard(state: EditorState, i: number, hooks: PanelHooks): HTMLElement {
  const s = state.map.customers.spawns[i]!;
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'dot', style: `background:${COLORS.spawn}`, 'aria-hidden': 'true' }),
      h('strong', {}, 'Jalur datang terpilih'),
    ),
    field(
      'Id jalur',
      textInput(s.id, (v) => renameSpawn(state, i, v, hooks)),
    ),
    h('p', { class: 'help', style: 'margin:0 0 6px' }, `${s.path.length} titik.`),
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small',
          onclick: () => {
            state.anchorMode = 'spawn';
            state.draft = { kind: 'spawn', s: i };
            state.emit('tool');
            hooks.status(`Lanjutkan jalur "${s.id}": klik titik berikutnya.`);
          },
        },
        'Lanjutkan jalur',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small btn-danger',
          onclick: () => {
            state.select(s.path.map((_, j) => ({ k: 'spawnPt', s: i, i: j }) as Sel));
            hooks.status(`Jalur "${s.id}" dihapus (${deleteSelection(state)} titik).`);
          },
        },
        'Hapus jalur',
      ),
    ),
  );
}

function editSeat(state: EditorState, i: number, fn: (seat: EditorState['map']['customers']['seats'][number]) => void): void {
  const seat = state.map.customers.seats[i];
  if (!seat) return;
  state.checkpoint();
  fn(seat);
  state.touched();
}

function renameSeat(state: EditorState, i: number, v: string, hooks: PanelHooks): void {
  const id = v.trim();
  if (!id) return hooks.status('Id kursi tidak boleh kosong.', true);
  if (state.map.customers.seats.some((s, j) => j !== i && s.id === id)) return hooks.status(`Id "${id}" sudah dipakai kursi lain.`, true);
  editSeat(state, i, (s) => (s.id = id));
}

function renameSpawn(state: EditorState, i: number, v: string, hooks: PanelHooks): void {
  const id = v.trim();
  const spawn = state.map.customers.spawns[i];
  if (!spawn) return;
  if (!id) return hooks.status('Id jalur tidak boleh kosong.', true);
  state.checkpoint();
  spawn.id = id;
  state.touched();
}

function redrawApproach(state: EditorState, i: number, hooks: PanelHooks): void {
  editSeat(state, i, (s) => (s.approach = []));
  state.tool = 'anchor';
  state.anchorMode = 'seat';
  state.draft = { kind: 'approach', s: i };
  state.selection = [{ k: 'seat', s: i }];
  state.emit('tool');
  hooks.status('Klik jalur dari Pintu masuk menuju kursi, berurutan. Enter untuk selesai.');
}

function selectionPanel(state: EditorState, hooks: PanelHooks): Out {
  const sel = state.selection;
  if (sel.length === 0) {
    return [
      h('h2', {}, 'Pilih'),
      h(
        'p',
        { class: 'help' },
        'Klik objek atau titik untuk memilih, seret untuk memindah. Seret area kosong untuk memilih banyak; Shift+klik menambah pilihan.',
      ),
      h(
        'ul',
        { class: 'help', style: 'padding-left:18px' },
        h('li', {}, 'Panah: geser sejauh nilai Snap'),
        h('li', {}, 'Delete: hapus · Ctrl+D: gandakan'),
        h('li', {}, 'Spasi+seret / tombol tengah / klik kanan+seret: geser kamera'),
        h('li', {}, 'Roda mouse: zoom · 0: pas layar'),
      ),
    ];
  }
  if (sel.length > 1) {
    const objs = sel.filter((s) => s.k === 'object').length;
    return [
      h('h2', {}, `${sel.length} dipilih`),
      h('p', { class: 'help' }, `${objs} objek, ${sel.length - objs} titik. Seret salah satunya untuk memindah semuanya.`),
      h(
        'div',
        { class: 'btn-row' },
        objs
          ? h('button', { type: 'button', class: 'btn', onclick: () => hooks.status(`${duplicateSelection(state)} objek digandakan.`) }, 'Gandakan objek')
          : null,
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => hooks.status(`${deleteSelection(state)} item dihapus.`) }, 'Hapus'),
      ),
    ];
  }
  const s = sel[0] as Sel;
  const p = selPoint(state.map, s);
  if (!p) return [h('p', { class: 'empty' }, 'Pilihan sudah tidak ada.')];

  const coordFields = h(
    'div',
    { class: 'field-row' },
    field(
      'X (ubin)',
      numberInput(p.x, (v) => setCoord(state, s, 'x', v), { step: state.snap }),
    ),
    field(
      'Y (ubin)',
      numberInput(p.y, (v) => setCoord(state, s, 'y', v), { step: state.snap }),
    ),
  );

  if (s.k === 'object') {
    const o = p as EObject;
    const def = objectType(o.type);
    return [
      h('h2', {}, def.label),
      h(
        'p',
        { class: 'help' },
        `${o.type} · alas ${fmt(def.footprint.w / 16)}×${fmt(def.footprint.d / 16)} ubin · ${def.blocking ? 'menghalangi jalan' : 'bisa dilewati'}`,
      ),
      coordFields,
      def.custom ? h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: () => hooks.openStudio(o.type) }, 'Edit gambar')) : null,
      def.variants.length > 1
        ? field(
            'Varian',
            select(
              def.variants.map((v) => ({ value: v, label: v })),
              o.variant,
              (v) => editObject(state, o, (x) => ((x.variant = v), (x.explicitVariant = true))),
            ),
          )
        : null,
      field(
        'Muncul',
        select(requiresOptions(o.requires), o.requires ?? '', (v) => editObject(state, o, (x) => (v ? (x.requires = v) : delete x.requires))),
      ),
      field(
        'Id (opsional)',
        textInput(o.id ?? '', (v) => {
          const id = v.trim();
          if (id && state.map.objects.some((x) => x !== o && x.id === id)) return hooks.status(`Id "${id}" sudah dipakai objek lain.`, true);
          editObject(state, o, (x) => (id ? (x.id = id) : delete x.id));
        }),
        'Dipakai upgrade untuk mengganti tampilan (cart, canopy, bench-front, …). Kosongkan untuk objek hiasan.',
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => hooks.status(`${duplicateSelection(state)} objek digandakan.`) }, 'Gandakan'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => hooks.status(`${deleteSelection(state)} item dihapus.`) }, 'Hapus'),
      ),
    ];
  }

  const c = state.map.customers;
  const titles: Record<Exclude<Sel['k'], 'object'>, string> = {
    camera: 'Titik kamera',
    lot: 'Pintu masuk',
    spawnPt: `Jalur datang "${s.k === 'spawnPt' ? c.spawns[s.s]?.id : ''}"`,
    seat: `Kursi "${s.k === 'seat' ? c.seats[s.s]?.id : ''}"`,
    approach: `Jalur kursi "${s.k === 'approach' ? c.seats[s.s]?.id : ''}"`,
    queue: `Antrean #${s.k === 'queue' ? s.i + 1 : ''}`,
  };
  const extra: (HTMLElement | null)[] = [];
  if (s.k === 'seat') {
    const seat = c.seats[s.s]!;
    extra.push(
      field(
        'Id kursi',
        textInput(seat.id, (v) => renameSeat(state, s.s, v, hooks)),
      ),
      field(
        'Muncul',
        select(requiresOptions(seat.requires), seat.requires ?? '', (v) => editSeat(state, s.s, (x) => (v ? (x.requires = v) : delete x.requires))),
      ),
      h('p', { class: 'help' }, `${seat.approach.length} titik jalur dari Pintu masuk.`),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: () => redrawApproach(state, s.s, hooks) }, 'Gambar ulang jalur')),
    );
  }
  if (s.k === 'spawnPt') extra.push(h('p', { class: 'help' }, `Titik ${s.i + 1} dari ${c.spawns[s.s]?.path.length ?? 0}.`));
  if (s.k === 'approach') extra.push(h('p', { class: 'help' }, `Titik jalur ${s.i + 1} dari ${c.seats[s.s]?.approach.length ?? 0}.`));
  const deletable = s.k !== 'camera' && s.k !== 'lot';
  return [
    h('h2', {}, titles[s.k]),
    coordFields,
    ...extra,
    deletable
      ? h(
          'div',
          { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-danger', onclick: () => hooks.status(`${deleteSelection(state)} item dihapus.`) }, 'Hapus'),
        )
      : null,
  ];
}

function setCoord(state: EditorState, s: Sel, axis: 'x' | 'y', v: number): void {
  const p = selPoint(state.map, s);
  if (!p) return;
  state.checkpoint();
  p[axis] = round(v);
  state.touched();
}

function editObject(state: EditorState, o: EObject, fn: (o: EObject) => void): void {
  state.checkpoint();
  fn(o);
  state.touched();
}

// ======================================================================= Peta

export function renderMapPane(pane: HTMLElement, state: EditorState, hooks: PanelHooks, filter: { q: string }): void {
  const m = state.map;
  const list = h('ul', { class: 'list' });
  const fillList = (): void => {
    const q = filter.q.toLowerCase();
    const items = m.objects.filter(
      (o) => !q || objectType(o.type).label.toLowerCase().includes(q) || o.type.includes(q) || (o.id ?? '').includes(q) || (o.requires ?? '').includes(q),
    );
    list.replaceChildren(
      ...items.map((o) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'list-item',
              'aria-current': String(state.isSelected({ k: 'object', uid: o.uid })),
              onclick: () => {
                state.select([{ k: 'object', uid: o.uid }]);
                hooks.centerOn({ x: o.x + objectType(o.type).footprint.w / 32, y: o.y + objectType(o.type).footprint.d / 32 });
              },
            },
            objectType(o.type).label,
            o.id ? h('span', { class: 'tag' }, o.id) : null,
            o.requires ? h('span', { class: 'tag', title: 'Muncul setelah upgrade' }, o.requires) : null,
            h('span', { class: 'meta' }, `${fmt(o.x)}, ${fmt(o.y)}`),
          ),
        ),
      ),
    );
    if (!items.length) list.append(h('li', { class: 'empty' }, m.objects.length ? 'Tidak ada objek yang cocok.' : 'Peta belum punya objek.'));
  };
  fillList();
  const search = h('input', { type: 'search', value: filter.q, placeholder: 'Cari jenis, id, atau upgrade…', 'aria-label': 'Cari objek di peta' });
  search.addEventListener('input', () => {
    filter.q = search.value.trim();
    fillList();
  });

  pane.replaceChildren(
    h('h2', {}, 'Data peta'),
    field(
      'Nama peta',
      textInput(m.name, (v) => {
        state.checkpoint();
        m.name = v;
        state.touched();
      }),
    ),
    field(
      'Id file',
      textInput(
        m.id,
        (v) => {
          const id = v.trim();
          state.checkpoint();
          m.id = id;
          state.touched();
          hooks.locationChanged();
        },
        { pattern: '[a-z0-9]+(-[a-z0-9]+)*', spellcheck: 'false' },
      ),
      state.fileId && state.fileId !== m.id
        ? `Disimpan sebagai file baru src/data/maps/${m.id}.json (file ${state.fileId}.json tidak dihapus).`
        : `src/data/maps/${m.id}.json. Jangan ganti id peta yang sudah dipakai pemain: save mereka menyimpan id ini.`,
    ),
    h('p', { class: 'help' }, `Ukuran ${m.width} × ${m.height} ubin.`),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: hooks.openResize }, 'Ubah ukuran…')),
    h('h3', {}, `Objek (${m.objects.length})`),
    search,
    h('div', { style: 'height:8px' }),
    list,
  );
}

// ======================================================================= Lokasi

export function renderLocationPane(pane: HTMLElement, state: EditorState, draft: LocationDraft, hooks: PanelHooks): void {
  const changed = (): void => hooks.locationChanged();
  const toggle = h('input', {
    type: 'checkbox',
    id: 'loc-registered',
    checked: draft.registered,
    onchange: (e: Event) => {
      draft.registered = (e.target as HTMLInputElement).checked;
      changed();
      renderLocationPane(pane, state, draft, hooks);
    },
  });
  const head: Node[] = [
    h('h2', {}, 'Lokasi usaha'),
    h(
      'label',
      { class: 'check', for: 'loc-registered' },
      toggle,
      h('span', {}, 'Pemain bisa memilih peta ini sebagai lokasi (ditulis ke ', h('code', {}, 'src/data/locations.json'), ').'),
    ),
  ];
  if (draft.original && !draft.registered) {
    head.push(h('p', { class: 'form-error' }, 'Lokasi ini akan DIHAPUS dari daftar saat disimpan. Save pemain yang sedang berada di lokasi ini akan rusak.'));
  }
  if (!draft.registered) {
    pane.replaceChildren(...head, h('p', { class: 'help' }, 'Tanpa didaftarkan, peta tetap tersimpan sebagai file tapi belum muncul di pilihan lokasi game.'));
    return;
  }

  const set = <K extends keyof LocationDraft>(k: K, v: LocationDraft[K]): void => {
    draft[k] = v;
    changed();
  };
  const week = h(
    'div',
    { class: 'week' },
    ...WEEKDAYS.map((d, i) => {
      const input = numberInput(
        draft.weekday[i] ?? 1,
        (v) => {
          draft.weekday[i] = v;
          changed();
        },
        { step: 0.05, min: 0.05, 'aria-label': `Pengali ${d}` },
      );
      return h('div', {}, h('label', { for: (input.id = `wd-${i}`) }, d), input);
    }),
  );
  const types = h(
    'div',
    { class: 'field-row' },
    ...CUSTOMER_TYPES.map((t) =>
      field(
        t.name,
        numberInput(
          draft.typeWeights[t.id] ?? 1,
          (v) => {
            draft.typeWeights[t.id] = v;
            changed();
          },
          { step: 0.1, min: 0 },
        ),
      ),
    ),
  );
  const hours = h(
    'div',
    {},
    ...draft.hours.map((r, i) =>
      h(
        'div',
        { class: 'field-row', style: 'align-items:end' },
        field(
          'Dari',
          clockInput(r.from, (v) => ((r.from = v), changed()), hooks),
        ),
        field(
          'Sampai',
          clockInput(r.to, (v) => ((r.to = v), changed()), hooks),
        ),
        field(
          'Pengali',
          numberInput(r.factor, (v) => ((r.factor = v), changed()), { step: 0.05, min: 0.05 }),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small btn-danger',
            style: 'margin-bottom:10px',
            'aria-label': `Hapus jam khusus ${i + 1}`,
            onclick: () => {
              draft.hours.splice(i, 1);
              changed();
              renderLocationPane(pane, state, draft, hooks);
            },
          },
          'Hapus',
        ),
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-small',
        onclick: () => {
          draft.hours.push({ from: 17 * 60, to: 19 * 60, factor: 1.2 });
          changed();
          renderLocationPane(pane, state, draft, hooks);
        },
      },
      'Tambah jam khusus',
    ),
  );
  const perks = h('textarea', { rows: 4, onchange: (e: Event) => set('perks', (e.target as HTMLTextAreaElement).value.split('\n')) });
  perks.value = draft.perks.join('\n');
  const desc = h('textarea', { rows: 4, onchange: (e: Event) => set('description', (e.target as HTMLTextAreaElement).value) });
  desc.value = draft.description;

  pane.replaceChildren(
    ...head,
    h('p', { class: 'help' }, `Id lokasi mengikuti id peta: `, h('code', {}, state.map.id)),
    field(
      'Nama lokasi',
      textInput(draft.name, (v) => set('name', v)),
    ),
    field(
      'Tagline',
      textInput(draft.tagline, (v) => set('tagline', v)),
      'Satu kalimat pendek di kartu pilihan lokasi.',
    ),
    field('Deskripsi', desc),
    h(
      'div',
      { class: 'field-row' },
      field(
        'Sewa / hari (Rp)',
        numberInput(draft.rent, (v) => set('rent', Math.round(v)), { step: 1000, min: 0 }),
      ),
      field(
        'Biaya pindah (Rp)',
        numberInput(draft.moveCost, (v) => set('moveCost', Math.round(v)), { step: 1000, min: 0 }),
      ),
    ),
    h('h3', {}, 'Ramai per hari (1 = normal)'),
    week,
    h('h3', {}, 'Sifat pelanggan'),
    h(
      'div',
      { class: 'field-row' },
      field(
        'Anggaran ×',
        numberInput(draft.budgetFactor, (v) => set('budgetFactor', v), { step: 0.05, min: 0.1 }),
      ),
      field(
        'Larut malam ×',
        numberInput(draft.lateNight, (v) => set('lateNight', v), { step: 0.05, min: 0.1 }),
      ),
      field(
        'Kesabaran (menit)',
        numberInput(draft.patience, (v) => set('patience', Math.round(v)), { step: 1 }),
      ),
      field(
        'Harga bahan ×',
        numberInput(draft.ingredientPriceFactor, (v) => set('ingredientPriceFactor', v), { step: 0.01, min: 0.1 }),
      ),
    ),
    h('h3', {}, 'Pengali tipe pelanggan (1 = normal)'),
    types,
    h('h3', {}, 'Jam khusus'),
    h('p', { class: 'help' }, 'Lewat tengah malam tulis 25:00, 26:00, dst.'),
    hours,
    h('h3', {}, 'Keunggulan'),
    field('Satu baris per poin', perks),
  );
}

function clockInput(minutes: number, onChange: (v: number) => void, hooks: PanelHooks): HTMLInputElement {
  return textInput(
    formatClock(minutes),
    (v) => {
      const m = parseClock(v);
      if (m === null) hooks.status(`Jam "${v}" tidak valid. Pakai format JJ:MM, mis. 17:30.`, true);
      else onChange(m);
    },
    { inputmode: 'numeric', placeholder: '17:00' },
  );
}

// ======================================================================= Cek

export function renderCheckPane(pane: HTMLElement, issues: Issue[], locationIssues: string[], hooks: PanelHooks): void {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const item = (i: Issue): HTMLElement => {
    const body = [h('strong', {}, i.level === 'error' ? 'Error' : 'Peringatan'), i.message];
    return i.ref
      ? h('button', { type: 'button', class: `issue is-${i.level}`, onclick: () => hooks.selectIssue(i.ref!) }, ...body)
      : h('div', { class: `issue is-${i.level}` }, ...body);
  };
  pane.replaceChildren(
    ...clean([
      h('h2', {}, 'Pemeriksaan'),
      errors.length || locationIssues.length
        ? h('p', { class: 'help' }, 'Error harus dibereskan sebelum disimpan; game akan menolak peta ini.')
        : h('p', { class: 'ok' }, 'Tidak ada error. Peta siap disimpan.'),
      ...errors.map(item),
      ...locationIssues.map((m) => item({ level: 'error', message: `Lokasi: ${m}` })),
      warnings.length ? h('h3', {}, `Peringatan (${warnings.length})`) : null,
      ...warnings.map(item),
    ]),
  );
}
