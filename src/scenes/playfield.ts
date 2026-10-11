import { Text } from 'pixi.js';
import { buildGreybox } from '../render/greybox';
import type { Scene, SceneContext } from './scene';

/** Greybox playfield: shows the fixed 90x160 layout. Tap anywhere to go back to the menu. */
export function createPlayfieldScene({ stage, go }: SceneContext): Scene {
  const box = buildGreybox();
  const hint = new Text({
    text: 'tap to return',
    style: { fill: 0xffffff, fontFamily: 'system-ui, sans-serif', fontSize: 14 },
  });
  hint.alpha = 0.6;
  hint.anchor.set(0.5, 0);
  let off: (() => void) | null = null;

  const place = (): void => {
    hint.position.set(stage.layout.screenW / 2, stage.layout.top + 8);
    hint.style.fontSize = Math.max(11, stage.layout.scale * 3.2);
  };
  const onTap = (): void => go('menu');

  return {
    mount() {
      stage.world.addChild(box);
      stage.ui.addChild(hint);
      place();
      off = stage.onResize(place);
      stage.app.canvas.addEventListener('pointerdown', onTap);
    },
    unmount() {
      off?.();
      stage.app.canvas.removeEventListener('pointerdown', onTap);
      box.destroy({ children: true });
      hint.destroy();
    },
    update() {},
    render() {},
  };
}
