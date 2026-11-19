import type { FameTier } from '../data/challenges';
import {
  autoSupporters,
  gatherAfter,
  gatherSetup,
  gradeTap,
  meterAfter,
  nextStatus,
  phoneSetup,
  rhythmSetup,
  type ContactStatus,
  type HitGrade,
  type PhoneContact,
} from '../systems/MinigameSystem';
import type { AudioSystem } from '../audio/AudioSystem';
import { SeededRandom } from '../utils/random';
import { formatRupiah } from '../utils/formatting';
import { el, setText } from './dom';
import type { UIManager } from './UIManager';
import { tr } from '../i18n/i18n';

/**
 * Panel tantangan kampung (0.18.0): pilihan dua opsi + tombol Lewati, lalu minigame 10–20 detik.
 * Ponsel: panel di bawah adegan (petunjuk di atas kepala tetap terlihat). Desktop: modal kecil di tengah,
 * pintasan 1/2/3 untuk kartu & pilihan. Jam permainan ditahan selama panel terbuka.
 */

export type ChallengeResult =
  | { kind: 'odgj'; method: 'halus'; success: boolean; gifts: string[] }
  | { kind: 'odgj'; method: 'warga'; success: boolean }
  | { kind: 'ormas'; method: 'bayar' }
  | { kind: 'ormas'; method: 'usir'; won: boolean };

export interface ChallengeOptions {
  readonly kind: 'odgj' | 'ormas';
  readonly tier: FameTier;
  /** Uang keamanan yang diminta (ormas). */
  readonly amount?: number;
  /** Persen dari hasil kemarin (ormas, untuk ditampilkan). */
  readonly percent?: number;
  readonly seed: string;
  /** Porsi yang bisa diberikan (id resep) atau null jika habis; dipanggil saat kartu ditekan. */
  readonly giftFor: (kind: 'minum' | 'makan', exclude: readonly string[]) => string | null;
  readonly giftName: (id: string) => string;
  /** Kontak HP untuk Telepon berantai (peluang online mengikuti hubungan cerita). */
  readonly contacts: readonly PhoneContact[];
  /** Pelanggan bernama yang sedang di angkringan + tahap hubungannya (Kumpulkan warga). */
  readonly crowd: readonly { name: string; stage: number }[];
  readonly audio?: AudioSystem | null;
  /** Terapkan hasil ke permainan; kembalikan teks ringkas untuk layar hasil. */
  readonly onResolve: (result: ChallengeResult) => string;
  /** Panel ditutup tanpa keputusan (tamu tetap menunggu). */
  readonly onCancel?: () => void;
}

let current: { close: () => void } | null = null;

export function isChallengeOpen(): boolean {
  return current !== null;
}

export function closeChallenge(): void {
  current?.close();
}

export function openChallenge(ui: UIManager, options: ChallengeOptions): void {
  if (current) return;
  const release = ui.holdTime();
  const rng = new SeededRandom(options.seed);
  const audio = options.audio ?? null;
  const body = el('div', { className: 'challenge-body' });
  const title = el('h2', { className: 'challenge-title', attrs: { id: 'challenge-title' } });
  const root = el('section', {
    className: 'challenge-panel',
    attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'challenge-title' },
    children: [title, body],
  });
  const timers: number[] = [];
  let frame = 0;
  let keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  let resolved = false;

  const stopLoops = (): void => {
    for (const t of timers) window.clearTimeout(t);
    timers.length = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    keyHandler = null;
  };

  const close = (): void => {
    if (!current) return;
    current = null;
    stopLoops();
    window.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-visible');
    window.setTimeout(() => root.remove(), 200);
    release();
    if (!resolved) options.onCancel?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (ui.hasOpenModal()) return;
    if (e.key === 'Escape' && !resolved && view === 'choice') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (keyHandler?.(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  let view: 'choice' | 'game' | 'result' = 'choice';

  const btn = (label: string, variant: string, onClick: () => void, hotkey?: string): HTMLButtonElement => {
    const b = el('button', { className: `btn ${variant} challenge-btn`, attrs: { type: 'button' }, children: [hotkey ? el('kbd', { className: 'challenge-key', text: hotkey }) : null, el('span', { text: label })] });
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    return b;
  };

  const finish = (result: ChallengeResult): void => {
    stopLoops();
    resolved = true;
    const text = options.onResolve(result);
    showResult(result, text);
  };

  const showResult = (result: ChallengeResult, text: string): void => {
    view = 'result';
    const good = (result.kind === 'odgj' && result.success) || (result.kind === 'ormas' && result.method === 'usir' && result.won);
    setText(title, good ? tr('Berhasil') : result.kind === 'ormas' && result.method === 'bayar' ? tr('Sudah dibayar') : tr('Belum berhasil'));
    const ok = btn(tr('Lanjut berjualan'), 'btn-primary', close, '↵');
    body.replaceChildren(el('p', { className: `challenge-result ${good ? 'is-good' : 'is-bad'}`, text }), el('div', { className: 'challenge-actions', children: [ok] }));
    keyHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        close();
        return true;
      }
      return false;
    };
    ok.focus({ preventScroll: true });
  };

  // ---------- pilihan awal ----------

  const showChoice = (): void => {
    view = 'choice';
    const skip = el('button', { className: 'challenge-skip', attrs: { type: 'button' }, text: options.kind === 'odgj' ? tr('Lewati (berikan teh & nasi)') : tr('Lewati (bayar saja)') });
    skip.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (options.kind === 'ormas') finish({ kind: 'ormas', method: 'bayar' });
      else {
        const gifts: string[] = [];
        const drink = options.giftFor('minum', gifts);
        if (drink) gifts.push(drink);
        const food = options.giftFor('makan', gifts);
        if (food) gifts.push(food);
        finish({ kind: 'odgj', method: 'halus', success: true, gifts });
      }
    });
    const later = el('button', { className: 'challenge-skip', attrs: { type: 'button' }, text: tr('Nanti saja') });
    later.addEventListener('click', (ev) => {
      ev.stopPropagation();
      close();
    });
    if (options.kind === 'odgj') {
      setText(title, tr('Ada yang butuh bantuan'));
      const a = btn(tr('Usir secara halus'), 'btn-primary', () => startRhythm(), '1');
      const b = btn(tr('Minta bantuan warga'), 'btn-secondary', () => startPhone(), '2');
      body.replaceChildren(
        el('p', { className: 'challenge-text', text: tr('Seorang ODGJ berdiri di dekat gerobak. Dia tidak berbahaya, tapi beberapa pelanggan mulai menjauh. Sampai jam 22.00 dia akan tetap di sini kalau dibiarkan.') }),
        el('div', { className: 'challenge-actions', children: [a, b] }),
        el('p', { className: 'challenge-note', text: tr('Halus: ikuti senandungnya sampai dia tenang. Warga: telepon orang yang sedang online.') }),
        el('div', { className: 'challenge-links', children: [skip, later] }),
      );
      keyHandler = (e) => (e.key === '1' ? (startRhythm(), true) : e.key === '2' ? (startPhone(), true) : false);
      a.focus({ preventScroll: true });
    } else {
      setText(title, tr('Ormas minta uang keamanan'));
      const amount = options.amount ?? 0;
      const a = btn(tr('Bayar {amount}', { amount: formatRupiah(amount) }), 'btn-secondary', () => finish({ kind: 'ormas', method: 'bayar' }), '1');
      const b = btn(tr('Usir'), 'btn-primary', () => startGather(), '2');
      body.replaceChildren(
        el('p', {
          className: 'challenge-text',
          text: tr('Dua orang berjaket ormas mendekati gerobak dan meminta {amount} ({percent}% dari hasil dagang kemarin).', { amount: formatRupiah(amount), percent: options.percent ?? 10 }),
        }),
        el('div', { className: 'challenge-actions', children: [a, b] }),
        el('p', { className: 'challenge-note', text: tr('Usir = kumpulkan warga dalam 10 detik. Gagal: bayar 20% dari hasil dagang kemarin.') }),
        el('div', { className: 'challenge-links', children: [skip, later] }),
      );
      keyHandler = (e) => (e.key === '1' ? (finish({ kind: 'ormas', method: 'bayar' }), true) : e.key === '2' ? (startGather(), true) : false);
      b.focus({ preventScroll: true });
    }
  };

  // ---------- Ikuti iramanya (ODGJ, cara halus) ----------

  const startRhythm = (): void => {
    view = 'game';
    stopLoops();
    const setup = rhythmSetup(rng, options.tier);
    setText(title, tr('Ikuti iramanya'));
    let meter = setup.start;
    let next = 0;
    let hits = 0;
    const judged = new Set<number>();
    const fill = el('div', { className: 'challenge-meter-fill' });
    const meterEl = el('div', { className: 'challenge-meter', attrs: { role: 'progressbar', 'aria-label': tr('Meter tenang'), 'aria-valuemin': '0', 'aria-valuemax': '100' }, children: [fill] });
    const target = el('div', { className: 'rhythm-target' });
    const lane = el('div', { className: 'rhythm-lane', attrs: { 'aria-hidden': 'true' }, children: [target] });
    const noteEls = setup.notes.map((note) => {
      const n = el('div', { className: 'rhythm-note', attrs: { 'data-time': note.time.toFixed(3) } });
      lane.append(n);
      return n;
    });
    const grade = el('p', { className: 'challenge-note rhythm-grade', text: tr('Dia mulai bersenandung "{song}"…', { song: setup.pattern.name }) });
    const tapBtn = el('button', { className: 'btn btn-primary challenge-drum rhythm-tap', attrs: { type: 'button', 'aria-label': tr('Ketuk mengikuti irama') }, children: [el('span', { className: 'challenge-drum-icon', text: '🎵' }), el('span', { text: tr('Ketuk mengikuti irama') })] });
    const giftBtn = btn(tr('☕ Beri teh hangat'), 'btn-secondary', () => {
      const gift = options.giftFor('minum', []);
      if (gift) finish({ kind: 'odgj', method: 'halus', success: true, gifts: [gift] });
    });
    giftBtn.hidden = true;
    const t0 = performance.now();
    lane.dataset.start = String(t0);
    const now = (): number => (performance.now() - t0) / 1000;
    const render = (): void => {
      fill.style.width = `${meter}%`;
      fill.classList.toggle('is-high', meter >= 70);
      meterEl.setAttribute('aria-valuenow', String(Math.round(meter)));
    };
    const showGrade = (g: HitGrade): void => {
      setText(grade, g === 'tepat' ? tr('Pas!') : g === 'cukup' ? tr('Cukup') : tr('Meleset…'));
      grade.dataset.grade = g;
      target.classList.remove('is-hit', 'is-miss');
      void target.offsetWidth;
      target.classList.add(g === 'meleset' ? 'is-miss' : 'is-hit');
    };
    // Waktu ketukan diambil dari stempel waktu event (bukan saat handler jalan), supaya HP yang lambat tetap adil.
    const tap = (at = performance.now()): void => {
      if (view !== 'game') return;
      const t = (at - t0) / 1000;
      let best = -1;
      let bestD = Infinity;
      setup.notes.forEach((n, i) => {
        if (judged.has(i)) return;
        const d = Math.abs(t - n.time);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const n = setup.notes[best];
      if (!n || bestD > setup.good * 2.2) {
        meter = meterAfter(meter, 'meleset', setup);
        audio?.tick(false);
        showGrade('meleset');
        render();
        return;
      }
      judged.add(best);
      const g = gradeTap(t - n.time, setup);
      meter = meterAfter(meter, g, setup);
      if (g !== 'meleset') hits++;
      noteEls[best]?.classList.add(g === 'meleset' ? 'is-miss' : 'is-hit');
      audio?.tick(g !== 'meleset');
      showGrade(g);
      render();
      if (meter >= 100) finish({ kind: 'odgj', method: 'halus', success: true, gifts: [] });
    };
    tapBtn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      tap(ev.timeStamp);
    });
    tapBtn.addEventListener('click', (ev) => ev.stopPropagation());
    body.replaceChildren(
      el('div', { className: 'challenge-row', children: [el('span', { className: 'challenge-label', text: tr('Tenang') }), meterEl] }),
      lane,
      grade,
      tapBtn,
      giftBtn,
      el('p', { className: 'challenge-note', text: tr('Ketuk saat not masuk lingkaran. Suara mati pun tetap bisa: lihat lingkaran yang berdenyut.') }),
    );
    keyHandler = (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        tap(e.timeStamp);
        return true;
      }
      return false;
    };
    const LEAD = 1.6;
    const loop = (): void => {
      const t = now();
      setup.notes.forEach((n, i) => {
        const ne = noteEls[i];
        if (!ne) return;
        const ahead = n.time - t;
        // Not bergerak dari kanan ke lingkaran (kiri) selama LEAD detik.
        const pos = 18 + (ahead / LEAD) * 82;
        ne.style.left = `${pos}%`;
        ne.style.opacity = ahead > LEAD || ahead < -0.3 ? '0' : '1';
        if (i >= next && t >= n.time) {
          next = i + 1;
          audio?.hum(n.pitch, setup.beat * 0.8);
          target.classList.remove('is-pulse');
          void target.offsetWidth;
          target.classList.add('is-pulse');
        }
        // Not yang lewat tanpa diketuk dihitung meleset.
        // Beri jeda ekstra untuk ketukan yang masih antre di HP lambat.
        if (!judged.has(i) && t - n.time > setup.good + 0.25) {
          judged.add(i);
          ne.classList.add('is-miss');
          meter = meterAfter(meter, 'meleset', setup);
          render();
        }
      });
      // Tenang separuh jalan: tawarkan teh hangat sebagai penutup (memakai stok).
      if (meter >= 60 && giftBtn.hidden && options.giftFor('minum', [])) giftBtn.hidden = false;
      if (t >= setup.duration) return finish({ kind: 'odgj', method: 'halus', success: meter >= 100 || (hits >= setup.notes.length * 0.85 && meter >= 80), gifts: [] });
      frame = requestAnimationFrame(loop);
    };
    render();
    frame = requestAnimationFrame(loop);
    tapBtn.focus({ preventScroll: true });
  };

  // ---------- Telepon berantai (ODGJ, minta bantuan warga) ----------

  const startPhone = (): void => {
    view = 'game';
    stopLoops();
    const setup = phoneSetup(options.tier);
    setText(title, tr('Telepon berantai'));
    let connected = 0;
    let lockedUntil = 0;
    const status = new Map<string, ContactStatus>();
    const ringing = new Set<string>();
    const done = new Set<string>();
    const fill = el('div', { className: 'challenge-meter-fill is-high' });
    const meter = el('div', { className: 'challenge-meter', children: [fill] });
    const count = el('span', { className: 'challenge-label' });
    const time = el('div', { className: 'challenge-time-fill' });
    const note = el('p', { className: 'challenge-note', text: tr('Ketuk kontak yang sedang online. Yang sibuk membuatmu menunggu sebentar.') });
    const list = el('div', { className: 'phone-list' });
    const STATUS_LABEL: Record<ContactStatus, string> = { online: tr('online'), sibuk: tr('sibuk'), jalan: tr('di jalan') };
    const buttons = options.contacts.map((c, i) => {
      const dot = el('span', { className: 'phone-dot' });
      const st = el('span', { className: 'phone-status' });
      const b = el('button', {
        className: 'btn btn-secondary phone-contact',
        attrs: { type: 'button' },
        children: [el('kbd', { className: 'challenge-key', text: String(i + 1) }), dot, el('span', { className: 'phone-name', text: c.name }), st],
      });
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        call(c.id);
      });
      list.append(b);
      return { c, b, st };
    });
    const render = (): void => {
      fill.style.width = `${Math.min(100, (connected / setup.need) * 100)}%`;
      setText(count, tr('{n}/{need} datang', { n: connected, need: setup.need }));
      const locked = performance.now() < lockedUntil;
      for (const { c, b, st } of buttons) {
        const s = done.has(c.id) ? 'done' : ringing.has(c.id) ? 'ring' : (status.get(c.id) ?? 'sibuk');
        b.dataset.status = s;
        b.disabled = done.has(c.id);
        b.classList.toggle('is-locked', locked);
        setText(st, s === 'done' ? tr('✓ datang') : s === 'ring' ? tr('berdering…') : STATUS_LABEL[s as ContactStatus]);
      }
    };
    const flip = (): void => {
      for (const { c } of buttons) {
        if (done.has(c.id) || ringing.has(c.id)) continue;
        status.set(c.id, nextStatus(rng, c));
      }
      // Pastikan selalu ada setidaknya satu kontak online.
      const open = buttons.filter(({ c }) => !done.has(c.id) && !ringing.has(c.id));
      if (open.length && !open.some(({ c }) => status.get(c.id) === 'online')) status.set(rng.pick(open).c.id, 'online');
      render();
      timers.push(window.setTimeout(flip, setup.flip * 1000));
    };
    const call = (id: string): void => {
      if (view !== 'game' || done.has(id) || ringing.has(id) || performance.now() < lockedUntil) return;
      if (status.get(id) !== 'online') {
        lockedUntil = performance.now() + setup.busyPenalty * 1000;
        setText(note, tr('Tidak diangkat… tunggu sebentar.'));
        render();
        timers.push(window.setTimeout(render, setup.busyPenalty * 1000 + 20));
        return;
      }
      ringing.add(id);
      render();
      timers.push(
        window.setTimeout(() => {
          ringing.delete(id);
          done.add(id);
          connected++;
          const name = options.contacts.find((c) => c.id === id)?.name ?? '';
          setText(note, tr('{name}: "Saya ke sana sekarang."', { name }));
          render();
          if (connected >= setup.need) finish({ kind: 'odgj', method: 'warga', success: true });
        }, setup.ring * 1000),
      );
    };
    body.replaceChildren(el('div', { className: 'challenge-row', children: [count, meter] }), el('div', { className: 'challenge-time', children: [time] }), list, note);
    keyHandler = (e) => {
      const b = buttons[Number(e.key) - 1];
      if (b) {
        call(b.c.id);
        return true;
      }
      return false;
    };
    flip();
    const start = performance.now();
    const loop = (nowMs: number): void => {
      const t = (nowMs - start) / 1000;
      time.style.width = `${Math.max(0, 100 - (t / setup.seconds) * 100)}%`;
      if (t >= setup.seconds) return finish({ kind: 'odgj', method: 'warga', success: connected >= setup.need });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    buttons[0]?.b.focus({ preventScroll: true });
  };

  // ---------- Kumpulkan warga (ormas) ----------

  const startGather = (): void => {
    view = 'game';
    stopLoops();
    const setup = gatherSetup(options.tier);
    setText(title, tr('Kumpulkan warga'));
    const autos = options.crowd.filter((c) => c.stage >= 2);
    let count = Math.min(setup.need - 1, autoSupporters(options.crowd.map((c) => c.stage)));
    const fill = el('div', { className: 'challenge-meter-fill is-high' });
    const meter = el('div', { className: 'challenge-meter', children: [fill] });
    const label = el('span', { className: 'challenge-label' });
    const time = el('div', { className: 'challenge-time-fill' });
    const say = el('p', { className: 'gather-say', text: tr('Ketua ormas: "Uang keamanan. Atau mau ribut?"') });
    const field = el('div', { className: 'gather-field' });
    const back = el('div', { className: 'gather-back', attrs: { 'aria-label': tr('Warga di belakangmu') } });
    const named = options.crowd.filter((c) => c.stage < 2).map((c) => c.name);
    const generic = [tr('Warga'), tr('Pemuda'), tr('Ibu warung'), tr('Tukang parkir'), tr('Pak RT'), tr('Mahasiswa'), tr('Hansip'), tr('Pembeli')];
    const names = [...named, ...generic].slice(0, 8);
    while (names.length < 8) names.push(tr('Warga'));
    const LINES = [tr('"Ada apa ini?"'), tr('"Saya di sini."'), tr('"Jangan ganggu warung kami."'), tr('"Mau saya panggilkan RT?"'), tr('"Pergi sana!"'), tr('"Kami semua saksinya."')];
    const addBack = (name: string): void => {
      back.append(el('span', { className: 'gather-chip', text: name }));
    };
    for (const a of autos.slice(0, count)) addBack(a.name);
    const spots = names.map((name, i) => {
      const hand = el('button', { className: 'gather-hand', attrs: { type: 'button', 'aria-label': tr('Ajak {name}', { name }) }, text: '✋' });
      const person = el('div', { className: 'gather-person', children: [hand, el('span', { className: 'gather-avatar', text: '🧍' }), el('span', { className: 'gather-name', text: name })] });
      field.append(person);
      const spot = { name, person, hand, up: false, fake: false, joined: false, i };
      hand.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        press(spot);
      });
      hand.addEventListener('click', (ev) => ev.stopPropagation());
      return spot;
    });
    type Spot = (typeof spots)[number];
    const render = (): void => {
      fill.style.width = `${Math.min(100, (count / setup.need) * 100)}%`;
      setText(label, tr('{n}/{need} warga', { n: count, need: setup.need }));
    };
    const press = (s: Spot): void => {
      if (view !== 'game' || !s.up) return;
      s.up = false;
      s.person.classList.remove('is-up', 'is-fake');
      count = gatherAfter(count, s.fake);
      if (s.fake) {
        setText(say, tr('Ketua ormas: "Hah, itu orang kami!"'));
        s.person.classList.add('is-shake');
        timers.push(window.setTimeout(() => s.person.classList.remove('is-shake'), 300));
      } else {
        s.joined = true;
        s.person.classList.add('is-joined');
        addBack(s.name);
        setText(say, `${s.name}: ${LINES[(count - 1) % LINES.length]}`);
      }
      render();
      if (count >= setup.need) finish({ kind: 'ormas', method: 'usir', won: true });
    };
    const pop = (): void => {
      if (view !== 'game') return;
      const free = spots.filter((s) => !s.joined && !s.up);
      if (free.length) {
        const s = rng.pick(free);
        s.fake = rng.chance(setup.fake);
        s.up = true;
        s.hand.textContent = s.fake ? '✋' : '✋';
        s.person.classList.add('is-up');
        s.person.classList.toggle('is-fake', s.fake);
        timers.push(
          window.setTimeout(() => {
            s.up = false;
            s.person.classList.remove('is-up', 'is-fake');
          }, setup.show * 1000),
        );
      }
      timers.push(window.setTimeout(pop, (setup.gap + rng.next() * 0.25) * 1000));
    };
    body.replaceChildren(
      el('div', { className: 'challenge-row', children: [label, meter] }),
      el('div', { className: 'challenge-time', children: [time] }),
      say,
      field,
      back,
      el('p', { className: 'challenge-note', text: setup.fake ? tr('Ketuk tangan kuning. Awas tangan merah: anggota ormas yang menyamar (−1).') : tr('Ketuk tangan kuning sebelum turun lagi.') }),
    );
    if (autos.length) setText(say, tr('{names} langsung berdiri di belakangmu.', { names: autos.slice(0, count).map((a) => a.name).join(', ') }));
    keyHandler = (e) => {
      const s = spots[Number(e.key) - 1];
      if (s) {
        press(s);
        return true;
      }
      return false;
    };
    render();
    timers.push(window.setTimeout(pop, 300));
    const start = performance.now();
    const loop = (nowMs: number): void => {
      const t = (nowMs - start) / 1000;
      time.style.width = `${Math.max(0, 100 - (t / setup.seconds) * 100)}%`;
      if (t >= setup.seconds) return finish({ kind: 'ormas', method: 'usir', won: count >= setup.need });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  };

  // Ketukan sintetis dari balon di layar sentuh jangan langsung menekan tombol.
  root.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey, true);
  current = { close };
  showChoice();
  ui.layers.hud.append(root);
  requestAnimationFrame(() => root.classList.add('is-visible'));
}
