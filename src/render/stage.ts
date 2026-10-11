import { Application, Container, Graphics } from 'pixi.js';
import type { Vec2 } from '../core/vec2';
import {
  GROUND_H,
  WORLD_H,
  WORLD_W,
  computeLayout,
  screenToWorld,
  worldToScreen,
  type Layout,
} from './layout';

export const SKY_COLOR = 0x1c2a4a;
export const SKY_HORIZON = 0x3a5a8c;
export const GROUND_COLOR = 0x2d3b2a;

/**
 * Pixi application with three layers:
 * - `bg`: screen-space decorative sky/ground that fills the whole screen (incl. letterbox)
 * - `world`: the 90x160 playfield, y up, origin bottom-left (flipped container)
 * - `ui`: screen-space overlay (text, buttons)
 */
export class Stage {
  readonly app = new Application();
  readonly bg = new Container();
  readonly world = new Container();
  readonly ui = new Container();
  layout: Layout = computeLayout(1, 1);
  private bgGfx = new Graphics();
  private resizeCbs = new Set<(l: Layout) => void>();
  private host!: HTMLElement;

  async init(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      autoDensity: true,
      antialias: true,
      background: 0x101624,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.bg.addChild(this.bgGfx);
    this.app.stage.addChild(this.bg, this.world, this.ui);
    this.app.renderer.on('resize', () => this.relayout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.relayout(), 100));
    this.relayout();
  }

  onResize(cb: (l: Layout) => void): () => void {
    this.resizeCbs.add(cb);
    return () => this.resizeCbs.delete(cb);
  }

  worldToScreen(p: Vec2): Vec2 {
    return worldToScreen(this.layout, p);
  }

  screenToWorld(p: Vec2): Vec2 {
    return screenToWorld(this.layout, p);
  }

  /** Convert a client-space pointer position to world units. */
  clientToWorld(clientX: number, clientY: number): Vec2 {
    const r = this.app.canvas.getBoundingClientRect();
    return this.screenToWorld({ x: clientX - r.left, y: clientY - r.top });
  }

  private relayout(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    const l = computeLayout(w, h);
    this.layout = l;
    // World container: y-up. Origin (0,0) is the playfield's bottom-left on screen.
    this.world.position.set(l.left, l.top + l.height);
    this.world.scale.set(l.scale, -l.scale);
    this.drawBackground(l);
    for (const cb of this.resizeCbs) cb(l);
  }

  private drawBackground(l: Layout): void {
    const g = this.bgGfx;
    g.clear();
    const groundY = l.top + (WORLD_H - GROUND_H) * l.scale;
    // sky: two bands for a cheap horizon glow
    g.rect(0, 0, l.screenW, groundY).fill(SKY_COLOR);
    g.rect(0, groundY - 22 * l.scale, l.screenW, 22 * l.scale).fill({
      color: SKY_HORIZON,
      alpha: 0.35,
    });
    // ground extends to all screen edges
    g.rect(0, groundY, l.screenW, l.screenH - groundY).fill(GROUND_COLOR);
  }
}

export { WORLD_W, WORLD_H, GROUND_H };
