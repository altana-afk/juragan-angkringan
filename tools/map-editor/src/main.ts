/**
 * Editor peta Juragan Angkringan: titik masuk.
 * Jalankan dengan `npm run editor`, lalu simpan langsung ke src/data/maps.
 */
import { OBJECT_TYPES, objectType, type ObjectTypeId } from '../../../src/world/objectTypes';
import { TERRAINS } from '../../../src/world/terrain';
import { ApiError, fetchLocations, fetchMaps, saveMap, type LocationAction } from './api';
import { loadSprites } from './art';
import { loadCustomObjects } from './customStore';
import { openStudio } from './studio';
import { h } from './dom';
import { formatMapJson } from './format';
import { attachInput } from './input';
import { buildEntry, draftFor, locationProblems, type LocationDraft } from './locationDraft';
import type { LocationEntry } from './locationsFile';
import { blankMap, fromRaw, MAP_ID_PATTERN, resizeMap, slugify, TERRAIN_IDS, toRaw, type EditorMap } from './model';
import { anchorHelp, renderCheckPane, renderEditPane, renderLocationPane, renderMapPane, SEAT_UPGRADES, UPGRADES, type PanelHooks } from './panels';
import { EditorState, type ChangeKind, type Sel, type Tool } from './state';
import { collectLayoutUpgrades, validateMap, type Issue, type IssueRef } from './validate';
import { Viewport } from './viewport';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemen #${id} tidak ada`);
  return el as T;
};

/** Peta yang ikut di-bundle (cadangan bila server editor tidak terhubung). */
const BUNDLED = import.meta.glob<{ default: unknown }>('../../../src/data/maps/*.json', { eager: true });
const DRAFT_KEY = 'juragan-map-editor:draft';
const LAST_KEY = 'juragan-map-editor:last';

interface DiskMap {
  id: string;
  name: string;
  raw: unknown;
}

let diskMaps: DiskMap[] = [];
let locations: LocationEntry[] = [];
let serverOnline = true;
let issues: Issue[] = [];
let locationIssues: string[] = [];
let locDraft: LocationDraft;
let locationDirty = false;
const mapFilter = { q: '' };

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* penyimpanan browser penuh/diblokir: draf cadangan dilewati */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* abaikan */
    }
  },
};

async function boot(): Promise<void> {
  const loading = $('loading');
  await loadSprites((label) => (loading.textContent = `Menyiapkan aset game: ${label}…`));
  await refreshDisk();
  // Objek kustom harus terdaftar sebelum peta dibaca (peta bisa memakainya).
  if (serverOnline) {
    loading.textContent = 'Memuat objek buatanmu…';
    await loadCustomObjects().catch((e: unknown) => console.warn('Objek kustom gagal dimuat', e));
  }

  const params = new URLSearchParams(location_search());
  const wanted = params.get('peta') ?? storage.get(LAST_KEY) ?? 'main-street';
  const initial = diskMaps.find((m) => m.id === wanted) ?? diskMaps[0];
  const state = new EditorState(initial ? fromRaw(initial.raw) : blankMap('peta-baru', 'Peta baru', 24, 24, 'grass'), initial?.id ?? null);
  locDraft = draftFor(state.map.name, locations.find((l) => l.id === state.map.id) ?? null);

  const canvas = $<HTMLCanvasElement>('canvas');
  const view = new Viewport(canvas, state);
  loading.hidden = true;

  // ------------------------------------------------------------------ status
  const statusMsg = $('status-msg');
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const status = (msg: string, error = false): void => {
    statusMsg.textContent = msg;
    statusMsg.classList.toggle('is-error', error);
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => (statusMsg.textContent = ''), error ? 9000 : 5000);
  };

  // ------------------------------------------------------------------ panel
  const panes = { edit: $('pane-edit'), map: $('pane-map'), location: $('pane-location'), check: $('pane-check') };
  type PaneName = keyof typeof panes;
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const showTab = (name: PaneName, focus = false): void => {
    for (const t of tabs) {
      const on = t.id === `tab-${name}`;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const [k, el] of Object.entries(panes)) el.hidden = k !== name;
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => showTab(t.id.slice(4) as PaneName));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
      showTab(next.id.slice(4) as PaneName, true);
    });
  });

  const hooks: PanelHooks = {
    status,
    centerOn: (p) => view.centerOn(p),
    openResize,
    locationChanged: () => {
      locationDirty = true;
      updateSaveState();
      scheduleValidate();
    },
    selectIssue: (ref) => selectIssue(ref),
    openStudio: (editId) =>
      openStudio({
        editId,
        isUsedInOpenMap: (id) => state.map.objects.some((o) => o.type === id),
        onSaved: (id) => {
          // Pasang objek baru langsung di alat Objek.
          state.objType = id as ObjectTypeId;
          state.objVariant = 'default';
          if (state.tool !== 'select') state.setTool('object');
          view.requestDraw();
          state.emit('tool');
          scheduleValidate();
          status(`Objek "${objectType(id as ObjectTypeId).label}" tersimpan ke src/assets/custom-objects/${id}.png. Klik peta untuk memasangnya.`);
        },
        onDeleted: (id) => {
          if (state.objType === id) state.objType = 'tree';
          state.emit('tool');
          status('Objek kustom dihapus.');
        },
      }),
  };

  const layoutUpgrades = (): Set<string> => collectLayoutUpgrades(diskMaps.filter((m) => m.id !== state.fileId).map((m) => m.raw));
  const upgradeNames = new Map(UPGRADES.map((u) => [u.id, u.name]));

  let validateTimer: ReturnType<typeof setTimeout> | undefined;
  const validateNow = (): void => {
    issues = validateMap(state.map, { upgrades: upgradeNames, layoutUpgrades: layoutUpgrades(), seatUpgrades: SEAT_UPGRADES });
    locationIssues = locationProblems(locDraft);
    const errors = issues.filter((i) => i.level === 'error').length + locationIssues.length;
    const badge = $('check-badge');
    const total = errors || issues.length;
    badge.hidden = total === 0;
    badge.textContent = String(total);
    badge.classList.toggle('is-error', errors > 0);
    badge.setAttribute('aria-label', errors ? `${errors} error` : `${issues.length} peringatan`);
    renderCheckPane(panes.check, issues, locationIssues, hooks);
  };
  const scheduleValidate = (): void => {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(validateNow, 150);
  };

  const panelBusy = (pane: HTMLElement): boolean => pane.contains(document.activeElement) && document.activeElement?.tagName !== 'BUTTON';
  let mapPaneTimer: ReturnType<typeof setTimeout> | undefined;
  const renderPanels = (what: ChangeKind): void => {
    if (what === 'view') return;
    if (what !== 'map' || !panelBusy(panes.edit)) renderEditPane(panes.edit, state, hooks);
    clearTimeout(mapPaneTimer);
    mapPaneTimer = setTimeout(
      () => {
        if (!panelBusy(panes.map)) renderMapPane(panes.map, state, hooks, mapFilter);
      },
      what === 'map' ? 200 : 0,
    );
  };

  // ------------------------------------------------------------------ bar atas
  const picker = $<HTMLSelectElement>('map-picker');
  const fillPicker = (): void => {
    picker.replaceChildren(
      ...(state.fileId === null ? [h('option', { value: '' }, `${state.map.name} (baru)`)] : []),
      ...diskMaps.map((m) => h('option', { value: m.id }, `${m.name} · ${m.id}`)),
    );
    picker.value = state.fileId ?? '';
  };
  picker.addEventListener('change', () => {
    const target = diskMaps.find((m) => m.id === picker.value);
    if (!target || !confirmDiscard()) {
      picker.value = state.fileId ?? '';
      return;
    }
    openMap(fromRaw(target.raw), target.id);
  });

  const saveState = $('save-state');
  const btnUndo = $<HTMLButtonElement>('btn-undo');
  const btnRedo = $<HTMLButtonElement>('btn-redo');
  const updateSaveState = (): void => {
    const dirty = state.dirty || locationDirty;
    saveState.textContent = !serverOnline ? 'Server editor tidak terhubung' : dirty ? 'Belum disimpan' : state.fileId ? 'Tersimpan' : 'Peta baru';
    saveState.classList.toggle('is-dirty', dirty || !serverOnline);
    btnUndo.disabled = !state.canUndo();
    btnRedo.disabled = !state.canRedo();
    document.title = `${dirty ? '• ' : ''}${state.map.name} · Editor Peta`;
  };
  btnUndo.addEventListener('click', () => state.undo() && status('Diurungkan.'));
  btnRedo.addEventListener('click', () => state.redo() && status('Diulangi.'));
  $('btn-zoom-in').addEventListener('click', () => view.stepZoom(1));
  $('btn-zoom-out').addEventListener('click', () => view.stepZoom(-1));
  $('btn-fit').addEventListener('click', () => view.fit());
  $('btn-save').addEventListener('click', () => void save());
  $('btn-download').addEventListener('click', download);
  $('btn-new').addEventListener('click', openNewDialog);

  const zoomLabel = $('zoom-label');
  const updateZoom = (): void => {
    zoomLabel.textContent = `${Math.round(state.view.zoom * 100)}%`;
  };

  // ------------------------------------------------------------------ alat & lapisan
  const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')];
  toolButtons.forEach((b) => b.addEventListener('click', () => state.setTool(b.dataset.tool as Tool)));
  const layerButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-layer]')];
  layerButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.layer as keyof EditorState['layers'];
      state.layers[key] = !state.layers[key];
      b.setAttribute('aria-pressed', String(state.layers[key]));
      view.requestDraw();
    }),
  );
  const snapSelect = $<HTMLSelectElement>('snap');
  snapSelect.value = String(state.snap);
  snapSelect.addEventListener('change', () => {
    state.snap = Number(snapSelect.value);
    state.emit('tool');
  });

  const hint = $('status-hint');
  const toolHints: Record<Tool, string> = {
    select: 'Klik pilih · seret pindah · Shift tambah · Delete hapus · Ctrl+D gandakan',
    terrain: 'Klik/seret mengecat · klik kanan ambil tanah',
    object: 'Klik pasang objek · ganti jenis di panel kanan',
    anchor: '',
  };
  const updateTool = (): void => {
    for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool));
    hint.textContent = state.tool === 'anchor' ? anchorHelp(state.anchorMode) : toolHints[state.tool];
    view.ghost = null;
    view.brushTiles = [];
    view.requestDraw();
  };

  // ------------------------------------------------------------------ alur peta
  function confirmDiscard(): boolean {
    return !(state.dirty || locationDirty) || window.confirm('Perubahan pada peta ini belum disimpan. Buang perubahan?');
  }

  function openMap(map: EditorMap, fileId: string | null): void {
    locDraft = draftFor(map.name, fileId ? (locations.find((l) => l.id === fileId) ?? null) : null);
    locationDirty = false;
    state.load(map, fileId);
    if (fileId) storage.set(LAST_KEY, fileId);
    storage.remove(DRAFT_KEY);
    mapFilter.q = '';
  }

  function selectIssue(ref: IssueRef): void {
    const sel: Sel | null =
      ref.kind === 'object'
        ? { k: 'object', uid: ref.uid }
        : ref.kind === 'seat'
          ? { k: 'seat', s: ref.index }
          : ref.kind === 'spawn'
            ? { k: 'spawnPt', s: ref.index, i: 0 }
            : ref.kind === 'queue'
              ? { k: 'queue', i: ref.index }
              : ref.kind === 'lot'
                ? state.map.customers.lotEntry
                  ? { k: 'lot' }
                  : null
                : { k: 'camera' };
    if (ref.kind === 'lot' && !state.map.customers.lotEntry) {
      state.setTool('anchor');
      state.anchorMode = 'lot';
      state.emit('tool');
      showTab('edit');
      status('Klik peta untuk memasang Pintu masuk.');
      return;
    }
    if (!sel) return;
    state.setTool('select');
    state.select([sel]);
    showTab('edit');
    const c = state.map.customers;
    const p =
      sel.k === 'object'
        ? state.map.objects.find((o) => o.uid === sel.uid)
        : sel.k === 'seat'
          ? c.seats[sel.s]
          : sel.k === 'spawnPt'
            ? c.spawns[sel.s]?.path[0]
            : sel.k === 'queue'
              ? c.queue[sel.i]
              : sel.k === 'lot'
                ? c.lotEntry
                : state.map.cameraHome;
    if (p) view.centerOn(p);
  }

  async function save(): Promise<void> {
    validateNow();
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length || locationIssues.length) {
      showTab('check');
      status(`Belum bisa disimpan: ${errors.length + locationIssues.length} error. Lihat tab Cek.`, true);
      return;
    }
    if (!serverOnline) {
      status('Server editor tidak terhubung. Jalankan "npm run editor", atau pakai "Unduh JSON".', true);
      return;
    }
    const id = state.map.id;
    const existsOnDisk = diskMaps.some((m) => m.id === id);
    let overwrite = id === state.fileId;
    if (existsOnDisk && !overwrite) {
      if (!window.confirm(`File src/data/maps/${id}.json sudah ada. Timpa dengan peta ini?`)) return;
      overwrite = true;
    }

    // Lokasi: hanya tulis bila benar-benar berubah agar locations.json tidak teracak.
    const existing = locations.find((l) => l.id === id) ?? null;
    let action: LocationAction = { action: 'keep' };
    if (locDraft.registered) {
      const entry = buildEntry({ ...locDraft, original: existing ?? locDraft.original }, id);
      if (!existing || JSON.stringify(entry) !== JSON.stringify(existing)) action = { action: 'upsert', entry };
    } else if (existing) {
      if (!window.confirm(`Hapus lokasi "${existing.id}" dari daftar lokasi game? Save pemain yang sedang di lokasi ini akan rusak.`)) return;
      action = { action: 'remove' };
    }

    const btn = $<HTMLButtonElement>('btn-save');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      const res = await saveMap(toRaw(state.map), overwrite, action);
      state.fileId = id;
      state.dirty = false;
      locationDirty = false;
      storage.remove(DRAFT_KEY);
      storage.set(LAST_KEY, id);
      await refreshDisk();
      locDraft = draftFor(state.map.name, locations.find((l) => l.id === id) ?? null);
      fillPicker();
      renderLocationPane(panes.location, state, locDraft, hooks);
      const loc = res.location === 'disimpan' ? ' Lokasi didaftarkan.' : res.location === 'dihapus' ? ' Lokasi dihapus.' : '';
      status(`Tersimpan ke ${res.file}.${loc} Muat ulang tab game untuk mencobanya.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) serverOnline = false;
      status(`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan ke project';
      updateSaveState();
    }
  }

  function download(): void {
    const blob = new Blob([formatMapJson(toRaw(state.map))], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${state.map.id || 'peta'}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status(`${state.map.id}.json diunduh. Taruh di src/data/maps/ agar terbaca game.`);
  }

  // ------------------------------------------------------------------ dialog
  const dlgNew = $<HTMLDialogElement>('dlg-new');
  const newName = $<HTMLInputElement>('new-name');
  const newId = $<HTMLInputElement>('new-id');
  const newTemplate = $<HTMLSelectElement>('new-template');
  const newError = $('new-error');
  let idTouched = false;
  const terrainOptions = (sel: HTMLSelectElement, value: string): void => {
    sel.replaceChildren(...TERRAIN_IDS.map((t) => h('option', { value: t }, TERRAINS[t].label)));
    sel.value = value;
  };
  terrainOptions($<HTMLSelectElement>('new-base'), 'grass');
  newName.addEventListener('input', () => {
    if (!idTouched) newId.value = slugify(newName.value);
  });
  newId.addEventListener('input', () => (idTouched = true));
  const syncFrom = (): void => {
    const blank = (dlgNew.querySelector<HTMLInputElement>('input[name="new-from"]:checked')?.value ?? 'copy') === 'blank';
    $('new-blank-fields').hidden = !blank;
    newTemplate.disabled = blank;
  };
  dlgNew.querySelectorAll('input[name="new-from"]').forEach((r) => r.addEventListener('change', syncFrom));

  function openNewDialog(): void {
    newTemplate.replaceChildren(...diskMaps.map((m) => h('option', { value: m.id }, m.name)));
    newTemplate.value = state.fileId ?? diskMaps[0]?.id ?? '';
    newName.value = '';
    newId.value = '';
    newError.textContent = '';
    idTouched = false;
    if (!diskMaps.length) (dlgNew.querySelector('input[value="blank"]') as HTMLInputElement).checked = true;
    syncFrom();
    dlgNew.showModal();
  }

  $<HTMLFormElement>('form-new').addEventListener('submit', (e) => {
    const name = newName.value.trim();
    const id = newId.value.trim();
    const fail = (msg: string): void => {
      e.preventDefault();
      newError.textContent = msg;
    };
    if (!name) return fail('Nama peta wajib diisi.');
    if (!MAP_ID_PATTERN.test(id)) return fail('Id hanya boleh huruf kecil, angka, dan tanda hubung.');
    if (diskMaps.some((m) => m.id === id)) return fail(`Id "${id}" sudah dipakai peta lain.`);
    if (!confirmDiscard()) return fail('Dibatalkan: simpan dulu peta yang sedang dibuka.');
    const blank = (dlgNew.querySelector<HTMLInputElement>('input[name="new-from"]:checked')?.value ?? 'copy') === 'blank';
    let map: EditorMap;
    if (blank) {
      const w = clampInt($<HTMLInputElement>('new-w').value, 4, 64, 24);
      const hh = clampInt($<HTMLInputElement>('new-h').value, 4, 64, 24);
      map = blankMap(id, name, w, hh, $<HTMLSelectElement>('new-base').value as EditorMap['terrain'][number][number]);
    } else {
      const tpl = diskMaps.find((m) => m.id === newTemplate.value);
      if (!tpl) return fail('Pilih peta yang mau disalin.');
      map = fromRaw(tpl.raw);
      map.id = id;
      map.name = name;
    }
    openMap(map, null);
    locDraft = draftFor(name, null);
    renderLocationPane(panes.location, state, locDraft, hooks);
    status(`Peta "${name}" dibuat. Belum tersimpan: tekan "Simpan ke project".`);
  });

  const dlgResize = $<HTMLDialogElement>('dlg-resize');
  function openResize(): void {
    $<HTMLInputElement>('rs-w').value = String(state.map.width);
    $<HTMLInputElement>('rs-h').value = String(state.map.height);
    $<HTMLInputElement>('rs-dx').value = '0';
    $<HTMLInputElement>('rs-dy').value = '0';
    terrainOptions($<HTMLSelectElement>('rs-fill'), 'grass');
    dlgResize.showModal();
  }
  $<HTMLFormElement>('form-resize').addEventListener('submit', () => {
    const w = clampInt($<HTMLInputElement>('rs-w').value, 4, 64, state.map.width);
    const hh = clampInt($<HTMLInputElement>('rs-h').value, 4, 64, state.map.height);
    const dx = clampInt($<HTMLInputElement>('rs-dx').value, -64, 64, 0);
    const dy = clampInt($<HTMLInputElement>('rs-dy').value, -64, 64, 0);
    state.checkpoint();
    const removed = resizeMap(state.map, w, hh, dx, dy, $<HTMLSelectElement>('rs-fill').value as EditorMap['terrain'][number][number]);
    state.selection = [];
    state.touched('terrain');
    view.fit();
    status(`Ukuran peta sekarang ${w} × ${hh}.${removed ? ` ${removed} objek di luar batas dihapus.` : ''}`);
  });
  document.querySelectorAll<HTMLButtonElement>('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog')?.close()));

  // ------------------------------------------------------------------ kanvas
  const coords = $('status-coords');
  attachInput(canvas, state, view, {
    status,
    save: () => void save(),
    coords: (tile, terrain) => {
      coords.textContent = tile
        ? `x ${tile.x.toFixed(2).replace('.', ',')} · y ${tile.y.toFixed(2).replace('.', ',')}${terrain ? ` · ${TERRAINS[terrain].label}` : ''}`
        : '–';
    },
    pickedTerrain: (t) => {
      state.brush = t;
      state.emit('tool');
      status(`Tanah diambil: ${TERRAINS[t].label}.`);
    },
  });

  // ------------------------------------------------------------------ reaksi perubahan
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  state.on((what) => {
    if (what === 'terrain') view.rebakeGround();
    if (what === 'load') {
      view.rebakeGround();
      view.fit();
      fillPicker();
      renderLocationPane(panes.location, state, locDraft, hooks);
    }
    if (what === 'tool') updateTool();
    if (what === 'view') updateZoom();
    renderPanels(what);
    if (what === 'map' || what === 'terrain' || what === 'load') {
      scheduleValidate();
      if (state.dirty) {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => storage.set(DRAFT_KEY, JSON.stringify({ fileId: state.fileId, raw: toRaw(state.map), savedAt: Date.now() })), 800);
      }
    }
    updateSaveState();
    updateZoom();
    view.requestDraw();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty || locationDirty) e.preventDefault();
  });

  // Pulihkan draf yang belum sempat disimpan (mis. tab tertutup).
  const saved = storage.get(DRAFT_KEY);
  let restored = false;
  if (saved) {
    try {
      const d = JSON.parse(saved) as { fileId: string | null; raw: unknown; savedAt: number };
      const when = new Date(d.savedAt).toLocaleString('id-ID');
      const name = (d.raw as { name?: string }).name ?? d.fileId ?? 'peta';
      if (window.confirm(`Ada draf "${name}" yang belum disimpan (${when}). Pulihkan?`)) {
        openMap(fromRaw(d.raw), d.fileId && diskMaps.some((m) => m.id === d.fileId) ? d.fileId : null);
        state.dirty = true;
        restored = true;
        status('Draf dipulihkan. Simpan ke project bila sudah sesuai.');
      } else storage.remove(DRAFT_KEY);
    } catch {
      storage.remove(DRAFT_KEY);
    }
  }
  if (!restored) state.load(state.map, state.fileId);
  updateTool();
  validateNow();
  if (!serverOnline)
    status(
      'Server editor tidak terhubung: daftar peta diambil dari file bawaan, simpan lewat "Unduh JSON". Jalankan "npm run editor" untuk simpan langsung.',
      true,
    );

  // Fokus kamera ke gerobak di awal agar langsung terlihat area angkringan.
  const cart = state.map.objects.find((o) => o.type === 'cart');
  if (cart) {
    state.view.zoom = 2;
    view.centerOn({ x: cart.x + OBJECT_TYPES.cart.footprint.w / 32, y: cart.y });
    updateZoom();
  }
}

async function refreshDisk(): Promise<void> {
  try {
    const [m, l] = await Promise.all([fetchMaps(), fetchLocations()]);
    diskMaps = m.maps.map((raw) => toDisk(raw)).filter((d): d is DiskMap => d !== null);
    locations = l.locations;
    serverOnline = true;
  } catch {
    serverOnline = false;
    diskMaps = Object.values(BUNDLED)
      .map((mod) => toDisk(mod.default))
      .filter((d): d is DiskMap => d !== null);
    const bundledLocations = (await import('../../../src/data/locations.json')).default as { locations: LocationEntry[] };
    locations = bundledLocations.locations;
  }
}

function toDisk(raw: unknown): DiskMap | null {
  const r = raw as { id?: unknown; name?: unknown };
  return typeof r.id === 'string' ? { id: r.id, name: typeof r.name === 'string' ? r.name : r.id, raw } : null;
}

function clampInt(v: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const location_search = (): string => window.location.search;

boot().catch((e: unknown) => {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.hidden = false;
    loading.classList.add('is-error');
    loading.textContent = `Editor gagal dibuka: ${e instanceof Error ? e.message : String(e)}`;
  }
  console.error(e);
});
