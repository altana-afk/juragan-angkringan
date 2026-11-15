import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { Point, Rect } from '../iso/IsoMath';
import { clamp } from '../utils/formatting';
import { computeDefaultZoom, nextZoomStep } from './cameraMath';

export interface CameraControllerOptions {
  readonly bounds: Rect;
  readonly home: Point;
  readonly bus?: EventBus<GameEvents>;
  /** Izinkan input pemain (geser, cubit, scroll, keyboard). */
  readonly interactive?: boolean;
}

const CFG = GAME_CONFIG.camera;

/**
 * Kamera isometrik: geser dengan seret (mouse/1 jari), zoom dengan scroll / cubit 2 jari /
 * tombol UI, keyboard WASD/panah + Q/E, dan fokus kembali ke gerobak.
 */
export class CameraController {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly unsubscribers: (() => void)[] = [];
  private drag: { pointerId: number; startX: number; startY: number; lastX: number; lastY: number; active: boolean } | null = null;
  private pinch: { startDistance: number; startZoom: number; worldMid: Point } | null = null;
  private zoomTween: Phaser.Tweens.Tween | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private readonly interactive: boolean;
  private lastCenter: Point;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: CameraControllerOptions,
  ) {
    this.cam = scene.cameras.main;
    this.interactive = options.interactive ?? true;
    const pad = CFG.boundsPadding;
    const b = options.bounds;
    this.cam.setBounds(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    this.cam.setRoundPixels(true);
    this.cam.setZoom(computeDefaultZoom(this.cam.width, this.cam.height));
    this.cam.centerOn(options.home.x, options.home.y);
    this.lastCenter = { ...options.home };

    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.interactive) this.attachInput();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.emitZoom();
  }

  get zoom(): number {
    return this.cam.zoom;
  }

  private attachInput(): void {
    const input = this.scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);

    // Tombol geser (ditahan) dibaca tiap frame; tombol aksi sekali tekan memakai event DOM
    // agar tepat satu aksi per tekanan.
    const kb = input.keyboard;
    if (kb) this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    window.addEventListener('keydown', this.onKeyDown);

    const bus = this.options.bus;
    if (bus) {
      this.unsubscribers.push(
        bus.on('camera:zoom-in', () => this.zoomStep(1)),
        bus.on('camera:zoom-out', () => this.zoomStep(-1)),
        bus.on('camera:focus-home', () => this.focusHome()),
      );
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.defaultPrevented || isTypingTarget(event.target) || !this.scene.scene.isActive()) return;
    switch (event.key.toLowerCase()) {
      case 'q':
      case '-':
        this.zoomStep(-1);
        break;
      case 'e':
      case '+':
      case '=':
        this.zoomStep(1);
        break;
      case 'f':
        this.focusHome();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  /** Dipanggil tiap frame oleh scene. */
  update(deltaMs: number): void {
    this.lastCenter = { x: this.cam.scrollX + this.cam.width / 2, y: this.cam.scrollY + this.cam.height / 2 };
    if (!this.keys) return;
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (k.A?.isDown || k.LEFT?.isDown) dx -= 1;
    if (k.D?.isDown || k.RIGHT?.isDown) dx += 1;
    if (k.W?.isDown || k.UP?.isDown) dy -= 1;
    if (k.S?.isDown || k.DOWN?.isDown) dy += 1;
    if (dx === 0 && dy === 0) return;
    const len = Math.hypot(dx, dy);
    const step = (CFG.keyboardPanSpeed * deltaMs) / 1000 / this.cam.zoom;
    this.cam.scrollX += (dx / len) * step;
    this.cam.scrollY += (dy / len) * step;
  }

  // ---------- pointer ----------

  private activeTouches(): Phaser.Input.Pointer[] {
    const input = this.scene.input;
    return [input.pointer1, input.pointer2].filter((p): p is Phaser.Input.Pointer => !!p && p.isDown);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const touches = this.activeTouches();
    if (touches.length >= 2) {
      this.startPinch(touches[0] as Phaser.Input.Pointer, touches[1] as Phaser.Input.Pointer);
      this.drag = null;
      return;
    }
    this.drag = { pointerId: pointer.id, startX: pointer.x, startY: pointer.y, lastX: pointer.x, lastY: pointer.y, active: false };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pinch) {
      const touches = this.activeTouches();
      if (touches.length >= 2) this.updatePinch(touches[0] as Phaser.Input.Pointer, touches[1] as Phaser.Input.Pointer);
      return;
    }
    const drag = this.drag;
    if (!drag || drag.pointerId !== pointer.id || !pointer.isDown) return;
    if (!drag.active && Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) >= CFG.dragThreshold) {
      drag.active = true;
      this.stopZoomTween();
    }
    if (drag.active) {
      this.cam.scrollX -= (pointer.x - drag.lastX) / this.cam.zoom;
      this.cam.scrollY -= (pointer.y - drag.lastY) / this.cam.zoom;
    }
    drag.lastX = pointer.x;
    drag.lastY = pointer.y;
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.pinch && this.activeTouches().length < 2) {
      this.pinch = null;
      // Sisa satu jari: lanjutkan sebagai seret tanpa lompatan.
      const remaining = this.activeTouches()[0];
      this.drag = remaining
        ? { pointerId: remaining.id, startX: remaining.x, startY: remaining.y, lastX: remaining.x, lastY: remaining.y, active: true }
        : null;
      this.emitZoom();
      return;
    }
    if (this.drag && this.drag.pointerId === pointer.id) this.drag = null;
  }

  /** True jika pointer sedang/baru saja menggeser kamera (agar ketukan tidak dianggap klik). */
  isDragging(): boolean {
    return !!this.drag?.active || !!this.pinch;
  }

  private onWheel(pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number): void {
    this.stopZoomTween();
    const factor = Math.exp(-dy * 0.0015);
    this.setZoomAround(this.cam.zoom * factor, { x: pointer.x, y: pointer.y });
    this.emitZoom();
  }

  private startPinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    this.stopZoomTween();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = {
      startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      startZoom: this.cam.zoom,
      worldMid: this.screenToWorld(mid, this.cam.zoom),
    };
  }

  private updatePinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    const pinch = this.pinch;
    if (!pinch) return;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const zoom = clamp((pinch.startZoom * distance) / pinch.startDistance, CFG.minZoom, CFG.maxZoom);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Titik dunia di tengah dua jari tetap di bawah jari (zoom + geser sekaligus).
    this.cam.setZoom(zoom);
    this.placeWorldAtScreen(pinch.worldMid, mid, zoom);
  }

  // ---------- zoom ----------

  /** Naik/turun satu tingkat zoom (tombol +/−, keyboard). */
  zoomStep(direction: 1 | -1): void {
    const current = this.zoomTween ? (this.zoomTween.getValue() ?? this.cam.zoom) : this.cam.zoom;
    this.animateZoom(nextZoomStep(current, direction), { x: this.cam.width / 2, y: this.cam.height / 2 });
  }

  private animateZoom(target: number, screenAnchor: Point): void {
    this.stopZoomTween();
    const anchorWorld = this.screenToWorld(screenAnchor, this.cam.zoom);
    this.zoomTween = this.scene.tweens.addCounter({
      from: this.cam.zoom,
      to: clamp(target, CFG.minZoom, CFG.maxZoom),
      duration: 180,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        const z = tween.getValue() ?? this.cam.zoom;
        this.cam.setZoom(z);
        this.placeWorldAtScreen(anchorWorld, screenAnchor, z);
      },
      onComplete: () => {
        this.zoomTween = null;
        this.emitZoom();
      },
    });
  }

  private stopZoomTween(): void {
    if (this.zoomTween) {
      this.zoomTween.stop();
      this.zoomTween = null;
    }
  }

  private setZoomAround(zoom: number, screenPoint: Point): void {
    const z = clamp(zoom, CFG.minZoom, CFG.maxZoom);
    const world = this.screenToWorld(screenPoint, this.cam.zoom);
    this.cam.setZoom(z);
    this.placeWorldAtScreen(world, screenPoint, z);
  }

  /** Konversi titik layar → dunia untuk zoom tertentu (kamera Phaser zoom di sekitar titik tengahnya). */
  screenToWorld(screen: Point, zoom: number): Point {
    const midX = this.cam.scrollX + this.cam.width / 2;
    const midY = this.cam.scrollY + this.cam.height / 2;
    return { x: midX + (screen.x - this.cam.width / 2) / zoom, y: midY + (screen.y - this.cam.height / 2) / zoom };
  }

  private placeWorldAtScreen(world: Point, screen: Point, zoom: number): void {
    this.cam.scrollX = world.x - (screen.x - this.cam.width / 2) / zoom - this.cam.width / 2;
    this.cam.scrollY = world.y - (screen.y - this.cam.height / 2) / zoom - this.cam.height / 2;
  }

  focusHome(animate = true): void {
    const { home } = this.options;
    if (!animate) {
      this.cam.centerOn(home.x, home.y);
      return;
    }
    this.cam.pan(home.x, home.y, 380, 'Sine.easeInOut');
    const defaultZoom = computeDefaultZoom(this.cam.width, this.cam.height);
    if (Math.abs(this.cam.zoom - defaultZoom) > 0.01) {
      this.stopZoomTween();
      this.cam.zoomTo(defaultZoom, 380, 'Sine.easeInOut', false, (_c, progress) => {
        if (progress >= 1) this.emitZoom();
      });
    }
  }

  private onResize(): void {
    // Jaga titik tengah tetap sama saat ukuran layar berubah (rotasi ponsel, resize jendela).
    this.cam.centerOn(this.lastCenter.x, this.lastCenter.y);
    this.emitZoom();
  }

  private emitZoom(): void {
    this.options.bus?.emit('camera:zoom-changed', { zoom: this.cam.zoom, min: CFG.minZoom, max: CFG.maxZoom });
  }

  destroy(): void {
    this.stopZoomTween();
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    window.removeEventListener('keydown', this.onKeyDown);
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }
}

/** True jika fokus sedang di kolom teks (tombol pintas tidak boleh aktif). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
