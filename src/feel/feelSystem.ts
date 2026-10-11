import { audio } from './audio';
import { haptics } from './haptics';
import { feel, loadFeel, onFeelChange } from './settings';
import { onTuningChange, tuning } from './tuning';
import type { JuiceRecord } from '../telemetry/schema';

/** Push persisted settings and tuning into the audio and haptics singletons. */
export function syncFeel(): void {
  audio.enabled = feel.sound;
  audio.setVolume(feel.volume);
  audio.pitchVar = tuning.pitchVar;
  audio.gainVar = tuning.gainVar;
  haptics.configure({ enabled: feel.haptics, iosHaptics: feel.iosHaptics, cfg: tuning });
}

/** Boot: load settings, attach the audio unlock gesture, start sample fetches, keep systems in sync. */
export function initFeel(): void {
  loadFeel();
  syncFeel();
  onFeelChange(syncFeel);
  onTuningChange(syncFeel);
  audio.attachUnlock(window);
  audio.preload();
}

/** The A/B settings in force, as recorded in control-test results. */
export function currentJuiceRecord(): JuiceRecord {
  return {
    juice: feel.juice,
    sound: feel.sound,
    volume: feel.volume,
    haptics: feel.haptics,
    hapticProvider: haptics.providerId,
  };
}
