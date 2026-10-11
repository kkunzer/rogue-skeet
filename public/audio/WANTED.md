# Audio samples wanted (CC0 only)

The game ships with procedural synth fallbacks for every cue (`src/feel/synth.ts`), so it works with
no files. No CC0 samples were obtained: kenney.nl, opengameart.org and freesound.org are blocked by
the build sandbox's egress proxy (403 on CONNECT). To upgrade the sound, drop short files here and
set the filename in `AUDIO_MANIFEST` in `src/feel/audio.ts` (any subset works; a missing or
undecodable file falls back to the synth for that cue). Prefer mono .ogg or .m4a (iOS Safari plays
.m4a/.mp3 and, since 17.x, .ogg is not guaranteed), 44.1 kHz, total under 1 MB.

| Cue id                       | What to source                                              | Length     | Notes                                |
| ---------------------------- | ----------------------------------------------------------- | ---------- | ------------------------------------ |
| `gunTransient`               | Sharp shotgun/pistol crack, first few ms only               | 20-40 ms   | bright, dry                          |
| `gunBody`                    | Shotgun boom body                                           | 150-300 ms | low-mid thump                        |
| `gunTail`                    | Outdoor shotgun tail / distant rumble                       | 500-900 ms | quiet, decays                        |
| `crack1`, `crack2`, `crack3` | Clay pigeon / ceramic plate breaking, three different takes | 80-200 ms  | crisp, bright, little low end        |
| `thunk`                      | Trap-house arm release thunk                                | 100-250 ms | pitched and panned per house in code |
| `chime`                      | Short bright bell/ping for perfect hits                     | 400-700 ms | E6-ish pitch                         |
| `click`                      | Dry-fire hammer click                                       | 30-80 ms   | quiet                                |
| `armor`                      | Metal clang / ricochet ping for an armored clay's first hit | 150-300 ms | bright metallic                      |
| `zap`                        | Short electric arc for Chain shatter                        | 100-250 ms | pitched by link                      |
| `shellEmpty`                 | Hollow empty-chamber thud                                   | 100-250 ms | duller than `click`                  |
| `upgrade`                    | Rising sparkle for an upgrade pick                          | 400-800 ms | UI                                   |
| `synergy`                    | Big stinger for the SHRAPNEL STORM banner                   | 0.8-1.2 s  | UI                                   |
| `roundClear`                 | Warm win jingle                                             | 0.8-1.2 s  | UI                                   |
| `runOver`                    | Falling "game over" figure                                  | 1-1.5 s    | UI                                   |

Candidate CC0 sources: Kenney "Impact Sounds" and "Digital Audio" packs (kenney.nl), OpenGameArt
CC0 searches ("shotgun", "clay break", "glass shatter"), Freesound CC0 filter. When adding a file,
record source URL, author and license in `CREDITS.md` in this folder.
