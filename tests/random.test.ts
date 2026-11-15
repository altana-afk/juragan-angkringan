import { describe, expect, it } from 'vitest';
import { hashNoise, hashString, SeededRandom } from '../src/utils/random';

describe('SeededRandom', () => {
  it('deterministik untuk seed yang sama', () => {
    const a = new SeededRandom('angkringan');
    const b = new SeededRandom('angkringan');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new SeededRandom('lain').next()).not.toBe(seqA[0]);
  });

  it('menghasilkan angka di rentang yang benar', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('weightedPick mengikuti bobot dan mengabaikan bobot 0', () => {
    const rng = new SeededRandom(7);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) {
      const pick = rng.weightedPick([
        { item: 'a' as const, weight: 3 },
        { item: 'b' as const, weight: 1 },
        { item: 'c' as const, weight: 0 },
      ]);
      counts[pick]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.4);
    expect(counts.a / counts.b).toBeLessThan(3.6);
  });

  it('melempar error untuk input kosong', () => {
    const rng = new SeededRandom(1);
    expect(() => rng.pick([])).toThrow();
    expect(() => rng.weightedPick([{ item: 1, weight: 0 }])).toThrow();
  });
});

describe('hash', () => {
  it('stabil dan berada di rentang 0..1', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    for (let i = 0; i < 100; i++) {
      const n = hashNoise(i, i * 3, 9);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
