import type { CourierTrip, DeliveryMode, GameState, OnlineOrder, WeatherKind } from '../core/GameState';
import { modeById, ONLINE_RULES } from '../data/online';
import { effectsOf } from './UpgradeSystem';

/**
 * Pengantaran pesanan online: waktu tempuh per menit permainan, pengaruh hujan & motor,
 * kapasitas kurir sendiri (3 pesanan sekali antar, tanpa batas perjalanan), dan jadwal perjalanan.
 */

/** Pengali waktu tempuh: hujan memperlambat, motor kurir (hanya kurir sendiri) mempercepat. */
export function travelFactor(mode: DeliveryMode, weather: WeatherKind, courierSpeed: number): number {
  const rain = weather === 'hujan' ? 1 + ONLINE_RULES.rainSlowdown : 1;
  const motor = mode === 'kurir' ? Math.max(0.4, 1 - courierSpeed) : 1;
  return rain * motor;
}

/** Menit perjalanan sekali jalan untuk jarak km. */
export function travelMinutes(km: number, factor: number): number {
  return Math.max(2, Math.round(km * ONLINE_RULES.minutesPerKm * factor));
}

/** Menit makanan masih hangat di jalan (kotak termos hanya untuk kurir sendiri). */
export function hotMinutes(state: Readonly<GameState>): number {
  return ONLINE_RULES.hotMinutes + (state.online.mode === 'kurir' ? effectsOf(state).thermal : 0);
}

/** Kurir sedang di jalan (perjalanan belum kembali) pada menit ini. */
export function activeTrip(state: Readonly<GameState>, minute: number): CourierTrip | null {
  return state.online.trips.find((t) => t.departMinute <= minute && minute < t.returnMinute) ?? null;
}

/** Pesanan yang siap berangkat bersama kurir (sudah matang, belum berangkat), urut dari yang paling lama. */
export function readyForCourier(state: Readonly<GameState>, minute: number): OnlineOrder[] {
  return state.online.orders
    .filter((o) => o.status === 'diterima' && o.readyMinute !== null && o.readyMinute <= minute)
    .sort((a, b) => (a.readyMinute ?? 0) - (b.readyMinute ?? 0));
}

/** Kurir sendiri berangkat otomatis jika kotak penuh, atau pesanan tertua sudah menunggu terlalu lama. */
export function shouldDispatch(state: Readonly<GameState>, minute: number, force = false): boolean {
  if (state.online.mode !== 'kurir' || activeTrip(state, minute)) return false;
  const ready = readyForCourier(state, minute);
  if (!ready.length) return false;
  if (force) return true;
  const def = modeById('kurir');
  const oldest = ready[0] as OnlineOrder;
  return ready.length >= def.batchSize || minute - (oldest.readyMinute ?? minute) >= ONLINE_RULES.kurirDispatchWait;
}

/** Rencana satu perjalanan kurir: antar berurutan dari yang terdekat, lalu kembali ke warung. */
export function planTrip(orders: readonly OnlineOrder[], depart: number, factor: number): { deliveries: Map<number, number>; returnMinute: number } {
  const sorted = [...orders].sort((a, b) => a.km - b.km);
  const deliveries = new Map<number, number>();
  let t = depart;
  let pos = 0;
  for (const o of sorted) {
    t += travelMinutes(Math.max(0.3, Math.abs(o.km - pos)), factor) + ONLINE_RULES.stopMinutes;
    pos = o.km;
    deliveries.set(o.id, t);
  }
  const returnMinute = t + travelMinutes(pos, factor);
  return { deliveries, returnMinute };
}
