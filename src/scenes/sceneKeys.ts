import { AUDIO_REGISTRY_KEY, AudioSystem } from '../audio/AudioSystem';
import type * as Phaser from 'phaser';
import { CONTEXT_REGISTRY_KEY, GameContext } from '../core/GameContext';
import { UIManager, UI_REGISTRY_KEY } from '../ui/UIManager';

export const SCENES = {
  boot: 'BootScene',
  loading: 'LoadingScene',
  mainMenu: 'MainMenuScene',
  angkringan: 'AngkringanScene',
} as const;

/** Ambil GameContext bersama dari registry Phaser. */
export function getContext(scene: Phaser.Scene): GameContext {
  const ctx: unknown = scene.registry.get(CONTEXT_REGISTRY_KEY);
  if (!(ctx instanceof GameContext)) {
    throw new Error('GameContext belum terdaftar di registry. Pastikan main.ts mengisinya sebelum scene berjalan.');
  }
  return ctx;
}

/** Ambil UIManager (lapisan DOM) dari registry Phaser. */
export function getUI(scene: Phaser.Scene): UIManager {
  const ui: unknown = scene.registry.get(UI_REGISTRY_KEY);
  if (!(ui instanceof UIManager)) throw new Error('UIManager belum terdaftar di registry.');
  return ui;
}

/** Ambil AudioSystem dari registry Phaser (bisa null di lingkungan tanpa audio). */
export function getAudio(scene: Phaser.Scene): AudioSystem | null {
  const a: unknown = scene.registry.get(AUDIO_REGISTRY_KEY);
  return a instanceof AudioSystem ? a : null;
}
