import * as Phaser from 'phaser';
import { BUBBLE_KEY, customerTextureKey, emoteKey, productIconKey } from '../graphics/art/customers';
import { applyAnchor } from '../graphics/TextureFactory';
import { tileToWorld } from '../iso/IsoMath';
import type { Group, Member, SimEvent } from '../systems/SalesSimulation';
import { formatRupiah } from '../utils/formatting';
import { DEPTH, entityDepth, objectDepth } from './depth';
import { objectType } from './objectTypes';
import { terrainAt, type MapData, type SeatAnchor } from './MapData';
import { tr } from '../i18n/i18n';

/** Tinggi dudukan bangku (px dunia): pinggul pelanggan duduk sejajar papan bangku. */
const SEAT_LIFT_PX = 6;

interface MemberView {
  sprite: Phaser.GameObjects.Sprite;
  typeId: string;
  palette: number;
  frame: number;
}

interface BubbleView {
  bubble: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  key: string | null;
}

/** Gelembung obrolan pelanggan bernama: 'news' = ada kabar (berkedip), 'chat' = obrolan ringan. */
export type TalkMark = 'news' | 'chat' | null;

export interface TalkHooks {
  /** Jenis gelembung "..." untuk rombongan ini (null = tidak ada). */
  mark(group: Group): TalkMark;
  /** Pemain mengetuk gelembung. */
  onTap(group: Group): void;
}

interface TalkView {
  bubble: Phaser.GameObjects.Image;
  dots: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  mark: TalkMark;
}

/** Menampilkan rombongan pelanggan dari SalesSimulation: sprite, animasi, gelembung, efek. */
export class CustomerLayer {
  private readonly members = new Map<string, MemberView>();
  private readonly bubbles = new Map<number, BubbleView>();
  private readonly talks = new Map<number, TalkView>();
  private elapsed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
    private readonly talkHooks: TalkHooks | null = null,
  ) {}

  private worldPos(x: number, y: number): { x: number; y: number } {
    const elev = terrainAt(this.map, Math.floor(x), Math.floor(y))?.elevation ?? 0;
    const p = tileToWorld(x, y, elev);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** Samakan tampilan dengan state simulasi (dipanggil tiap frame). */
  sync(groups: readonly Group[], deltaMs: number): void {
    this.elapsed += deltaMs;
    const alive = new Set<string>();
    const aliveGroups = new Set<number>();
    for (const group of groups) {
      aliveGroups.add(group.id);
      for (const m of group.members) {
        if (m.gone) continue;
        alive.add(m.id);
        this.syncMember(group, m);
      }
      this.syncBubble(group);
      this.syncTalk(group);
    }
    for (const [id, view] of this.members) {
      if (!alive.has(id)) {
        view.sprite.destroy();
        this.members.delete(id);
      }
    }
    for (const [id, view] of this.bubbles) {
      if (!aliveGroups.has(id)) {
        view.bubble.destroy();
        view.icon.destroy();
        this.bubbles.delete(id);
      }
    }
    for (const [id, view] of this.talks) {
      if (!aliveGroups.has(id)) this.destroyTalk(id, view);
    }
  }

  /** Gelembung "..." + label nama di atas pelanggan bernama; bisa diketuk. */
  private syncTalk(group: Group): void {
    if (!group.named || !this.talkHooks) return;
    const leader = group.members.find((m) => !m.gone);
    const mark = leader && group.state !== 'leaving' ? this.talkHooks.mark(group) : null;
    let view = this.talks.get(group.id);
    if (!view) {
      const bubble = this.scene.add.image(0, 0, BUBBLE_KEY);
      applyAnchor(bubble, BUBBLE_KEY);
      const dots = this.scene.add.image(0, 0, emoteKey('talk'));
      const name = this.scene.add
        .text(0, 0, group.plan.name, { fontFamily: 'system-ui, sans-serif', fontSize: '7px', fontStyle: 'bold', color: '#8fe8ff', stroke: '#1b1220', strokeThickness: 3, resolution: 4 })
        .setOrigin(0.5, 0);
      // Area ketuk lebih besar dari gambarnya supaya mudah di layar sentuh.
      bubble.setInteractive(new Phaser.Geom.Rectangle(-6, -6, 36, 36), Phaser.Geom.Rectangle.Contains);
      if (bubble.input) bubble.input.cursor = 'pointer';
      bubble.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() < 12 && view?.mark) this.talkHooks?.onTap(group);
      });
      view = { bubble, dots, name, mark: null };
      this.talks.set(group.id, view);
    }
    if (view.mark !== mark) {
      view.mark = mark;
      if (mark) {
        view.bubble.setScale(0.4);
        view.dots.setScale(0.4);
        this.scene.tweens.add({ targets: [view.bubble, view.dots], scale: 1, duration: 240, ease: 'Back.easeOut' });
      }
    }
    if (!leader) return;
    const p = this.worldPos(leader.x, leader.y);
    const lift = leader.sitting && leader.seat ? (this.seatSupport(leader.seat)?.lift ?? 0) : 0;
    const head = p.y - lift - (leader.sitting ? 20 : 23);
    // Nama di bawah kaki agar tidak tertutup gelembung.
    view.name.setPosition(p.x, p.y - lift + 1).setDepth(DEPTH.cables - 8);
    const visible = mark !== null;
    // Kabar baru: berkedip. Obrolan ringan: diam.
    const blink = mark === 'news' ? 0.55 + 0.45 * Math.abs(Math.sin(this.elapsed / 260)) : 1;
    const bx = p.x + 12;
    const by = head - 2 + Math.round(Math.sin(this.elapsed / 320 + group.id) * 0.8);
    view.bubble.setVisible(visible).setPosition(bx, by).setAlpha(blink).setDepth(DEPTH.cables - 7);
    view.dots.setVisible(visible).setPosition(bx, by - 12).setAlpha(blink).setDepth(DEPTH.cables - 6);
    if (view.bubble.input) view.bubble.input.enabled = visible;
  }

  private destroyTalk(id: number, view: TalkView): void {
    view.bubble.destroy();
    view.dots.destroy();
    view.name.destroy();
    this.talks.delete(id);
  }

  /** Posisi layar (piksel kanvas) gelembung obrolan, untuk uji & petunjuk. */
  talkScreenPositions(): { groupId: number; x: number; y: number }[] {
    const cam = this.scene.cameras.main;
    return [...this.talks.entries()]
      .filter(([, v]) => v.bubble.visible)
      .map(([groupId, v]) => ({ groupId, x: (v.bubble.x - cam.worldView.x) * cam.zoom, y: (v.bubble.y - 12 - cam.worldView.y) * cam.zoom }));
  }

  private syncMember(group: Group, m: Member): void {
    let view = this.members.get(m.id);
    if (!view) {
      const key = customerTextureKey(group.plan.typeId, group.plan.paletteIndex, 0);
      const sprite = this.scene.add.sprite(0, 0, key);
      applyAnchor(sprite, key);
      view = { sprite, typeId: group.plan.typeId, palette: group.plan.paletteIndex, frame: 0 };
      this.members.set(m.id, view);
      // Muncul perlahan agar tidak "meletup" di ujung jalan.
      sprite.setAlpha(0);
      this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 350, ease: 'Sine.easeOut' });
    }
    let frame = 0;
    const support = m.sitting && m.seat ? this.seatSupport(m.seat) : null;
    if (m.sitting) frame = 3;
    else if (m.moving) frame = Math.floor((this.elapsed + m.index * 90) / 170) % 2 === 0 ? 1 : 2;
    // Hanya ganti tekstur/depth jika berubah: setDepth selalu memicu pengurutan ulang seluruh display list.
    if (view.frame !== frame) {
      view.sprite.setTexture(customerTextureKey(view.typeId, view.palette, frame));
      view.frame = frame;
    }
    const p = this.worldPos(m.x, m.y);
    // Langkah: badan naik 1 px di setiap langkah (animasi jalan lebih hidup).
    const stepLift = frame === 1 ? 1 : 0;
    view.sprite.setPosition(p.x, p.y - stepLift - (support?.lift ?? 0)).setFlipX(m.facingLeft);
    // Duduk di bangku: selalu digambar tepat di atas bangkunya (bukan terpotong oleh dudukan).
    const depth = support ? support.depth : m.sitting ? entityDepth(m.x, m.y + 0.5) : entityDepth(m.x, m.y);
    if (view.sprite.depth !== depth) view.sprite.setDepth(depth);
  }

  private syncBubble(group: Group): void {
    const leader = group.members.find((m) => !m.gone);
    const key = group.showing ? productIconKey(group.showing) : group.emote ? emoteKey(group.emote) : null;
    let view = this.bubbles.get(group.id);
    if (!key || !leader) {
      if (view) {
        view.bubble.setVisible(false);
        view.icon.setVisible(false);
      }
      return;
    }
    if (!view) {
      const bubble = this.scene.add.image(0, 0, BUBBLE_KEY);
      applyAnchor(bubble, BUBBLE_KEY);
      const icon = this.scene.add.image(0, 0, key);
      view = { bubble, icon, key: null };
      this.bubbles.set(group.id, view);
    }
    if (view.key !== key) {
      view.icon.setTexture(key);
      applyAnchor(view.icon, key);
      view.key = key;
      // Gelembung "pop" saat isinya berganti.
      view.bubble.setScale(0.4);
      view.icon.setScale(0.4);
      this.scene.tweens.add({ targets: [view.bubble, view.icon], scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    const p = this.worldPos(leader.x, leader.y);
    const lift = leader.sitting && leader.seat ? (this.seatSupport(leader.seat)?.lift ?? 0) : 0;
    const top = p.y - lift - (leader.sitting ? 20 : 23);
    const bob = Math.round(Math.sin(this.elapsed / 300 + group.id) * 0.8);
    view.bubble.setVisible(true).setPosition(p.x, top + bob);
    view.icon.setVisible(true).setPosition(p.x, top + bob - 12);
    if (view.bubble.depth !== DEPTH.cables - 10) {
      view.bubble.setDepth(DEPTH.cables - 10);
      view.icon.setDepth(DEPTH.cables - 9);
    }
  }

  /** Efek sesaat untuk event simulasi (uang masuk, stok habis, tempat penuh). */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'pay' && e.amount > 0) {
        this.floatText(e.group, tr('+{amount}', { amount: formatRupiah(e.amount) }), '#ffe08a');
        this.coinBurst(e.group, Math.min(5, 1 + Math.floor(e.amount / 10_000)));
      }
      else if (e.type === 'order' && e.outcome.kind === 'left-empty') this.floatText(e.group, tr('Habis!'), '#ff8a7a');
      else if (e.type === 'walk-away' && e.reason === 'full') this.floatText(e.group, tr('Penuh!'), '#ff8a7a');
      else if (e.type === 'walk-away' && e.reason === 'impatient') this.floatText(e.group, tr('Kelamaan…'), '#ff8a7a');
      else if (e.type === 'walk-away' && e.reason === 'scared') this.floatText(e.group, tr('Takut…'), '#ff8a7a');
    }
  }

  private floatText(group: Group, text: string, color: string): void {
    const m = group.members[0];
    if (!m) return;
    const p = this.worldPos(m.x, m.y);
    const label = this.scene.add
      .text(p.x, p.y - 30, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color,
        stroke: '#1b1220',
        strokeThickness: 3,
        resolution: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.glow + 10);
    this.scene.tweens.add({ targets: label, y: p.y - 46, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
  }

  /** Tempat duduk di bawah kursi (jika ada): tinggi dudukan & depth tepat di atasnya. Lesehan → null. */
  private seatSupport(seat: SeatAnchor): { lift: number; depth: number } | null {
    if (this.supportCache.has(seat.id)) return this.supportCache.get(seat.id) ?? null;
    let result: { lift: number; depth: number } | null = null;
    for (const o of this.map.objects) {
      const def = objectType(o.type);
      // Bangku bawaan & objek kustom yang ditandai "bisa jadi tempat duduk".
      if (!def.seat) continue;
      const w = def.footprint.w / 16;
      const d = def.footprint.d / 16;
      const pad = 0.2;
      if (seat.x >= o.x - pad && seat.x <= o.x + w + pad && seat.y >= o.y - pad && seat.y <= o.y + d + pad) {
        result = { lift: def.seat.lift ?? SEAT_LIFT_PX, depth: objectDepth(def, o.x, o.y) + 1 };
        break;
      }
    }
    this.supportCache.set(seat.id, result);
    return result;
  }

  private readonly supportCache = new Map<string, { lift: number; depth: number } | null>();

  /** Koin kecil memantul ke atas lalu hilang saat pelanggan membayar. */
  private coinBurst(group: Group, count: number): void {
    const m = group.members[0];
    if (!m) return;
    ensureCoinTexture(this.scene);
    const p = this.worldPos(m.x, m.y);
    for (let i = 0; i < count; i++) {
      const coin = this.scene.add.image(p.x, p.y - 14, COIN_KEY).setDepth(DEPTH.glow + 9);
      const dx = (i - (count - 1) / 2) * 5 + (Math.random() - 0.5) * 3;
      this.scene.tweens.add({ targets: coin, x: p.x + dx, duration: 650, ease: 'Linear' });
      this.scene.tweens.add({
        targets: coin,
        y: p.y - 30 - Math.random() * 6,
        duration: 320,
        ease: 'Quad.easeOut',
        yoyo: true,
        delay: i * 40,
        onComplete: () => this.scene.tweens.add({ targets: coin, alpha: 0, duration: 200, onComplete: () => coin.destroy() }),
      });
    }
  }

  clear(): void {
    for (const v of this.members.values()) v.sprite.destroy();
    for (const v of this.bubbles.values()) {
      v.bubble.destroy();
      v.icon.destroy();
    }
    this.members.clear();
    this.bubbles.clear();
    for (const [id, v] of [...this.talks]) this.destroyTalk(id, v);
  }
}

const COIN_KEY = 'fx_coin';

/** Tekstur koin 5×5 piksel (dibuat sekali). */
function ensureCoinTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(COIN_KEY)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x8a5a10, 1).fillRect(1, 0, 3, 5).fillRect(0, 1, 5, 3);
  g.fillStyle(0xf6c453, 1).fillRect(1, 1, 3, 3);
  g.fillStyle(0xfff2b0, 1).fillRect(1, 1, 1, 1);
  g.generateTexture(COIN_KEY, 5, 5);
  g.destroy();
}
