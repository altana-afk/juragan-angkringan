import type { Vec3, SpriteArt } from '../IsoPainter';
import type { Color } from '../color';

/** Sumber cahaya yang menempel pada sebuah sprite, posisinya dalam unit relatif alas objek. */
export interface LightAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Jari-jari cahaya (piksel dunia). */
  readonly radius: number;
  readonly color: Color;
  /** 0..1 */
  readonly intensity: number;
  /** Besar kedip 0..1 (0 = stabil). */
  readonly flicker?: number;
  /** Tambahkan sprite pendar (additive) di titik lampu. */
  readonly glow?: boolean;
  readonly glowScale?: number;
}

export interface ArtMeta {
  readonly lights?: readonly LightAnchor[];
  /** Titik pengait kabel listrik (untuk tiang listrik). */
  readonly cableAnchors?: readonly Vec3[];
  /** Titik keluarnya asap. */
  readonly smoke?: Vec3;
}

export interface ArtEntry {
  readonly key: string;
  readonly art: SpriteArt;
  readonly meta?: ArtMeta;
}

/** Generator aset; dijalankan bertahap oleh LoadingScene agar progress bar tetap bergerak. */
export interface ArtJob {
  readonly label: string;
  readonly build: () => ArtEntry[];
}
