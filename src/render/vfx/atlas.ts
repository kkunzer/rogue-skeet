import { Rectangle, Texture } from 'pixi.js';

export interface VfxTextures {
  /** Soft round blob for dust and sparks. */
  soft: Texture;
  /** Thin bright ring for impact flashes. */
  ring: Texture;
  /** Diameter of both frames in texture pixels. */
  size: number;
}

/** Generate the particle atlas procedurally (one canvas, two frames), so no image files are needed. */
export function buildVfxTextures(size = 64): VfxTextures {
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (c) {
    const h = size / 2;
    const grad = c.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
    // ring: soft inner/outer falloff around r = 0.8 * half-size
    const rg = c.createRadialGradient(size + h, h, h * 0.6, size + h, h, h);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.5, 'rgba(255,255,255,1)');
    rg.addColorStop(0.62, 'rgba(255,255,255,0.9)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    c.fillRect(size, 0, size, size);
  }
  const base = Texture.from(canvas);
  const soft = new Texture({ source: base.source, frame: new Rectangle(0, 0, size, size) });
  const ring = new Texture({ source: base.source, frame: new Rectangle(size, 0, size, size) });
  return { soft, ring, size };
}
