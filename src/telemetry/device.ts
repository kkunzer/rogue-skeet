import type { DeviceInfo } from './schema';

export function collectDevice(): DeviceInfo {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const win = typeof window === 'undefined' ? null : window;
  return {
    userAgent: nav?.userAgent ?? 'unknown',
    platform: nav?.platform ?? 'unknown',
    language: nav?.language ?? 'unknown',
    screen: {
      w: win?.screen.width ?? 0,
      h: win?.screen.height ?? 0,
      dpr: win?.devicePixelRatio ?? 1,
    },
    viewport: { w: win?.innerWidth ?? 0, h: win?.innerHeight ?? 0 },
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
  };
}
