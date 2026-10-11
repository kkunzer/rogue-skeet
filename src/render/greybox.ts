import { Container, Graphics } from 'pixi.js';
import { GROUND_H, WORLD_H, WORLD_W } from './layout';

/** Greybox playfield in world units (y up): ground strip, left high house, right low house, gun. */
export const GREYBOX = {
  groundColor: 0x4a5d45,
  houseColor: 0x6b7280,
  houseRoof: 0x9ca3af,
  gunColor: 0xe5e7eb,
  /** High house on the left. */
  highHouse: { x: 0, y: GROUND_H, w: 14, h: 62 },
  /** Low house on the right. */
  lowHouse: { x: WORLD_W - 14, y: GROUND_H, w: 14, h: 28 },
  /** Gun at bottom center, sitting on the ground strip. */
  gun: { x: WORLD_W / 2, y: GROUND_H },
} as const;

export function buildGreybox(): Container {
  const c = new Container();
  const g = new Graphics();
  // playfield bounds
  g.rect(0, 0, WORLD_W, WORLD_H).stroke({ width: 0.3, color: 0xffffff, alpha: 0.25 });
  // ground strip
  g.rect(0, 0, WORLD_W, GROUND_H).fill(GREYBOX.groundColor);
  g.rect(0, GROUND_H - 0.4, WORLD_W, 0.4).fill(0x7c9473);
  // houses
  for (const h of [GREYBOX.highHouse, GREYBOX.lowHouse]) {
    g.rect(h.x, h.y, h.w, h.h).fill(GREYBOX.houseColor);
    g.rect(h.x, h.y + h.h - 3, h.w, 3).fill(GREYBOX.houseRoof);
  }
  // house launch ports (facing inward)
  const hp = GREYBOX.highHouse;
  g.rect(hp.x + hp.w - 2, hp.y + hp.h - 12, 2, 5).fill(0x111827);
  const lp = GREYBOX.lowHouse;
  g.rect(lp.x, lp.y + lp.h - 12, 2, 5).fill(0x111827);
  // gun: base + two barrels pointing up
  const { x, y } = GREYBOX.gun;
  g.circle(x, y, 3.5).fill(GREYBOX.gunColor);
  g.rect(x - 1.8, y, 1.4, 9).fill(GREYBOX.gunColor);
  g.rect(x + 0.4, y, 1.4, 9).fill(GREYBOX.gunColor);
  c.addChild(g);
  return c;
}
