import type { Vec2 } from '../core/vec2';
import type { ControlScheme, PointerEvt, SchemeEnv, SchemeView, Script } from './scheme';

/** Tap where it'll be: fires on pointerdown at the touch point plus a vertical offset. */
export class TapScheme implements ControlScheme {
  readonly id = 'tap' as const;
  readonly label = 'Tap';
  readonly summary = 'Tap where the clay will be';
  readonly instructions =
    'Tap the spot in the sky where you think the clay will be when your shot gets there. The shot takes a moment to travel, so tap ahead of the clay.';
  constructor(private readonly env: SchemeEnv) {}

  onPointer(e: PointerEvt): void {
    if (e.type !== 'down') return;
    const aim = { x: e.pos.x, y: e.pos.y + this.env.cfg().tapOffsetY };
    this.env.emit({ aim, t: e.t });
  }

  reset(): void {}

  view(): SchemeView {
    return {};
  }

  canReach(): boolean {
    return true;
  }

  script(aim: Vec2): Script {
    const touch = { x: aim.x, y: aim.y - this.env.cfg().tapOffsetY };
    return {
      events: [
        { type: 'down', id: 1, pos: touch, t: 0 },
        { type: 'up', id: 1, pos: touch, t: 0.04 },
      ],
    };
  }
}
