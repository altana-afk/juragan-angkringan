import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';

interface TestEvents {
  ping: { n: number };
  done: void;
}

describe('EventBus', () => {
  it('mengirim payload ke listener dan bisa berhenti mendengarkan', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    const off = bus.on('ping', ({ n }) => seen.push(n));
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(seen).toEqual([1]);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('once hanya terpanggil sekali dan mendukung event tanpa payload', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.once('done', fn);
    bus.emit('done');
    bus.emit('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('error di satu listener tidak menghentikan listener lain', () => {
    const bus = new EventBus<TestEvents>();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const after = vi.fn();
    bus.on('ping', () => {
      throw new Error('gagal');
    });
    bus.on('ping', after);
    bus.emit('ping', { n: 1 });
    expect(after).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('listener yang melepas diri saat dipanggil tidak mengganggu yang lain', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const offA = bus.on('done', () => {
      calls.push('a');
      offA();
    });
    bus.on('done', () => calls.push('b'));
    bus.emit('done');
    bus.emit('done');
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
