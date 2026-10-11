import { audio } from '../feel/audio';
import { feel, notifyFeelChanged, saveFeel, type FeelSettings } from '../feel/settings';
import { el } from './dom';

type BoolKey = {
  [K in keyof FeelSettings]: FeelSettings[K] extends boolean ? K : never;
}[keyof FeelSettings];

/**
 * Juice / sound / haptics controls shared by the sandbox panel and the control-test setup screen.
 * Writes the persisted feel settings (localStorage) on every change.
 */
export function buildFeelControls(): HTMLElement {
  const toggle = (key: BoolKey, id: string, label: string, hint?: string): HTMLElement => {
    const box = el('input', { attrs: { type: 'checkbox', id, checked: feel[key] } });
    box.addEventListener('change', () => {
      feel[key] = box.checked;
      saveFeel();
      // a tap on a toggle is a user gesture: make sure audio is unlocked
      void audio.unlock();
    });
    return el('label', { attrs: { style: 'flex-direction:row;align-items:center;gap:10px' } }, [
      box,
      el('span', { text: label }),
      hint ? el('span', { cls: 'small', text: hint }) : null,
    ]);
  };

  const vol = el('input', {
    attrs: { type: 'range', min: 0, max: 1, step: 0.05, value: feel.volume, id: 'opt-volume' },
  });
  const out = el('span', { cls: 'small', text: `${Math.round(feel.volume * 100)}%` });
  vol.addEventListener('input', () => {
    feel.volume = Number(vol.value);
    out.textContent = `${Math.round(feel.volume * 100)}%`;
    notifyFeelChanged();
  });
  vol.addEventListener('change', () => saveFeel());

  return el('div', { cls: 'feel-controls', attrs: { id: 'feel-controls' } }, [
    el('div', { cls: 'small', text: 'Feel' }),
    toggle('juice', 'opt-juice', 'Juice (shatter, shake, hit-stop, sound, haptics)'),
    toggle('sound', 'opt-sound', 'Sound'),
    el('label', {}, [el('span', { text: 'Volume' }), el('div', { cls: 'range-row' }, [vol, out])]),
    toggle('haptics', 'opt-haptics', 'Haptics'),
    toggle('iosHaptics', 'opt-ios-haptics', 'iOS Safari haptic', '(experimental, shot only)'),
  ]);
}
