Skeet Roguelite — Design Doc
Oct 10, 2026 · @Kyle Kunzer
Pitch and pillars
Hook: Skeet shooting where every run rewrites the physics of your shot, so you're always re-learning the lead.
One-thumb, portrait, 8–12 minute runs. The fantasy is the satisfying crack of a clean hit, scaled up until the sky is full of shattering clays.
1. Lead is the skill. Hitting means predicting where the clay will be. Upgrades bend that prediction instead of removing it.
2. Every hit feels great. Shatter, sound, and haptics carry the game. If one shot isn't satisfying, nothing else matters.
3. Builds break the rules. Late-run builds should feel absurd: chain shatters, ricochets, a sky of debris.
4. Short and honest. A run fits a coffee break. Losses come from your aim or your build choices, never from hidden RNG.
Core loop
A run is four stations of 3–4 rounds each. A round is 5–10 throws with a fixed shell count, then you draft one upgrade from three.
Moment to moment: a clay launches with an audio cue from its house, you read its arc, place your shot ahead of it, and get a shatter. Combos for consecutive hits raise the score multiplier and feed some relics. Misses cost shells; running out ends the run.
Rounds feed drafts, stations end in a boss throw, and every run, won or lost, pays tokens that widen the next run's draft pool.
Controls
Controls are the biggest risk, so prototype three schemes in a greybox and pick by data, not taste. Default bet: tap-to-shoot at a point in the sky, because it makes "lead" a literal finger placement.
Scheme
How it works
Strength
Risk
Tap where it'll be
Tap a point; the shot travels there with real flight time
Lead is visible and learnable; fastest input
Finger hides the clay; needs a small offset or ghost trail
Drag reticle, lift to fire
Thumb drags an offset reticle; release fires
Precise; finger never covers the target
Slower; doubles and flurries feel sluggish
Flick to fire
Swipe direction and speed set aim and shot power
Physical, skill-expressive
Inconsistent across devices and hands; hard to tune
Two barrels, two taps. Each round you get a set number of shells, and a double-barrel mod makes a quick second tap fire instantly. That keeps doubles (two clays at once) readable.
Accessibility: an optional aim-assist slider that widens the hit radius, and a left-handed layout mirror.
How to judge the prototypes:
• Hit rate on a fixed 20-throw test, first try vs. fifth try. The scheme should show a clear learning curve.
• Time from clay launch to first shot.
• Whether testers can say why they missed. If they can't, the scheme is hiding the lead.
In-run build system
After each round you pick one of three upgrades from three categories. Builds should combine into named synergies, so players chase a plan rather than raw stats.
Category
What it changes
Examples
Shells
What a shot does on impact
Spread, slug, ricochet pellets, chain shatter, explosive fragments, homing last pellet
Gun relics
How you shoot
Third barrel, auto-reload on a perfect hit, slow-mo when clays cross, lead-assist ghost that grows with combo
Physics mods
How the world moves
Wind gusts, curving shots, slower or faster projectiles, heavier gravity on clays
Curses
A cost with a payoff
Smaller hit radius but 2x score, clays split on hit, one fewer shell but each shell pierces
Example synergies:
• Shrapnel storm: explosive fragments + chain shatter. One hit clears a cluster.
• Sniper: slug + slow-mo + smaller-radius curse. Few shots, huge score.
• Billiards: ricochet pellets + clays-split curse. More targets, every bounce finds one.
Physics mods are the signature. They are rarer, stronger picks that force you to re-learn your lead mid-run. Show a faint trajectory preview for the first few throws after picking one.
Clays and stations
Clays are the enemies and each one asks a different question of your aim. Introduce one new type per station so the threat list stays readable.
Clay
Behavior
What it tests
Standard
Clean arc
Basic lead
Splitter
Breaks into two smaller clays
Follow-up speed
Armored
Needs two hits
Shell economy
Juker
Changes direction once mid-arc
Patience, reading tells
Decoy (gold-striped)
Costs a shell bonus if hit
Target discipline
Bomb
Damages your run if it lands
Priority under pressure
Rabbit
Rolls and bounces along the ground
A totally different lead
Stations (biomes), each with its own throw patterns and one signature clay:
1. Country club: high house and low house, singles and doubles. Tutorial pace.
2. Quarry: rabbits off rock ledges, splitters.
3. Coastline: wind as a station-wide physics mod, jukers.
4. Night range: floodlit arcs, clays visible only inside the light cones, bombs.
Boss throws end each station: a single giant clay that sheds pieces as you chip it, or a 12-clay flurry from every house at once. Bosses should be spectacle first, so even a failed attempt is fun to watch.
Meta-progression
Meta-progression should widen your options, not inflate your stats. A skilled player with nothing unlocked should still be able to win a run.
• Range Tokens (earned per run, more for deeper runs) unlock new shells, relics, and physics mods into the draft pool. More variety, not more power.
• Guns as starting classes. Each gun has one fixed trait and a starting shell. Examples: the Over-Under (balanced), the Pump (more shells, slower reload), the Antique (one barrel, every hit counts double).
• Stations unlock by beating the previous boss, so the world map is the progress bar.
• Heat levels after the first win, each adding one modifier (faster throws, more decoys, fewer shells). This is the long-tail replay for skilled players.
• Clubhouse wall: cosmetic trophies for first clears, boss kills, and named synergies discovered. A visible collection gives completionists a goal.
• Daily range: one fixed seed per day with a shared leaderboard. Same throws for everyone, so it's a pure skill comparison and a reason to open the app daily.
Monetization, risks, and prototype plan
Monetization: premium up front, or free with a one-time unlock after the first station. Cosmetics only beyond that: gun skins, clay shatter effects, range themes. No paid power, because pillar 4 depends on losses feeling fair.
Risks:
• Touch aim feels mushy. Mitigation: controls prototype comes first, with the go/no-go test above.
• Sameness over time. Shooting arcs could feel repetitive by hour three. Mitigation: physics mods and the rabbit clay change the lead itself, not just the numbers.
• Visual clutter in late builds. Debris and fragments can hide live clays. Mitigation: live clays keep a bright rim; debris desaturates fast.
• Narrow theme appeal. Skeet reads as niche. Mitigation: stylized, arcade-bright art and the boss spectacle in all marketing.
Prototype plan:
[ ] Greybox the three control schemes with standard clays only; run the 20-throw test with 5+ people
[ ] Nail one hit: shatter VFX, sound, and haptics on a single clay
[ ] Build one station with 4 clay types, 6 upgrades, and a boss throw
[ ] Play 20 runs and check whether run 20 still feels different from run 1
[ ] Decide go/no-go on the full build