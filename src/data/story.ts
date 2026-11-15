import chaptersRaw from './storyChapters.json';
import namedRaw from './namedCustomers.json';
import newsRaw from './news.json';

/**
 * Data cerita "Kabar Kampung & Buku Dapur Kardi" (0.12.0):
 * pelanggan bernama, kabar harian, bab buku resep, keputusan, dan akhir cerita.
 * Hari di data adalah *hari cerita* (hari ke-n sejak cerita dimulai), bukan hari kalender.
 */

export type NamedId = string;
export type RelationStage = 0 | 1 | 2 | 3;

export interface NamedCustomerDef {
  readonly id: NamedId;
  readonly name: string;
  readonly role: string;
  readonly want: string;
  readonly fear: string;
  /** Tipe pelanggan dasar (anggaran, kesabaran, selera). */
  readonly baseType: string;
  /** Mulai mampir secara acak pada hari cerita ini. */
  readonly fromDay: number;
  /** Peluang mampir tanpa kabar (per hari). */
  readonly visitChance: number;
  /** Rentang menit kedatangan [dari, sampai]. */
  readonly visitWindow: readonly [number, number];
  readonly favorites: readonly string[];
  readonly dislikes: readonly string[];
  readonly palette: { readonly hair: string; readonly shirt: string; readonly accent: string; readonly pants: string };
  /** Obrolan ringan per tahap hubungan. */
  readonly talk: Readonly<Record<RelationStage, readonly string[]>>;
}

export interface NewsDef {
  readonly id: string;
  readonly day: number;
  readonly speaker: NamedId;
  /** Kabar penting: kabar berikutnya yang bergantung padanya menunggu sampai ini dibaca (atau diringkas). */
  readonly important: boolean;
  readonly title: string;
  readonly lines: readonly string[];
  /** Ringkasan "didengar dari orang lain" setelah 5 hari tidak dibaca. */
  readonly summary: string;
  readonly requires: readonly string[];
  readonly requiresStage: { readonly who: NamedId; readonly stage: RelationStage } | null;
  readonly opensDecision: boolean;
}

export type ChoiceId = 'bertahan' | 'gotong' | 'warisan' | 'jual';
export type EndingId = 'lengkap' | 'gotong_royong' | 'warisan' | 'bertahan' | 'kota';

export interface ChoiceDef {
  readonly id: ChoiceId;
  readonly title: string;
  readonly text: string;
  readonly requirement: string;
  readonly effects: string;
}

export interface EndingDef {
  readonly id: EndingId;
  readonly title: string;
  readonly speaker: NamedId;
  readonly lines: readonly string[];
}

export interface ChapterDef {
  readonly id: number;
  readonly title: string;
  readonly recipeId: string | null;
  readonly recipeNote: string;
  readonly memory: string;
  readonly condition: string;
}

const CHOICE_IDS: readonly ChoiceId[] = ['bertahan', 'gotong', 'warisan', 'jual'];
const ENDING_IDS: readonly EndingId[] = ['lengkap', 'gotong_royong', 'warisan', 'bertahan', 'kota'];

function fail(msg: string): never {
  throw new Error(`Data cerita tidak valid: ${msg}`);
}

function stage(n: unknown, where: string): RelationStage {
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return fail(`${where}: tahap hubungan harus 0–3`);
}

function parseNamed(): NamedCustomerDef[] {
  return namedRaw.customers.map((c) => {
    const talk = c.talk as Record<string, string[]>;
    for (const k of ['0', '1', '2', '3']) if (!talk[k]?.length) fail(`${c.id}: obrolan tahap ${k} kosong`);
    if (c.visitWindow.length !== 2 || c.visitWindow[0]! >= c.visitWindow[1]!) fail(`${c.id}: visitWindow tidak valid`);
    return {
      ...c,
      visitWindow: [c.visitWindow[0]!, c.visitWindow[1]!] as const,
      talk: { 0: talk['0']!, 1: talk['1']!, 2: talk['2']!, 3: talk['3']! },
    };
  });
}

export const NAMED_CUSTOMERS: readonly NamedCustomerDef[] = parseNamed();

export function namedById(id: NamedId): NamedCustomerDef {
  const c = NAMED_CUSTOMERS.find((x) => x.id === id);
  if (!c) throw new Error(`Pelanggan bernama tidak dikenal: ${id}`);
  return c;
}

function parseNews(): NewsDef[] {
  const ids = new Set<string>();
  const list = newsRaw.news.map((n) => {
    if (ids.has(n.id)) fail(`kabar ganda ${n.id}`);
    ids.add(n.id);
    if (!NAMED_CUSTOMERS.some((c) => c.id === n.speaker)) fail(`${n.id}: pembicara ${n.speaker} tidak dikenal`);
    if (!n.lines.length || !n.summary) fail(`${n.id}: teks kosong`);
    const raw = n as { requires?: string[]; requiresStage?: { who: string; stage: number }; opensDecision?: boolean };
    return {
      id: n.id, day: n.day, speaker: n.speaker, important: n.important, title: n.title, lines: n.lines, summary: n.summary,
      requires: raw.requires ?? [],
      requiresStage: raw.requiresStage ? { who: raw.requiresStage.who, stage: stage(raw.requiresStage.stage, n.id) } : null,
      opensDecision: raw.opensDecision === true,
    };
  });
  for (const n of list) for (const r of n.requires) if (!ids.has(r)) fail(`${n.id}: syarat kabar ${r} tidak ada`);
  return list;
}

export const NEWS: readonly NewsDef[] = parseNews();

export function newsById(id: string): NewsDef {
  const n = NEWS.find((x) => x.id === id);
  if (!n) throw new Error(`Kabar tidak dikenal: ${id}`);
  return n;
}

export const CHOICES: readonly ChoiceDef[] = newsRaw.decision.choices.map((c) => {
  if (!(CHOICE_IDS as readonly string[]).includes(c.id)) fail(`pilihan ${c.id} tidak dikenal`);
  return { id: c.id as ChoiceId, title: c.title, text: c.text, requirement: c.requirement, effects: c.effects };
});

export const ENDINGS: readonly EndingDef[] = newsRaw.endings.map((e) => {
  if (!(ENDING_IDS as readonly string[]).includes(e.id)) fail(`akhir ${e.id} tidak dikenal`);
  return { id: e.id as EndingId, title: e.title, speaker: e.speaker, lines: e.lines };
});

export const endingById = (id: EndingId): EndingDef => ENDINGS.find((e) => e.id === id) ?? fail(`akhir ${id}`);
export const choiceById = (id: ChoiceId): ChoiceDef => CHOICES.find((c) => c.id === id) ?? fail(`pilihan ${id}`);

export const CHAPTERS: readonly ChapterDef[] = chaptersRaw.chapters.map((c) => ({ ...c }));
export const LAST_PAGE: Readonly<Record<EndingId, string>> = chaptersRaw.lastPage as Record<EndingId, string>;
