# Native wrapping (Capacitor)

The web build already runs everywhere; wrapping it with Capacitor is only needed for real iOS haptics
(Safari has no `navigator.vibrate`) and store distribution. `src/feel/haptics.ts` already prefers the
Capacitor Haptics plugin when `window.Capacitor.isNativePlatform()` is true, reached through the global
(no import, no dependency in this repo today).

## Common steps

```sh
npm i @capacitor/core @capacitor/cli @capacitor/haptics
npx cap init "Rogue Skeet" com.example.rogueskeet --web-dir dist
```

Build for native with `base: './'` so assets load from the app bundle (set via an env flag in
`vite.config.ts`; the GitHub Pages build keeps `/rogue-skeet/`), then:

```sh
npm run build
npx cap add ios      # needs macOS + Xcode
npx cap add android  # needs Android Studio + JDK
npx cap sync
```

Portrait lock and fullscreen: set `UISupportedInterfaceOrientations` to portrait in `ios/App/App/Info.plist`,
and `android:screenOrientation="portrait"` on the main activity.

## iOS (Mac required)

1. `npx cap open ios`, set the signing team and bundle id in Xcode.
2. Haptics work on a physical iPhone only (the simulator has no Taptic Engine). The plugin calls
   `UIImpactFeedbackGenerator` (light for shot, medium for hit) and a success notification for perfect hits.
3. Web Audio still needs a first touch to unlock; `AudioManager.attachUnlock` handles it.
4. Archive and upload through Xcode / TestFlight.

## Android

1. `npx cap open android`, run on a device. `@capacitor/haptics` uses the system vibrator
   (`VIBRATE` permission is added by the plugin).
2. Without Capacitor, Chrome on Android already vibrates through `navigator.vibrate`.
3. Build an AAB from Android Studio for Play.

## Notes

- Provider order is Capacitor, `navigator.vibrate`, the experimental iOS Safari switch trick (shot only,
  user gesture required), then no-op. The active provider is recorded in control-test results
  (`juice.hapticProvider`).
- Keep the PWA manifest; the native shell ignores it.
