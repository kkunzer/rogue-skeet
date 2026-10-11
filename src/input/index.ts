import { DragScheme } from './drag';
import { FlickScheme } from './flick';
import type { ControlScheme, SchemeEnv, SchemeId } from './scheme';
import { TapScheme } from './tap';

export function createScheme(id: SchemeId, env: SchemeEnv): ControlScheme {
  switch (id) {
    case 'tap':
      return new TapScheme(env);
    case 'drag':
      return new DragScheme(env);
    case 'flick':
      return new FlickScheme(env);
  }
}

export const SCHEME_LABELS: Record<SchemeId, string> = {
  tap: 'Tap',
  drag: 'Drag reticle',
  flick: 'Flick',
};
