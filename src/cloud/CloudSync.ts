import { GAME_CONFIG } from '../config/gameConfig';
import type { GameContext } from '../core/GameContext';
import { SaveSystem, sealIntact } from '../systems/SaveSystem';
import type { UIManager } from '../ui/UIManager';
import { formatRupiah } from '../utils/formatting';
import { cloudConfigured } from './config';
import { cloudSeal } from '../systems/saveSeal';
import type { CloudUser } from './firebase';
import { locale, tr } from '../i18n/i18n';

type Fb = typeof import('./firebase');

/** Pernah login di perangkat ini → muat Firebase saat start supaya sesi langsung pulih. */
const FLAG = 'juragan-angkringan:akun';
/** Unggah paling cepat sekali per interval ini selama bermain. */
const UPLOAD_EVERY_MS = 30_000;
const USERNAME_COOLDOWN_MS = 30 * 86_400_000;

/** Kata yang tidak boleh ada di username (saringan sederhana, huruf kecil). */
const BLOCKED = ['anjing', 'bangsat', 'babi', 'kontol', 'memek', 'ngentot', 'goblok', 'tolol', 'jancok', 'asu', 'admin', 'moderator', 'fuck', 'shit'];

/** Rekor leaderboard dari teks save; null jika save ditandai diubah di luar game. */
export function scoreFromSave(text: string): Omit<import('./firebase').ScoreDoc, 'username'> | null {
  try {
    const st = (JSON.parse(text) as { state?: { tampered?: boolean; calendar?: { day: number }; player?: { money: number }; stats?: { bestDayRevenue?: number; bestDayProfit?: number; worstDayLoss?: number; peakMoney?: number }; history?: { revenue: number; money: number; netProfit: number }[] } }).state;
    if (!st?.calendar || st.tampered || !sealIntact(text)) return null;
    const hist = st.history ?? [];
    return {
      longestDay: Math.max(1, Math.round(st.calendar.day)),
      bestDayRevenue: Math.round(st.stats?.bestDayRevenue ?? Math.max(0, ...hist.map((h) => h.revenue))),
      bestDayProfit: Math.round(Math.max(0, st.stats?.bestDayProfit ?? Math.max(0, ...hist.map((h) => h.netProfit)))),
      worstDayLoss: Math.round(Math.max(0, st.stats?.worstDayLoss ?? Math.max(0, ...hist.map((h) => -h.netProfit)))),
      peakMoney: Math.round(Math.max(st.stats?.peakMoney ?? 0, st.player?.money ?? 0, ...hist.map((h) => h.money))),
    };
  } catch {
    return null;
  }
}

/** Alasan username ditolak, atau null jika boleh. */
export function usernameProblem(name: string): string | null {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return tr('Username 3–16 karakter: huruf, angka, atau garis bawah (_).');
  const lower = name.toLowerCase();
  if (BLOCKED.some((w) => lower.includes(w))) return tr('Username mengandung kata yang tidak diizinkan.');
  return null;
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

/**
 * Akun & simpan di awan (opsional). Tanpa login, save tetap hanya di LocalStorage seperti biasa.
 * Saat login: save di perangkat dibandingkan dengan save di akun; jika keduanya ada dan berbeda,
 * pemain memilih mana yang dipakai. Selama bermain, save diunggah berkala & saat keluar ke menu.
 */
export class CloudSync {
  user: CloudUser | null = null;
  /** Profil publik (username). null = belum diambil; `{username:''}` = belum punya username. */
  profile: { username: string; changedAt: number | null } | null = null;
  status: SyncStatus = 'off';
  lastSync: string | null = null;
  lastError: string | null = null;
  private fb: Fb | null = null;
  private loading: Promise<Fb> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastUploaded = '';
  private hold = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly ctx: GameContext,
    private ui: UIManager | null = null,
  ) {
    if (!cloudConfigured()) return;
    if (localStorage.getItem(FLAG) === '1') void this.load();
    ctx.bus.on('save:completed', () => this.schedule());
    ctx.bus.on('game:return-to-menu', () => void this.upload());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.upload();
    });
  }

  get available(): boolean {
    return cloudConfigured();
  }

  setUI(ui: UIManager): void {
    this.ui = ui;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  /** Muat modul Firebase (sekali). */
  load(): Promise<Fb> {
    if (this.fb) return Promise.resolve(this.fb);
    this.loading ??= import('./firebase').then((fb) => {
      this.fb = fb;
      fb.watchUser((u) => {
        const was = this.user?.uid;
        this.user = u;
        this.status = u ? 'idle' : 'off';
        if (u) localStorage.setItem(FLAG, '1');
        else localStorage.removeItem(FLAG);
        this.emit();
        if (u && u.uid !== was) {
          void this.reconcile();
          void this.loadProfile();
        }
        if (!u) {
          this.profile = null;
          this.bestScore = undefined;
        }
      });
      return fb;
    });
    return this.loading;
  }

  async signInGoogle(): Promise<void> {
    await (await this.load()).signInGoogle();
  }
  async signInEmail(email: string, password: string, create: boolean): Promise<void> {
    const fb = await this.load();
    await (create ? fb.signUpEmail(email, password) : fb.signInEmail(email, password));
  }
  async resetPassword(email: string): Promise<void> {
    await (await this.load()).resetPassword(email);
  }
  async signOut(): Promise<void> {
    await this.upload();
    await (await this.load()).logOut();
  }
  errorText(e: unknown): string {
    if ((e as { code?: string }).code === 'username/invalid') return (e as Error).message;
    return this.fb ? this.fb.authErrorMessage(e) : (e as Error).message;
  }

  private async loadProfile(): Promise<void> {
    if (!this.user || !this.fb) return;
    try {
      this.profile = (await this.fb.getProfile(this.user.uid)) ?? { username: '', changedAt: null };
    } catch {
      this.profile = null;
    }
    this.emit();
  }

  /** Belum punya username → wajib memilih sebelum tampil di leaderboard. */
  get needsUsername(): boolean {
    return Boolean(this.user && this.profile && !this.profile.username);
  }

  /** Hari tersisa sebelum boleh ganti username lagi (0 = boleh). */
  get usernameCooldownDays(): number {
    const at = this.profile?.changedAt;
    if (!at) return 0;
    return Math.max(0, Math.ceil((at + USERNAME_COOLDOWN_MS - Date.now()) / 86_400_000));
  }

  async setUsername(name: string): Promise<void> {
    const problem = usernameProblem(name);
    if (problem) throw Object.assign(new Error(problem), { code: 'username/invalid', message: problem });
    if (!this.user) throw new Error(tr('Belum masuk akun.'));
    const fb = await this.load();
    await fb.claimUsername(this.user.uid, name, this.profile?.username || null);
    this.profile = { username: name, changedAt: Date.now() };
    this.emit();
    // Perbarui nama di leaderboard.
    this.bestScore = undefined;
    const text = this.ctx.saves.exportText();
    if (text) void this.submitScore(text);
  }

  private schedule(): void {
    if (!this.user || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.upload();
    }, UPLOAD_EVERY_MS);
  }

  /** Unggah save perangkat ke akun (jika berubah sejak unggahan terakhir). */
  async upload(force = false): Promise<boolean> {
    if (!this.user || !this.fb || this.hold) return false;
    const text = this.ctx.saves.exportText();
    if (!text || (!force && text === this.lastUploaded)) return true;
    const sum = SaveSystem.summarize(text);
    this.status = 'syncing';
    this.emit();
    try {
      await this.fb.uploadSave(this.user.uid, {
        text,
        day: Math.max(1, Math.round(sum?.day ?? 1)),
        money: sum?.money ?? 0,
        savedAt: sum?.savedAt ?? new Date().toISOString(),
        version: GAME_CONFIG.version,
        sig: await cloudSeal(text),
      });
      this.lastUploaded = text;
      this.lastSync = new Date().toISOString();
      this.status = 'ok';
      this.lastError = null;
      void this.submitScore(text);
      return true;
    } catch (e) {
      this.status = 'error';
      this.lastError = this.fb.authErrorMessage(e);
      return false;
    } finally {
      this.emit();
    }
  }

  /** Skor terakhir di leaderboard (rekor terbaik akun, tidak pernah turun). */
  private bestScore: import('./firebase').ScoreDoc | null | undefined;

  /**
   * Kirim rekor ke leaderboard dari save terbaru. Dilewati jika belum punya username
   * atau save pernah diubah di luar game. Nilai yang dikirim = maksimum dengan rekor sebelumnya.
   */
  private async submitScore(text: string): Promise<void> {
    if (!this.user || !this.fb || !this.profile?.username) return;
    const m = scoreFromSave(text);
    if (!m) return;
    try {
      if (this.bestScore === undefined) this.bestScore = await this.fb.getScore(this.user.uid);
      const prev = this.bestScore;
      const next = {
        username: this.profile.username,
        longestDay: Math.max(prev?.longestDay ?? 1, m.longestDay),
        bestDayRevenue: Math.max(prev?.bestDayRevenue ?? 0, m.bestDayRevenue),
        bestDayProfit: Math.max(prev?.bestDayProfit ?? 0, m.bestDayProfit),
        worstDayLoss: Math.max(prev?.worstDayLoss ?? 0, m.worstDayLoss),
        peakMoney: Math.max(prev?.peakMoney ?? 0, m.peakMoney),
      };
      if (prev && prev.username === next.username && prev.longestDay === next.longestDay && prev.bestDayRevenue === next.bestDayRevenue && prev.bestDayProfit === next.bestDayProfit && prev.worstDayLoss === next.worstDayLoss && prev.peakMoney === next.peakMoney) return;
      await this.fb.submitScore(this.user.uid, next);
      this.bestScore = next;
    } catch {
      /* skor gagal terkirim (mis. ditolak aturan) — coba lagi di unggahan berikutnya */
      this.bestScore = undefined;
    }
  }

  // ---------- Leaderboard ----------
  async leaderboard(field: import('./firebase').ScoreField): Promise<{ rows: import('./firebase').ScoreRow[]; mine: import('./firebase').ScoreDoc | null; myRank: number | null }> {
    const fb = await this.load();
    const rows = await fb.topScores(field, 50);
    let mine: import('./firebase').ScoreDoc | null = null;
    let myRank: number | null = null;
    if (this.user) {
      mine = rows.find((r) => r.uid === this.user!.uid) ?? (await fb.getScore(this.user.uid));
      if (mine) myRank = await fb.rankOf(field, mine[field]);
    }
    return { rows, mine, myRank };
  }

  /** Save di perangkat sedang ditandai diubah di luar game (tidak bisa masuk leaderboard). */
  localTampered(): boolean {
    const text = this.ctx.saves.exportText();
    return Boolean(text) && scoreFromSave(text!) === null;
  }

  /** Setelah login: samakan save perangkat & akun. */
  async reconcile(): Promise<void> {
    if (!this.user || !this.fb) return;
    this.status = 'syncing';
    this.emit();
    let cloud: Awaited<ReturnType<Fb['downloadSave']>>;
    try {
      cloud = await this.fb.downloadSave(this.user.uid);
    } catch (e) {
      this.status = 'error';
      this.lastError = this.fb.authErrorMessage(e);
      this.emit();
      return;
    }
    // Segel tidak cocok = dokumen diubah di luar game → abaikan save akun.
    if (cloud && cloud.sig !== (await cloudSeal(cloud.text))) {
      this.ctx.notify(tr('Save di akun tidak valid (diubah di luar game) dan diabaikan.'), 'error', 6000);
      cloud = null;
    }
    const localText = this.ctx.saves.exportText();
    const local = localText ? SaveSystem.summarize(localText) : null;
    if (!cloud) {
      if (localText) await this.upload(true);
      else {
        this.status = 'ok';
        this.emit();
      }
      return;
    }
    if (!localText || localText === cloud.text) {
      if (!localText) this.useCloud(cloud.text);
      this.lastUploaded = cloud.text;
      this.status = 'ok';
      this.lastSync = new Date().toISOString();
      this.emit();
      return;
    }
    // Keduanya ada & berbeda: biarkan pemain memilih.
    this.status = 'idle';
    this.emit();
    this.askConflict(local, { day: cloud.day, money: cloud.money, savedAt: cloud.savedAt }, cloud.text);
  }

  private useCloud(text: string): void {
    try {
      this.ctx.saves.importText(text);
      this.lastUploaded = text;
      this.ctx.notify(tr('Progres dari akun dimuat ke perangkat ini.'), 'success');
      this.ctx.bus.emit('cloud:save-replaced');
    } catch (e) {
      this.ctx.notify(tr('Save di akun tidak bisa dimuat: {message}', { message: (e as Error).message }), 'error', 6000);
    }
  }

  private askConflict(local: ReturnType<typeof SaveSystem.summarize>, cloud: { day: number; money: number; savedAt: string }, cloudText: string): void {
    const when = (iso: string): string => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');
    const line = (s: { day: number; money: number; savedAt: string } | null): string => (s ? tr('Hari {day} · {money} · disimpan {savedAt}', { day: s.day, money: formatRupiah(s.money), savedAt: when(s.savedAt) }) : '—');
    const inGame = this.ctx.autosaveRunning;
    if (!this.ui) return;
    this.ui.openModal({
      title: tr('Ada dua progres berbeda'),
      body: tr('Akun: {cloud}\nPerangkat ini: {local}\n\nPilih progres yang mau dipakai. Yang tidak dipilih akan ditimpa (salinan cadangan tetap disimpan di perangkat).{2}', { cloud: line(cloud), local: line(local), 2: inGame ? tr('\n\nMemakai progres akun akan membawamu kembali ke menu utama.') : '' }),
      actions: [
        {
          label: tr('Pakai perangkat ini'),
          onClick: () => void this.upload(true),
        },
        {
          label: tr('Pakai akun'),
          variant: 'primary',
          onClick: () => {
            // Jangan unggah progres perangkat saat kembali ke menu — progres akun yang dipakai.
            this.hold = true;
            if (inGame) this.ctx.bus.emit('game:return-to-menu');
            this.useCloud(cloudText);
            this.hold = false;
            this.status = 'ok';
            this.lastSync = new Date().toISOString();
            this.emit();
          },
        },
      ],
    });
  }
}
