/**
 * Firebase (dimuat hanya saat dibutuhkan, lewat import dinamis) — login Google / email
 * dan penyimpanan save di Firestore: koleksi `saves`, dokumen = uid pemain.
 */
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User,
} from 'firebase/auth';
import { collection, doc, getCountFromServer, getDoc, getDocsFromServer, getFirestore, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './config';
import { tr } from '../i18n/i18n';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
auth.languageCode = 'id';
const db = getFirestore(app);
const ready = setPersistence(auth, browserLocalPersistence).then(() => getRedirectResult(auth).catch(() => null));

export interface CloudUser {
  uid: string;
  email: string | null;
  name: string | null;
  provider: 'google' | 'email';
}

function toUser(u: User | null): CloudUser | null {
  if (!u) return null;
  return { uid: u.uid, email: u.email, name: u.displayName, provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'email' };
}

export function watchUser(cb: (u: CloudUser | null) => void): () => void {
  let off = (): void => undefined;
  void ready.then(() => {
    off = onAuthStateChanged(auth, (u) => cb(toUser(u)));
  });
  return () => off();
}

export async function signInGoogle(): Promise<void> {
  await ready;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // Aplikasi terpasang (PWA) sering memblokir popup → pakai redirect.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  if (standalone) await signInWithRedirect(auth, provider);
  else await signInWithPopup(auth, provider);
}

export async function signInEmail(email: string, password: string): Promise<void> {
  await ready;
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(email: string, password: string): Promise<void> {
  await ready;
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email: string): Promise<void> {
  await ready;
  await sendPasswordResetEmail(auth, email);
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export interface CloudSaveDoc {
  text: string;
  day: number;
  money: number;
  savedAt: string;
  version: string;
  /** SHA-256(SALT + text), dicek aturan Firestore. */
  sig: string;
}

export async function downloadSave(uid: string): Promise<CloudSaveDoc | null> {
  const snap = await getDoc(doc(db, 'saves', uid));
  return snap.exists() ? (snap.data() as CloudSaveDoc) : null;
}

export async function uploadSave(uid: string, data: CloudSaveDoc): Promise<void> {
  await setDoc(doc(db, 'saves', uid), { ...data, updatedAt: serverTimestamp() });
}

// ---------- Leaderboard: scores/{uid} ----------
export type ScoreField = 'longestDay' | 'bestDayRevenue' | 'bestDayProfit' | 'worstDayLoss' | 'peakMoney';

export interface ScoreDoc {
  username: string;
  longestDay: number;
  bestDayRevenue: number;
  bestDayProfit: number;
  worstDayLoss: number;
  peakMoney: number;
}

export interface ScoreRow extends ScoreDoc {
  uid: string;
}

export async function getScore(uid: string): Promise<ScoreDoc | null> {
  const snap = await getDoc(doc(db, 'scores', uid));
  return snap.exists() ? (snap.data() as ScoreDoc) : null;
}

export async function submitScore(uid: string, score: ScoreDoc): Promise<void> {
  await setDoc(doc(db, 'scores', uid), { ...score, updatedAt: serverTimestamp() });
}

export async function topScores(field: ScoreField, n = 50): Promise<ScoreRow[]> {
  const snap = await getDocsFromServer(query(collection(db, 'scores'), orderBy(field, 'desc'), limit(n)));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as ScoreDoc) }));
}

/** Peringkat (1 = teratas) untuk nilai tertentu: jumlah skor yang lebih tinggi + 1. */
export async function rankOf(field: ScoreField, value: number): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'scores'), where(field, '>', value)));
  return snap.data().count + 1;
}

export interface Profile {
  username: string;
  /** Kapan terakhir diganti (ms). */
  changedAt: number | null;
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as { username: string; changedAt?: { toMillis(): number } };
  return { username: d.username, changedAt: d.changedAt?.toMillis() ?? null };
}

/**
 * Pasang / ganti username. Keunikan dijamin dokumen `usernames/{huruf_kecil}` (aturan Firestore
 * melarang dua akun memakai nama yang sama); nama lama dilepas dalam batch yang sama.
 */
export async function claimUsername(uid: string, username: string, previous: string | null): Promise<void> {
  const lower = username.toLowerCase();
  const taken = await getDoc(doc(db, 'usernames', lower));
  if (taken.exists() && (taken.data() as { uid: string }).uid !== uid) throw Object.assign(new Error('taken'), { code: 'username/taken' });
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', lower), { uid });
  batch.set(doc(db, 'users', uid), { username, usernameLower: lower, changedAt: serverTimestamp() });
  if (previous && previous.toLowerCase() !== lower) batch.delete(doc(db, 'usernames', previous.toLowerCase()));
  await batch.commit();
}

/** Pesan error Firebase dalam bahasa pemain. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'username/taken': tr('Username sudah dipakai pemain lain. Coba yang lain.'),
    'auth/invalid-email': tr('Format email tidak valid.'),
    'auth/missing-password': tr('Isi kata sandi.'),
    'auth/weak-password': tr('Kata sandi minimal 6 karakter.'),
    'auth/email-already-in-use': tr('Email ini sudah terdaftar. Pilih "Masuk".'),
    'auth/invalid-credential': tr('Email atau kata sandi salah.'),
    'auth/wrong-password': tr('Email atau kata sandi salah.'),
    'auth/user-not-found': tr('Akun dengan email ini belum ada. Pilih "Daftar".'),
    'auth/too-many-requests': tr('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'),
    'auth/popup-closed-by-user': tr('Jendela login ditutup sebelum selesai.'),
    'auth/cancelled-popup-request': tr('Jendela login ditutup sebelum selesai.'),
    'auth/popup-blocked': tr('Popup login diblokir browser. Izinkan popup lalu coba lagi.'),
    'auth/network-request-failed': tr('Tidak ada koneksi internet.'),
    'auth/unauthorized-domain': tr('Alamat situs ini belum diizinkan di Firebase (Authorized domains).'),
    'permission-denied': tr('Akses ke penyimpanan akun ditolak (cek aturan Firestore).'),
    unavailable: tr('Server penyimpanan tidak bisa dihubungi. Coba lagi nanti.'),
  };
  return map[code] ?? tr('Gagal: {0}', { 0: code || (error as Error)?.message || tr('kesalahan tidak dikenal') });
}
