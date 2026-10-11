import type { Vec2 } from '../core/vec2';

/** Fixed gameplay playfield in world units (y up, origin bottom-left). */
export const WORLD_W = 90;
export const WORLD_H = 160;
/** Height of the ground strip at the bottom of the playfield, in world units. */
export const GROUND_H = 12;

export interface Layout {
  /** Screen width/height in CSS pixels. */
  screenW: number;
  screenH: number;
  /** CSS pixels per world unit. */
  scale: number;
  /** Screen position of the playfield's top-left corner. */
  left: number;
  top: number;
  /** Playfield size on screen. */
  width: number;
  height: number;
}

/** Fit the 90x160 playfield inside the screen, centered (letterboxed). Pure. */
export function computeLayout(screenW: number, screenH: number): Layout {
  const w = Math.max(1, screenW);
  const h = Math.max(1, screenH);
  const scale = Math.min(w / WORLD_W, h / WORLD_H);
  const width = WORLD_W * scale;
  const height = WORLD_H * scale;
  return {
    screenW: w,
    screenH: h,
    scale,
    left: (w - width) / 2,
    top: (h - height) / 2,
    width,
    height,
  };
}

/** World (y up, origin bottom-left of playfield) to screen CSS pixels (y down). */
export function worldToScreen(l: Layout, p: Vec2): Vec2 {
  return { x: l.left + p.x * l.scale, y: l.top + (WORLD_H - p.y) * l.scale };
}

/** Screen CSS pixels to world units. Inverse of worldToScreen. */
export function screenToWorld(l: Layout, p: Vec2): Vec2 {
  return { x: (p.x - l.left) / l.scale, y: WORLD_H - (p.y - l.top) / l.scale };
}
