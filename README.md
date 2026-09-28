# Ashworth Station

A single-file, browser-based zombie survival FPS. Hold the uptown platform at Ashworth Street while the northbound pulls in and the doors open onto more of them. Fifteen waves. The last one is a train that keeps unloading. You will lose. The record is how long you lasted.

![Ashworth Station](og-image.png)

<!-- TODO: replace the still with a 3-second GIF of the train arriving and the doors opening. -->

**Play it:** <https://auaggy.github.io/ashworth-station/>

**Run it yourself:** the game is one HTML file. Download it and serve it over HTTP from the folder it sits in:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

It needs a web server rather than a double-click because the page is an ES module that imports three.js by bare specifier. Opened straight off disk as `file://`, the module fetch runs from a null origin and browsers disagree about whether to allow it. Any static host works: GitHub Pages, S3, a USB stick behind nginx, `python3 -m http.server`.

**The file:** `index.html` (3,670 lines, ~160 KB) plus the engine it imports, vendored under `vendor/` (~680 KB), and a 46-line service worker. No images, no audio files, no fonts, no build step, no server, and no network dependency at all: the engine is vendored, and the service worker precaches the lot, so the game boots with no internet and an empty browser cache. Needs WebGL; if the browser can't give it a context, the title screen says so instead of failing silently.

The rest of this is how it got that way, and it is mostly a story about things that broke.

**Jump to:** [Fifteen things that broke](#fifteen-things-that-broke) · [Playing it](#playing-it) · [How it works](#how-it-works) · [Tuning tables](#tuning-tables) · [Hosting](#running-and-hosting) · [Contributing](#contributing)

---

## How this started

The other day I came across [youtuber Bijan's review](https://youtu.be/9Z9rPZavjUU?si=yE2PCZbYU2tk_4ar&t=1718) of a frontier model where he generated a Subway FPS game in one shot. I didn't have access to that model but thought it would be a good idea to try myself. It took a mixture of models, a good deal longer than one shot, and a fair amount of checking their work, but it eventually produced a working zombie FPS.

It was fun in the way a sketch is fun: the loop worked, the mood was right, and the code was a house of cards. Any real change risked collapsing it, and it would never survive a tablet.

So it was rewritten from scratch, then hardened through hours of iteration and hundreds of playtest rounds, mostly against the two platforms that matter here: a kid on an iPad, and a desktop browser with a mouse. This repository is the result. It is the difference between a demo and a thing you hand a nine-year-old and walk away from.

Almost none of that difference is features. It is this list.

---

## Fifteen things that broke

Few playtest rounds ended in a crash. Crashes are easy; you get a stack trace and a line number. These are the other kind, where the game keeps running and quietly does the wrong thing, and the only symptom is a nine-year-old saying "it's not shooting him," or an eight-year-old reaching wave 10 on their second run and telling you, correctly, that the zombies are too forgiving.

| Symptom | Root cause | Fix |
|---|---|---|
| Headshots miss on big zombies | Raycast broad phase centered on feet, fixed radius, rejected anything tall | Center on mid-body, scale radius with enemy size |
| Game goes silent on iOS after a few plays | AudioContext rebuilt per gesture, hit the ~4-context ceiling | Create once, resume forever, never rebuild |
| Silent on iOS even with sound on | WebAudio on `ambient` session, muted by the switch | Request `playback` session |
| WASD dead on AZERTY/Dvorak | `e.key` returns the layout's letter | Map physical `e.code` positions |
| Touch laptop got the mobile build | Capability sniffing can't tell a touchscreen from a touch primary input | Ask `(pointer:coarse)` |
| "BEST SCORE" always echoed the run you just played | Best run reassigned unconditionally, then read back | Only overwrite when strictly better; record on loss too |
| Difficulty chips dead after returning to title | Menu HTML re-rendered, orphaning the old listeners | Delegate clicks on the screens container, repaint chips after render |
| Free shot right after deploying on iOS | Stale touch timestamp let Safari's synthesized mousedown fire | Stamp the timestamp before the state check |
| Crosshair wrote styles every frame forever | Bloom settled to zero but the write never stopped | Round to whole pixels, latch on change only |
| Frame rate sag on long runs | Corpse and pickup materials never disposed | Dispose on removal, everywhere |
| Dust animation burned GPU for invisible drift | 480 trig calls and a VBO upload per frame | Update every third frame at 3x step |
| Zombies barely hurt a moving player | Attack cooldown only counted down inside `reach`, and enemies froze the moment they arrived, so anyone faster stepped out of every swing | Close to 0.75x reach, run the timer across a wider band, land the hit at the end of a telegraphed windup |
| A crowd could be walked straight through | Enemies were never added to the collision set | Push the player, accumulated across the pack and capped |
| A hit from behind looked exactly like a hit from the front | `damagePlayer` received the attacker's position and discarded it | Three pooled arrows on the bearing relative to facing |
| Backing into an end wall was the safest place in the game | Every wave after the first spawned from the train doors at mid-platform, forty meters away | Spawn from the tunnel mouths and stair alcoves at whichever end the player is nearest |

Read the list again and it sorts itself into three piles. Three rows are iOS specifically, a fourth is telling a touchscreen apart from a touch-first device, and three more are a GPU that cannot afford the work being asked of it. That is one constraint. The next four are a game that has to survive on its own with nobody to restart the server, because there is no server.

The last four rows are a different animal, and they took the longest to see. Nothing about them is a platform quirk or a performance ceiling. The code did exactly what it said, the frame rate was fine, and the game was still wrong: forgiving where it should have been dangerous, silent where it should have been legible, and holding one safe tile that a child found in two runs. Those do not show up in a profiler. They show up as somebody enjoying the game for the wrong reason.

So, derived rather than declared:

1. **The kid plays on an iPad.** Touch input, small screens, short attention, no patience for a game that stutters or a game that cheats.
2. **The deliverable is one file.** A link has to be enough. No install, no assets folder, no account, no telemetry, nothing to break.
3. **The game has to be able to beat you.** It is built to be lost, so anything that quietly makes losing optional (a swing that never lands, a crowd you can walk through, a corner with a wall behind it) is not generosity. It is the game failing at its only job.

Everything below is those three, followed to their conclusions.

---

## Playing it

Desktop: `WASD` move, `SHIFT` sprint, `SPACE` jump, mouse to aim, left click to fire, right click for sights, `R` reload, `1` `2` `3` weapons, `ESC` pause, `Q` to quit from the end screen. Aiming uses pointer lock; where pointer lock is blocked, typically inside an iframe, the game falls back to steering by mouse position and says so on screen.

Touch: left thumb on an analog stick, right thumb aims anywhere, and dedicated `RELOAD`, `JUMP` and `TURN` buttons. `TURN` is a 180-degree flip for when the horde gets behind you.

The fire button is also an aim zone: hold to shoot, drag to look, one thumb. That was a bug report from a nine-year-old before it was a feature. Kids grip the fire button and expect the same thumb to steer, and fighting that instinct loses.

Pause is rationed: three presses a wave, and a press buys three seconds, because the card counts itself down and drops you back in whether you are ready or not. Spend the ration and the wave keeps running while you reload in the open: the press is denied, the banner says so, and the next wave hands the three back. On desktop the count also covers the pause a lost pointer lock gives you, because the browser taking the mouse away is the same press as any other; when the ration is spent, a click on the view takes the lock back instead of freezing the run. ESC used to be a wall the horde could not cross, free to hold for as long as the holder liked whenever the platform got loud. A game built to be lost cannot sell infinite time-outs, so the wall got a price and a timer.

Waves escalate through 15, from a handful of walkers to a capped 44, with up to 30 on the platform at once. Wave 1 comes out of the tunnel mouths. Most of every wave after that arrives as a train, which pulls in, opens its doors, and unloads, but not all of it. The rest comes from the tunnel mouths and the stair alcoves at whichever end of the platform you are standing nearest, because for a long time a wall at your back was the safest place in the game. Runners and crawlers join at wave 3, brutes at 5, and the last train brings a conductor. Two difficulty chips sit on the title screen: HERO is the real game, touch devices default to EASY, and the choice persists.

### Look down

Crawlers do not stand up. They drag along the platform at ankle height, which puts them under the crosshair at a level look: a shot aimed straight ahead passes over them at every range, no matter how close they are. You need about eleven degrees of down-angle at six meters and thirty at two. They have cold cyan eyes, the one colour nothing else on the platform uses, and their own dragging scrape in the mix, because stereo panning cannot say "low" and something has to send your eyes to the floor.

Everything that reaches you telegraphs. A zombie in range winds up for between 0.18 and 0.34 seconds before the damage lands, and the hit only registers if you are still there when it does. Brutes and conductors wind up longest and hit hardest. Backing out of a swing is a real option. Standing still is not, because they close inside their own reach now and push you where they want you, and when something hits you from behind an arrow tells you which way to turn.

Health does not fully come back. Out of contact it regenerates to 70 and stops, 85 on EASY. Past that you need a medkit, which drops from brutes and conductors and occasionally from anything else, but only while you are already hurt, and it drops where the body fell. Ammunition works the same way: kills drop it, the between-wave restock is deliberately thin, and both of them mean the same thing, which is that holding one corner slowly starves you out of it.

### The score is the loss

The title screen says it: *"The last train never came. Something came down the tunnel instead."* The meta description says the rest: *"You will lose. The record is how long you lasted."*

This game is designed to be lost. Wave 15 exists so that holding it means something. If you hold it, you earn a badge and the next run starts in New Game+, where the same 15 waves come back harder and your badge keeps paying. Five badges, earned in order, one per victory:

| Badge | Effect |
|---|---|
| BRAVE | +12% weapon damage |
| DEADEYE | +0.5 headshot multiplier |
| SPEEDLOADER | -20% reload time |
| SCAVENGER | More ammo drops and restock |
| SPRINTER | +10% move speed |

Losing on NG+ is not a reset. The prestige counter stays, the badges stay, and the best score is recorded on death as well as victory, because a game you are meant to lose has to count the losses.

### Weapons

Three weapons, three jobs. The M9 sidearm is the skill weapon: the highest headshot multiplier in the game, the tightest sights, the smallest magazine, and one headshot kills a base walker with 10.2 damage to spare (38 x 2.9 = 110.2 against 100 HP). It is the gun the title screen means when it says "aim for the eyes." The MK9 SMG is the panic button at 820 rounds per minute, and it burns reserve ammo exactly as fast as it burns the horde. The 870 pump is the conversation ender, nine pellets at 19 damage each, with a 2.6-second reload that is an eternity when something is running at you.

All three bloom as you fire, which the crosshair shows, and dry-firing with reserve ammo starts an automatic reload, which is the game being polite about a mistake you are about to make again. Full numbers are in the [tuning tables](#weapons-1).

---

## How it works

Five rows from [that table](#fifteen-things-that-broke) are worth the long version, because in each case the fix turned out to be more interesting than the bug. Three sections after them cover what the constraints built when they were designed for rather than debugged into.

### Why the tall ones were unhittable

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

### Why the zombies were forgiving

An eight-year-old reached wave 10 on their second run. That is the bug report. Three things caused it, and all three were invisible from the code.

The first was a single condition. An enemy attacked only while `dist < reach`, and its cooldown counted down only inside that same test, and it stopped moving the instant it got there. The player walks at 4.5 m/s and nothing in the game exceeds that until wave 8. So a zombie would arrive, freeze at arm's length, start charging a swing, and the player would take one step and freeze the timer mid-count. The pack behind you was not weak. It was permanently mid-count. Enemies now close inside their own reach, count down across a wider band, and land the hit at the end of a telegraphed windup, which connects far more often while still being something you can see and step out of.

The second was that enemies were never solid. They were absent from the collision set, so a crowd of twenty was a crowd you could walk through. Being surrounded had no physical meaning. They push now, accumulated across the pack and capped so a pile-up shoves rather than teleports.

The third is the smallest and the most instructive. `damagePlayer(amount, from)` had always taken the attacker's position, and had never once used it. The damage overlay was a symmetric red vignette, so a bite from behind and a bite from the front rendered identically. The information existed, arrived at the right function, and was thrown away, which is a different failure from not having it, and a harder one to notice, because the signature looks correct.

Between them those three made an entire hemisphere of the game decorative. Fixing the third one is what made fixing the first two feel fair instead of cheap.

### Why WASD died in France

Keyboard handlers usually read `e.key`, which gives you the letter the key produces. On AZERTY that means the movement cluster under a French player's left hand reports `Z`, `Q`, `S`, `D`. On Dvorak it reports something else again. On a non-Latin layout it reports nothing you can match.

The game maps `e.code` instead, which is the physical key position and therefore what a movement cluster actually is, with a fall back to `e.key` for anything unmapped.

The same disease turns up in touch detection, with the same cure. `ontouchstart` and `maxTouchPoints` are both true on a Windows touch laptop, which used to hand those players the mobile build: on-screen sticks, aim assist, and no pointer lock, with a mouse sitting right there. Capability is the wrong question. `(pointer:coarse)` asks what the primary input *is*, so a touchscreen laptop with a mouse gets the desktop build and a phone gets the phone build.

Both bugs are the same mistake, which is trusting a signal that is adjacent to the thing you care about instead of the thing itself.

### Why iOS is a war

Audio is fully synthesized. That deletes every asset-loading failure mode and leaves the platform ones, of which iOS has three:

**The silent switch.** iOS 16.4 and later default WebAudio to the `ambient` session, which the ring/silent switch mutes. So a player with the switch flipped got a silent game and no way to tell that was the reason. The engine asks for `playback` instead, which respects the physical switch the way a game should. Everywhere else it is a no-op.

**The four-context ceiling.** iOS Safari allows roughly four live AudioContexts per page lifetime. After that, `new AudioContext()` throws and the game is permanently silent until reload. Creating a context per gesture, which is the obvious thing to do, means the game dies on the fifth deploy. The engine creates its context exactly once, on the first gesture, resumes it on every later one, and never tears it down. Unlock handlers fire on `pointerdown` and `touchend` in the capture phase, and deliberately not on `mousedown`, which on iOS is just the compat event trailing a touch.

**Audio must never kill a frame.** The impact sound sits inside the pellet loop, and wave cues sit mid-update. An exception thrown by a sound would abort damage application halfway through a shotgun blast. Every audio call is wrapped, so the worst case is a missing noise rather than a zombie that ate nine pellets and took damage from three.

### Why it holds 60 fps on a tablet

A phone GPU is fill-rate bound before it is anything else, so the renderer asks the same scene for less work when the primary pointer is coarse. Pixel ratio caps at 1.25 instead of 1.75, multisampling is off, anisotropic filtering drops from 16x to 4x.

The interesting one is lights. Every standard material fragment loops over every punctual light in the scene, so light count is a direct multiplier on fragment cost, and the game has a headlamp, an express train and a muzzle flash before the pool is counted at all. Six pool lights means nine total; four means seven, which is about 22% less per-fragment light math for a difference nobody has ever noticed.

None of this is a quality slider. It is the same scene, costing less.

On top of that the pixel ratio adapts at runtime. The loop measures FPS over two-second windows: below 44 it drops the ratio in 0.25 steps to a floor of 0.7, above 58 it climbs back toward the base. A crowded wave drops resolution imperceptibly; the clear moment earns the pixels back.

The rest of the frame budget is spent the same way, by finding costs and removing them structurally rather than turning them down. The station's static geometry stops updating its matrices after boot. Seven benches, twelve meshes each, used to allocate 84 separate geometry buffers; they now share one buffer per distinct shape. Dust motes ran 480 trigonometry calls and a full vertex buffer upload every frame for drift you cannot see, so they now run every third frame at three times the step. Same motion, a third of the cost.

### Nothing loads, nothing leaves

The entire visual and audio world is generated at runtime. Twenty-three canvas texture generators paint the station at boot: tiles, ballast, the tactile paving strip along the platform edge, posters, the train skin, blood, bullet holes. The reverb is a generated impulse response, 2.4 seconds of decaying noise pushed through a convolver, which is why the station sounds like concrete. The ambient bed is a 59 Hz sawtooth with a 118.4 Hz sine over it, low-passed, under band-passed noise for air movement. Guns and zombies are built from boxes and cylinders. Nothing is fetched.

Nothing is sent, either. The whole player profile is one `localStorage` object under `ashworthSave`: `{ ngP, badges, best }`, plus a one-character difficulty preference. No server, no accounts, no analytics, no way for the game to know anything about the player that the player's own browser does not already know. A kid should be able to play a browser game without it being a data relationship. Clearing site data clears the profile, and every storage call is wrapped in a try/catch because Safari private mode throws on write.

The one thing that used to come off the network was Three.js itself. Not any more. The engine is vendored (`vendor/three.module.min.js` and `vendor/RoomEnvironment.js`, repointed in the import map) and a small service worker (`sw.js`) precaches the page and the engine on first visit. After that the game boots with no internet and an empty HTTP cache; Cache Storage is separate from, and far stickier than, the HTTP cache (Safari evicts it only after about seven days of never visiting). Registration is guarded, so a `file://` copy simply stays online-dependent. When the engine or the page changes, bump the `CACHE` string in `sw.js`; activation deletes the old cache, so a stale engine can never outlive its page.

### What it throws away

A single-file game that runs for an hour leaks visibly. Corpses, decals and pickups pile up and the frame rate sags, and there is no server to restart. So disposal is part of the simulation:

- Corpses fade at 2.6 seconds and are removed at 4.3, disposing their materials and shadow material.
- Blood and bullet holes share one 120-slot decal pool. Overflow drops the oldest and disposes its geometry, so an hour-long run costs what a five-minute one costs.
- Pickup halos dispose their material on collection. Clearing enemies between runs disposes everything.
- Because geometry is shared, a corpse only ever costs its materials, and those are freed.

### The wave director

Waves are a state machine: `intermission -> train -> spawning -> fighting -> intermission`. Wave 1 skips the train and spawns from the tunnels. Base size is `min(44, 5 + round(wave * 3.1))`, pacing tightens by 0.055 seconds a wave to a floor of 0.16, and the concurrent cap scales with the wave to `min(30, 12 + round(wave * 1.6))`, because a flat cap makes a late wave arrive as a queue instead of a crowd.

Where they come from turned out to matter more than how many. Every wave after the first used to come out of the train doors, and the train stops at mid-platform, so walking to either end bought a forty-meter firing lane with a wall behind you and the entire wave arriving on one bearing. About two spawns in five now come from the tunnel mouths and the stair alcoves, biased toward whichever end you are nearest. If you are backed into that end, the spawn moves to the platform lip beside you and comes up out of the track bed instead, which costs it a visible climb and never puts anything in your face: the closest a flanking spawn can appear is a little over seven meters. Enemies also peel off a shared bearing rather than queueing along it, so a pack fans out and comes round instead of forming a firing-range line.

The part worth stealing is that every spawn is a train door, a tunnel mouth, a stairwell or the lip of the platform, never a pop-in. Nothing steps out until the carriage has stopped and the doors are more than half open, and zombies leaving a train hold an explicit `exit` state that walks them clear of the doorway before they aggro. It buys nothing mechanically and costs them a few strides of not-attacking. It is also the entire reason a train reads as a threat instead of a spawn point with a paint job.

Beyond that, the code is the documentation. Every system sits behind a banner comment, and the comments explain why rather than what. `grep '/\* ='` gives you the table of contents.

---

## Tuning tables

All balance lives in data. Weapon definitions sit in one object, enemy stats in one table, wave recipes in the director. Changing the game means editing a number, not untangling a branch.

### Weapons

| | M9 Sidearm | MK9 SMG | 870 Pump |
|---|---|---|---|
| Fire | Semi-auto | Full-auto | Pump-action |
| Damage | 38 | 21 | 19 x 9 pellets |
| Rate | 330 rpm | 820 rpm | 78 rpm |
| Magazine | 15 | 32 | 6 |
| Reserve (max) | 120 (180) | 280 (400) | 48 (80) |
| Reload | 1.35 s | 1.85 s | 2.6 s |
| Hip spread | 0.006 | 0.019 | 0.075 |
| ADS spread | 0.0016 | 0.008 | 0.046 |
| Headshot mult | 2.9x | 2.2x | 1.7x per pellet |
| ADS field of view | 62 | 57 | 60 |

### Enemies (wave 1, HERO)

| | Walker | Runner | Crawler | Brute | Conductor |
|---|---|---|---|---|---|
| HP | 100 | 66 | 58 | 420 | 750 |
| Speed | 1.55 | 3.35 | 2.55 | 1.15 | 1.0 |
| Damage | 7 | 6 | 9 | 18 | 24 |
| Swing gap | 1.05 s | 0.85 s | 0.95 s | 1.35 s | 1.20 s |
| Windup | 0.24 s | 0.18 s | 0.18 s | 0.34 s | 0.34 s |
| Reach | 1.95 | 1.85 | 1.60 | 2.35 | 2.7 |
| Scale | 0.92 | 0.82 | 0.95 | 1.32 | 1.85 |
| Points | 100 | 150 | 180 | 400 | 1500 |
| Eyes | yellow-green | green | cyan | orange | red |
| First wave | 1 | 3 | 3 | 5 | 15 |

The conductor is the uniformed one, just over twice as tall as a walker, and it arrives only on the last train. The red eyes are the warning.

Damage per hit is lower here than it used to be, which reads backwards until you know why. Attacks used to miss a moving player almost entirely; once they started landing on schedule, the old numbers killed a full-health player in about two seconds. The difficulty moved from the size of the hit to the certainty of it.

### Scaling

Per wave, per NG+ level, per difficulty. These run at spawn:

```js
hp:    base * (1 + (wave - 1) * 0.11) * pow(1.30, ngP)  * (easy ? 0.8 : 1)
speed: base * (1 + min(0.55, (wave - 1) * 0.045)) * (1 + min(0.6, 0.12 * ngP))
dmg:   (base + (wave - 1) * 0.55) * (1 + 0.25 * ngP) * (easy ? 0.6 : 1)
```

Each zombie also rolls a speed jitter between 0.9x and 1.12x, so the same wave never moves the same way twice.

On the player's side of the ledger: regeneration starts 10 seconds after the last hit and runs at 4 HP/s, stopping at 70. On EASY that is 8 seconds, 6 HP/s and a ceiling of 85. Medkits restore 35 and drop only while you are below roughly 60.

---

## Running and hosting

The HTML file is the artifact. Serve it from any static host; there is nothing to build.

**GitHub Pages.** Push `index.html`, `og-image.png`, `sw.js` and `vendor/` to the repository root. In Settings, under Pages, set the source to "Deploy from a branch" and pick your default branch with the `/ (root)` folder. The game is then live at the bare repository URL, `https://<user>.github.io/<repo>/`, which is how this copy is hosted. Keep `og-image.png` beside it, and point the `og:image` meta tag at the absolute URL it will live at: Open Graph consumers do not resolve relative paths, so a relative one shows a grey card instead of the station.

**Anywhere else.** Copy all of it: `index.html`, `sw.js`, `vendor/`, `og-image.png`. There is nothing to build and nothing to fetch.

**Offline.** Handled by the service worker. The first visit precaches the page and the vendored engine; every reload after that, including ones with no internet and an empty HTTP cache, boots from Cache Storage. The import map points at the vendored files, so there is no third-party request at any point. When you change the page or the engine, bump the `CACHE` string in `sw.js`; activation deletes the old cache so a stale engine can never outlive its page.

---

## Contributing

The file is long but the seams are visible. Every system has a banner, every tuning number lives in a table or config object, and the comments explain why, not what.

Good first changes:

- **Balance passes.** Tweak a weapon in the weapon table, an enemy in the spawn config, or a wave recipe in the director. Report before and after.
- **A new enemy.** Add a config row, geometry if it needs a new shape, and a recipe line. The conductor is the template for "special"; the crawler is the template for a different *shape*, and it is the harder one, because anything that does not stand upright needs its own hit volumes, its own broad-phase bounds and its own aim-assist target, and every one of those fails quietly.
- **A new weapon.** Add a definition row and a builder. The three builders show the pattern.
- **Accessibility.** The difficulty chips, aim assist, and the TURN button exist because a child plays this game. Ideas in that spirit are welcome.
- **A sixth badge.** The badge table, the earn order, and the save format all support it.

Two hard rules. Pull requests that add a build step, a package manifest, a network dependency, or an external asset file will be closed; if a change needs an image or a sound, it needs to generate it instead. And every PR must be played before it is opened, on both EASY and HERO, and with both input modes, mouse and touch. Every bug in the table above was found by playing, not by reading. Yours will be too.

---

## License

MIT. See [LICENSE](LICENSE). This file is the game; take it, fork it, teach yourself something with it.

---

*Built as an exercise in how far one HTML file can go, and because a kid needed a game worth losing.*
