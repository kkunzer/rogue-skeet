import { Container, Graphics, Text } from 'pixi.js';
import { buildGreybox } from '../render/greybox';
import type { Scene, SceneContext } from './scene';

interface ButtonSpec {
  label: string;
  enabled: boolean;
  onTap?: () => void;
}

/** Placeholder menu: title + disabled mode buttons over a dimmed greybox playfield. */
export function createMenuScene({ stage, go }: SceneContext): Scene {
  const greybox = buildGreybox();
  greybox.alpha = 0.35;
  const ui = new Container();
  let off: (() => void) | null = null;

  const buttons: ButtonSpec[] = [
    { label: 'Sandbox', enabled: true, onTap: () => go('sandbox') },
    { label: 'Control Test', enabled: true, onTap: () => go('controlTest') },
    { label: 'Run', enabled: false },
    { label: 'Layout preview', enabled: true, onTap: () => go('playfield') },
  ];

  const build = (): void => {
    ui.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { left, top, width, height, scale: u } = stage.layout;
    const title = new Text({
      text: 'Rogue Skeet',
      style: {
        fill: 0xffd9a0,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '800',
        fontSize: 9 * u,
      },
    });
    title.anchor.set(0.5);
    title.position.set(left + width / 2, top + height * 0.2);
    ui.addChild(title);

    const bw = 56 * u;
    const bh = 11 * u;
    buttons.forEach((b, i) => {
      const y = top + height * 0.38 + i * (bh + 3.5 * u);
      const x = left + (width - bw) / 2;
      const c = new Container();
      const g = new Graphics()
        .roundRect(x, y, bw, bh, 2.5 * u)
        .fill({ color: b.enabled ? 0x2f4f7f : 0x2a2f3a, alpha: 0.95 })
        .stroke({ width: Math.max(1, 0.4 * u), color: b.enabled ? 0x8fb8ff : 0x4b5563 });
      const t = new Text({
        text: b.enabled ? b.label : `${b.label} (soon)`,
        style: {
          fill: b.enabled ? 0xffffff : 0x8b93a1,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: '600',
          fontSize: 4.6 * u,
        },
      });
      t.anchor.set(0.5);
      t.position.set(x + bw / 2, y + bh / 2);
      c.addChild(g, t);
      if (b.enabled) {
        c.eventMode = 'static';
        c.cursor = 'pointer';
        c.on('pointertap', () => b.onTap?.());
      }
      ui.addChild(c);
    });
  };

  return {
    mount() {
      stage.world.addChild(greybox);
      stage.ui.addChild(ui);
      build();
      off = stage.onResize(build);
    },
    unmount() {
      off?.();
      greybox.destroy({ children: true });
      ui.destroy({ children: true });
    },
    update() {},
    render() {},
  };
}
