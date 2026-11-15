import * as Phaser from 'phaser';
import { SCENES } from './sceneKeys';

/**
 * Scene pertama: pengaturan dasar sebelum memuat aset.
 * Nantinya juga memuat aset kecil untuk layar loading (logo, font bitmap).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    // Cegah menu klik-kanan bawaan browser di atas kanvas (klik kanan dipakai untuk kontrol nanti).
    this.input.mouse?.disableContextMenu();
    this.scene.start(SCENES.loading);
  }
}
