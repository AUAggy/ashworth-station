# How it works

Five rows from [that table](../README.md#fifteen-things-that-broke) are worth the long version, because in each case the fix turned out to be more interesting than the bug. Three sections after them cover what the constraints built when they were designed for rather than debugged into.

## Why the tall ones were unhittable

Enemies are analytic hit spheres, not triangle tests. Each zombie has four volumes in local space that scale with it: head, chest, midsection and legs for anything upright, and a separate set for crawlers, whose mass runs along the floor instead of up a vertical axis. The crawler volumes carry a forward offset as well as a height, rotated by the enemy's facing, because a prone body stacked on a vertical axis is just a sphere with a head somewhere inside it. A shot ray tests the world geometry first, then the enemy spheres, and the nearest hit wins. Headshots resolve against the weapon's multiplier; on an upright enemy, body hits apply 1.0x to the chest, 0.9x to the midsection, 0.7x to the legs.

Spheres are cheap, so the game can afford to test every live enemy for every pellet. But cheap is not free, and a broad-phase check rejects most enemies before the sphere math runs. That check was the bug. It centered on the enemy's feet with a fixed radius, which quietly threw away any ray aimed more than about two meters up. The head hitbox alone sits 2.36 units up before scaling, and the conductor scales to 1.85.

```js
/* Broad phase must bound the whole body, not the feet. e.pos is ground
   level but hitboxes reach 2.36*scale above it, so a fixed radius of 3
   rejected rays aimed at the head of anything tall: brutes past 5m and
   conductors past 2m were unhittable. Centre on mid-body, scale the radius. */
```

The tall enemies had heads you could see and could not shoot. Nothing errored. Nothing logged. The game just felt unfair, which is the worst bug a game can have and the hardest one to find, because the person reporting it can only tell you that it isn't working.

The same bug came back from the other direction the day crawlers were added. A bounding sphere centred 1.45 units up encloses an upright zombie and floats entirely above a prone one, so the fix was never a better constant; it was moving the constant onto the enemy. Broad-phase height, hit volumes and the touch aim-assist target are all per-type now. Left alone, three of those four would have failed silently, and the symptom would have been a crawler you could see and could not shoot.

Touch gets a gentle aim assist on top of this, not a lock-on. If the shot direction falls within about seven degrees of an enemy's head, the direction lerps 55% of the way toward it. It makes a kid on a tablet lethal. It does not make misses impossible, and it never applies to desktop.

## Why the zombies were forgiving

An eight-year-old reached wave 10 on their second run. That is the bug report. Three things caused it, and all three were invisible from the code.

The first was a single condition. An enemy attacked only while `dist < reach`, and its cooldown counted down only inside that same test, and it stopped moving the instant it got there. The player's target walking speed is 4.5 m/s before badges. A zombie would arrive, freeze at arm's length, start charging a swing, and the player would take one step and freeze the timer mid-count. The pack behind you was not weak. It was permanently mid-count. Enemies now close inside their own reach, count down across a wider band, and land the hit at the end of a telegraphed windup, which connects far more often while still being something you can see and step out of.

Player acceleration and friction now use time-based updates too. The browser suite checks walking, sprinting and aiming travel at 30/60/120 Hz; the old refresh-rate-dependent movement is recorded in the [baseline evidence](TESTING.md#unmodified-baseline-evidence).

The second was that enemies were never solid. They were absent from the collision set, so a crowd of twenty was a crowd you could walk through. Being surrounded had no physical meaning. They push now, accumulated across the pack and capped so a pile-up shoves rather than teleports.

The third is the smallest and the most instructive. `damagePlayer(amount, from)` had always taken the attacker's position, and had never once used it. The damage overlay was a symmetric red vignette, so a bite from behind and a bite from the front rendered identically. The information existed, arrived at the right function, and was thrown away, which is a different failure from not having it, and a harder one to notice, because the signature looks correct.

Between them those three made an entire hemisphere of the game decorative. Fixing the third one is what made fixing the first two feel fair instead of cheap.

## Why WASD died in France

Keyboard handlers usually read `e.key`, which gives you the letter the key produces. On AZERTY that means the movement cluster under a French player's left hand reports `Z`, `Q`, `S`, `D`. On Dvorak it reports something else again. On a non-Latin layout it reports nothing you can match.

The game maps `e.code` instead, which is the physical key position and therefore what a movement cluster actually is, with a fall back to `e.key` for anything unmapped.

The same disease turns up in touch detection, with the same cure. `ontouchstart` and `maxTouchPoints` are both true on a Windows touch laptop, which used to hand those players the mobile build: on-screen sticks, aim assist, and no pointer lock, with a mouse sitting right there. Capability is the wrong question. `(pointer:coarse)` asks what the primary input *is*, so a touchscreen laptop with a mouse gets the desktop build and a phone gets the phone build.

Both bugs are the same mistake, which is trusting a signal that is adjacent to the thing you care about instead of the thing itself.

## Why iOS is a war

Audio is fully synthesized. That deletes every asset-loading failure mode and leaves the platform ones, of which iOS has three:

**The silent switch.** Where `navigator.audioSession` is available, the engine requests `playback` before creating its AudioContext, intending to keep the game audible through the silent switch. The API is feature-detected; unsupported browsers skip the request. Actual Safari behavior still needs a device check.

**Repeated contexts.** The original iOS failure followed repeated AudioContext creation. Four is a historical observation here, not a portable Safari quota. Creating a context per gesture risks exhausting platform resources. The engine creates its context once when sound is first unlocked, resumes it on later gestures, and never tears it down. Unlock handlers fire on `pointerdown` and `touchend` in the capture phase, and deliberately not on `mousedown`, which on iOS is just the compat event trailing a touch.

**Audio must never kill a frame.** The impact sound sits inside the pellet loop, and wave cues sit mid-update. An exception thrown by a sound would abort damage application halfway through a shotgun blast. Every audio call is wrapped, so the worst case is a missing noise rather than a zombie that ate nine pellets and took damage from three.

## How it limits rendering cost

A phone GPU is fill-rate bound before it is anything else, so the renderer asks the same scene for less work when the primary pointer is coarse. Pixel ratio caps at 1.25 instead of 1.75, multisampling is off, anisotropic filtering drops from 16x to 4x.

The interesting one is lights. Every standard material fragment loops over every punctual light in the scene, so light count is a direct multiplier on fragment cost, and the game has a headlamp, an express train and a muzzle flash before the pool is counted at all. Six pool lights means nine total; four means seven, which is about 22% less per-fragment light math before other fragment costs are counted.

These are automatic quality limits. They reduce rendering cost but do not establish 60 fps on an actual tablet; sustained real-device performance remains unverified.

On top of that the pixel ratio adapts at runtime. The loop measures FPS over two-second windows: below 44 it drops the ratio in 0.25 steps to a floor of 0.7, above 58 it climbs back toward the base. A crowded wave can lower resolution; a clear moment can restore it. The [fixed-quality render benchmark](TESTING.md#matched-graphics-capture) disables that adaptation so it cannot hide a slower graphics pass.

The rest of the frame budget is spent the same way, by finding costs and removing them structurally rather than turning them down. The station's static geometry stops updating its matrices after boot. Seven benches, twelve meshes each, used to allocate 84 separate geometry buffers; they now share one buffer per distinct shape. Dust motes ran 480 trigonometry calls and a full vertex buffer upload every frame for drift you cannot see, so they now run every third frame at three times the step. Same motion, a third of the cost.

## Generated assets, local storage

The entire visual and audio world is generated at runtime. Canvas texture generators paint the station at boot: tiles, ballast, the tactile paving strip along the platform edge, posters, the train skin, blood, bullet holes. The reverb is a generated impulse response, 2.4 seconds of decaying noise pushed through a convolver, which is why the station sounds like concrete. The ambient bed is a 59 Hz sawtooth with a 118.4 Hz sine over it, low-passed, under band-passed noise for air movement. Guns and zombies are built from boxes and cylinders. No gameplay image or audio files are fetched.

There is no application telemetry, account or profile server. A static host still receives normal page requests. Profile and preferences stay in the browser; clearing site data clears them, and storage errors do not prevent play.

### Local profile and preferences

`ashworthSave` keeps the existing `{ ngP, badges, best }` format. `loadSave()` validates those fields independently. NG+ must be a nonnegative safe integer for which `Math.pow(1.3, ngP) * 10000` remains finite. Only literal `true` values in the first five badge slots grant badges. A best record requires nonnegative safe-integer `waves`, `kills`, `score` and `ngP`, finite accuracy from 0 to 100, and finite nonnegative time. Invalid fields revert to defaults without discarding valid siblings. Existing valid profiles need no migration.

`ashworthDiff` stores the EASY/HERO choice. `ashworthPrefs` stores boolean `muted` and `reducedEffects` preferences. Reduced effects defaults to `prefers-reduced-motion` unless a saved boolean overrides it. Muting changes the master audio gain. Reduced effects suppresses cosmetic camera/weapon motion, grain, flicker and white end-screen flashes, and dims muzzle flashes. Pitch/yaw aiming recoil and damage cues remain; weapon damage and ammo rules do not change.

Three.js is now served locally rather than fetched from a CDN. The engine is vendored ([Three.js](../vendor/three.module.min.js) and [RoomEnvironment](../vendor/RoomEnvironment.js)), with both resolving to the same local engine through the import map. See [provenance and hashes](VENDOR.md). A small service worker precaches the page and engine after an online visit on HTTPS or localhost. Cache Storage is separate from the HTTP cache, but browsers can evict it and users can clear it. A first-ever offline visit is unsupported; serve the checkout over HTTP rather than opening `file://`. The [hosting section](../README.md#running-and-hosting) of the README covers cache versioning and the bump rule.

## What it throws away

A single-file game that runs for an hour leaks visibly. Corpses, decals and pickups pile up and the frame rate sags, and there is no server to restart. So disposal is part of the simulation:

- Corpses fade at 2.6 seconds and are removed at 4.3, disposing their materials and shadow material.
- Blood and bullet holes share one 120-slot decal pool. Overflow drops the oldest and disposes its geometry, so an hour-long run costs what a five-minute one costs.
- Pickup halos dispose their material on collection. Clearing enemies between runs disposes everything.
- Because geometry is shared, a corpse only ever costs its materials, and those are freed.

## The wave director

Waves are a state machine: `intermission -> train -> spawning -> fighting -> intermission`. Wave 1 skips the train and spawns from the tunnels. Regular HERO size is `min(44, 5 + round(wave * 3.1))`, pacing tightens by 0.055 seconds a wave to a floor of 0.16, and the concurrent cap scales to `min(30, 12 + round(wave * 1.6))`. Wave 15 instead requests 36 on HERO or 29 on EASY with a 0.24-second spawn gap. Its roster reserves brutes, crawlers and conductors before assigning runners; [finale counts](TUNING.md#finale-roster) show how EASY NG+ clips runners rather than bosses.

Where they come from turned out to matter more than how many. Every wave after the first used to come out of the train doors, and the train stops at mid-platform, so walking to either end bought a forty-meter firing lane with a wall behind you and the entire wave arriving on one bearing. About two spawns in five now come from tunnel mouths, level platform entrances and the track bed, biased toward whichever end you are nearest. The stairs are closed decorative geometry; neither players nor enemies have an elevated stair route. If you are backed into that end, the spawn moves to the platform lip beside you and comes up out of the track bed instead, which costs it a visible climb and never puts anything in your face: every spawn must have at least 7 m of horizontal clearance. A train-door placement inside that clearance redirects to a flank and consumes the same single queue entry. Enemies also peel off a shared bearing rather than queueing along it, so a pack fans out and comes round instead of forming a firing-range line.

Entrances are train doors, tunnel mouths, level platform ends or the track bed beside the platform. Nothing steps out until the carriage has stopped and the doors are more than half open, and zombies leaving a train hold an explicit `exit` state that walks them clear of the doorway before they aggro. It buys nothing mechanically and costs them a few strides of not-attacking. It is also the entire reason a train reads as a threat instead of a spawn point with a paint job.

## Tactical pause and interruption holds

A tactical pause spends one of three rations per wave and counts down for three seconds of foreground game time. Its own pointer-lock release leaves that pause intact. Touch or fallback steering can auto-resume at expiry; desktop play still missing pointer lock switches to a held run instead.

Blur, pagehide, hidden tabs, resize and externally lost pointer lock call `suspend()`, from play or tactical pause. This clears held controls and freezes simulation without spending another ration. Returning focus or visibility alone never resumes combat. The native RESUME button requires an explicit mouse, touch or keyboard activation; a rejected desktop lock request can use fallback steering. QUIT TO TITLE ends the held run.

Beyond that, the code is the documentation. Every system sits behind a banner comment, and the comments explain why rather than what. `grep '/\* ='` gives you the table of contents.

