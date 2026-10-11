import type { Stage } from '../render/stage';

export interface SceneContext {
  stage: Stage;
  go: (name: SceneName) => void;
}

export type SceneName = 'menu' | 'playfield';

export interface Scene {
  mount(): void;
  unmount(): void;
  /** Fixed-step simulation tick; dt in seconds. */
  update(dt: number): void;
  /** Per-frame render; alpha is the interpolation factor between sim steps. */
  render(alpha: number): void;
}

export type SceneFactory = (ctx: SceneContext) => Scene;

export class SceneRouter {
  private current: Scene | null = null;
  private factories = new Map<SceneName, SceneFactory>();
  currentName: SceneName | null = null;

  constructor(private readonly ctx: Omit<SceneContext, 'go'>) {}

  register(name: SceneName, factory: SceneFactory): void {
    this.factories.set(name, factory);
  }

  go = (name: SceneName): void => {
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`Unknown scene: ${name}`);
    this.current?.unmount();
    this.current = factory({ ...this.ctx, go: this.go });
    this.currentName = name;
    this.current.mount();
    document.body.dataset.scene = name;
  };

  update(dt: number): void {
    this.current?.update(dt);
  }

  render(alpha: number): void {
    this.current?.render(alpha);
  }
}
