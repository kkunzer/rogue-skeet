import { Container, Graphics } from 'pixi.js';
import { GROUND_H, GUN_BARREL, GUN_BASE, WORLD_H, WORLD_W } from '../sim/field';
import { HOUSES } from '../sim/houses';

/** Greybox playfield in world units (y up): ground strip, left high house, right low house, gun. */
export const GREYBOX = {
  groundColor: 0x4a5d45,
  houseColor: 0x6b7280,
  houseRoof: 0x9ca3af,
  gunColor: 0xe5e7eb,
  highHouse: HOUSES.high,
  lowHouse: HOUSES.low,
  gun: GUN_BASE,
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
    g.rect(h.x, h.y + h.h - 2.5, h.w, 2.5).fill(GREYBOX.houseRoof);
    // launch port (faces inward)
    const px = h.dir === 1 ? h.x + h.w - 2 : h.x;
    g.rect(px, h.port.y - 1.5, 2, 3).fill(0x111827);
  }
  // gun: base + two barrels pointing up
  const { x, y } = GREYBOX.gun;
  g.circle(x, y, 3.5).fill(GREYBOX.gunColor);
  g.rect(x - 1.8, y, 1.4, GUN_BARREL).fill(GREYBOX.gunColor);
  g.rect(x + 0.4, y, 1.4, GUN_BARREL).fill(GREYBOX.gunColor);
  c.addChild(g);
  return c;
}
