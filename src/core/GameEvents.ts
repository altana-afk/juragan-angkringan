import type { GameState } from './GameState';

/** Kecepatan simulasi: 0 = jeda. */
export type SimSpeed = 0 | 1 | 2 | 3;

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface StateChange {
  readonly state: Readonly<GameState>;
  readonly prev: Readonly<GameState>;
  /** Alasan perubahan, berguna untuk log & notifikasi (mis. "beli-bahan"). */
  readonly reason: string;
}

/** Daftar seluruh event lintas modul beserta tipe payload-nya. */
export type PanelId = 'shop' | 'kitchen' | 'promo' | 'stats' | 'upgrade' | 'storage' | 'bank' | 'achievements' | 'event' | 'location' | 'guide';

export interface GameEvents {
  'state:changed': StateChange;

  'notify': { message: string; kind: NotificationKind; durationMs?: number };

  'camera:zoom-in': void;
  'camera:zoom-out': void;
  'camera:focus-home': void;
  'camera:zoom-changed': { zoom: number; min: number; max: number };

  'save:completed': { savedAt: string };

  'ui:open-pause-menu': void;
  'sales:start-request': void;
  'sales:set-speed': { speed: SimSpeed };
  'sales:speed-changed': { speed: SimSpeed };
  'sales:status': { seatsTaken: number; seatsTotal: number; groups: number };
  'sales:ended': void;
  'ui:open-panel': { panel: PanelId };
  /** Upgrade dibeli: dunia dibangun ulang agar objek/varian baru tampil. */
  'world:rebuild': { reopen?: PanelId } | undefined;
  /** Pencapaian baru didapat. */
  'achievement:unlocked': { id: string };
  /** Kualitas grafis diubah dari pengaturan. */
  'settings:graphics-changed': { lowPower: boolean };
  'ui:panel-closed': { panel: 'shop' | 'kitchen' };
  'ui:pause-menu-closed': void;

  'game:return-to-menu': void;

  'system:toggle-fullscreen': void;
  'system:fullscreen-changed': { active: boolean };
}
