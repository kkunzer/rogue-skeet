import { describe, expect, it, vi } from 'vitest';
import { Haptics, selectProvider, vibratePattern, type HapticEnv } from '../src/feel/haptics';
import { defaultJuiceTuning } from '../src/feel/tuning';

const cfg = defaultJuiceTuning;
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const fakeDoc = () => {
  const clicks = { n: 0 };
  const label = {
    style: {} as Record<string, string>,
    setAttribute: () => undefined,
    appendChild: () => undefined,
    click: () => void clicks.n++,
  };
  const input = { setAttribute: vi.fn(), type: '', tabIndex: 0 };
  const doc = {
    createElement: (tag: string) => (tag === 'label' ? label : input),
    body: { appendChild: vi.fn() },
  } as unknown as HapticEnv['doc'];
  return { doc, clicks };
};

describe('haptic provider selection order', () => {
  const impact = vi.fn();
  const notification = vi.fn();
  const native: HapticEnv['capacitor'] = {
    isNativePlatform: () => true,
    Plugins: { Haptics: { impact, notification } },
  };

  it('prefers Capacitor when native and the plugin exists', () => {
    const p = selectProvider(
      { capacitor: native, nav: { vibrate: () => true, userAgent: IOS_UA }, doc: fakeDoc().doc },
      { iosHaptics: true, cfg },
    );
    expect(p.id).toBe('capacitor');
    p.trigger('shot');
    p.trigger('hit');
    p.trigger('perfect');
    expect(impact).toHaveBeenCalledTimes(2);
    expect(notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
  });
  it('skips Capacitor when not native or the plugin is missing', () => {
    const vibrate = () => true;
    expect(
      selectProvider(
        {
          capacitor: { isNativePlatform: () => false, Plugins: native?.Plugins },
          nav: { vibrate },
        },
        { iosHaptics: true, cfg },
      ).id,
    ).toBe('vibrate');
    expect(
      selectProvider(
        { capacitor: { isNativePlatform: () => true }, nav: { vibrate } },
        { iosHaptics: true, cfg },
      ).id,
    ).toBe('vibrate');
  });
  it('uses navigator.vibrate with the tuned patterns', () => {
    const vibrate = vi.fn(() => true);
    const p = selectProvider({ nav: { vibrate } }, { iosHaptics: false, cfg });
    expect(p.id).toBe('vibrate');
    p.trigger('shot');
    p.trigger('perfect');
    expect(vibrate).toHaveBeenNthCalledWith(1, vibratePattern('shot', cfg));
    expect(vibrate).toHaveBeenNthCalledWith(2, [cfg.hapticPerfectMs, 24, cfg.hapticPerfectTailMs]);
  });
  it('falls to the iOS switch trick on iOS when enabled, and it only fires on the shot', () => {
    const { doc, clicks } = fakeDoc();
    const env: HapticEnv = { nav: { userAgent: IOS_UA, maxTouchPoints: 5 }, doc };
    const p = selectProvider(env, { iosHaptics: true, cfg });
    expect(p.id).toBe('ios-switch');
    expect(p.gestureOnly).toBe(true);
    p.trigger('hit');
    p.trigger('perfect');
    expect(clicks.n).toBe(0);
    p.trigger('shot');
    expect(clicks.n).toBe(1);
    expect(selectProvider(env, { iosHaptics: false, cfg }).id).toBe('none');
  });
  it('does not use the iOS trick on non-iOS, and ends in a no-op', () => {
    const { doc } = fakeDoc();
    const p = selectProvider(
      { nav: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, doc },
      { iosHaptics: true, cfg },
    );
    expect(p.id).toBe('none');
    expect(() => p.trigger('perfect')).not.toThrow();
    expect(selectProvider({}, { iosHaptics: true, cfg }).id).toBe('none');
  });
});

describe('Haptics manager', () => {
  it('respects the enabled switch and counts triggers', () => {
    const vibrate = vi.fn(() => true);
    const h = new Haptics(() => ({ nav: { vibrate } }));
    h.configure({ enabled: true, iosHaptics: false, cfg });
    expect(h.providerId).toBe('vibrate');
    h.play('hit');
    expect(h.stats()).toEqual({ provider: 'vibrate', triggers: 1, last: 'hit' });
    h.configure({ enabled: false, iosHaptics: false, cfg });
    h.play('shot');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
