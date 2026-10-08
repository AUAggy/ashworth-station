# Ashworth Station

A single-file, browser-based zombie survival FPS. Hold the uptown platform at Ashworth Street while the northbound pulls in and the doors open onto more of them. Fifteen waves. The last one is the finale. Clear it to earn a badge and start New Game+. The record is your highest score, on a win or a loss.

![Ashworth Station](og-image.png)

<!-- TODO: replace the still with a 3-second GIF of the train arriving and the doors opening. -->

**Play it:** <https://auaggy.github.io/ashworth-station/>

**Run it yourself:** download the checkout, including `vendor/` and `sw.js`, and serve it over HTTP:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

It needs a web server rather than a double-click because the page is an ES module that imports three.js by bare specifier. Opened straight off disk as `file://`, the module fetch runs from a null origin and browsers disagree about whether to allow it. Any static host works: GitHub Pages, S3, a USB stick behind nginx, `python3 -m http.server`.

**The file:** `index.html` plus the engine it imports, vendored under `vendor/`, and a small service worker. Gameplay textures and audio are generated, with no runtime package dependencies, external fonts, build step, or application server. The engine is local; the service worker supports offline reload after a successful online visit on HTTPS or localhost. A first-ever offline visit cannot install the game. `og-image.png` is a social-preview asset, not a gameplay texture. Needs WebGL; if the browser can't give it a context, the title screen says so instead of failing silently.

The rest of this is how it got that way, and it is mostly a story about things that broke.

**Jump to:** [Fifteen things that broke](#fifteen-things-that-broke) · [Playing it](#playing-it) · [How it works](docs/HOW-IT-WORKS.md) · [Tuning tables](docs/TUNING.md) · [Hosting](#running-and-hosting) · [Contributing](#contributing)

---

## How this started

The other day I came across [youtuber Bijan's review](https://youtu.be/9Z9rPZavjUU?si=yE2PCZbYU2tk_4ar&t=1718) of a frontier model where he generated a Subway FPS game in one shot. I didn't have access to that model but thought it would be a good idea to try myself. It took a mixture of models, a good deal longer than one shot, and a fair amount of checking their work, but it eventually produced a working zombie FPS.

It was fun in the way a sketch is fun: the loop worked, the mood was right, and the code was a house of cards. Any real change risked collapsing it, and it would never survive a tablet.

So it was rewritten from scratch, with a kid on an iPad and a desktop browser with a mouse as the intended players. The history below records the bugs that shaped it. Current automated checks cover Chromium and touch emulation; actual iPad behavior, HERO balance, and sustained mobile thermal performance still need real-device play.

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
| Backing into an end wall was the safest place in the game | Every wave after the first spawned from the train doors at mid-platform, forty meters away | Spawn from tunnel mouths, level platform entrances and the track bed, with at least 7 m of horizontal clearance |

Read the list again and it sorts itself into three piles. Three rows are iOS specifically, a fourth is telling a touchscreen apart from a touch-first device, and three more are a GPU that cannot afford the work being asked of it. That is one constraint. The next four are a game that has to survive on its own with nobody to restart the server, because there is no server.

The last four rows are a different animal, and they took the longest to see. Nothing about them is a platform quirk or a performance ceiling. The code did exactly what it said, the frame rate was fine, and the game was still wrong: forgiving where it should have been dangerous, silent where it should have been legible, and holding one safe tile that a child found in two runs. Those do not show up in a profiler. They show up as somebody enjoying the game for the wrong reason.

So, derived rather than declared:

1. **The kid plays on an iPad.** Touch input, small screens, short attention, no patience for a game that stutters or a game that cheats.
2. **The game lives in one HTML file.** A link has to be enough. The engine and worker ship beside it; play needs no install, account or application telemetry.
3. **The game has to be able to beat you.** It is built to be lost, so anything that quietly makes losing optional (a swing that never lands, a crowd you can walk through, a corner with a wall behind it) is not generosity. It is the game failing at its only job.

Everything below is those three, followed to their conclusions.

---

## Playing it

Desktop: `WASD` move, `SHIFT` sprint, `SPACE` jump, mouse to aim, left click to fire, right click for sights, `R` reload, `1` `2` `3` weapons, `ESC` for a tactical pause. Menus use native buttons: `Tab` to focus, `Enter` or `Space` to activate, including RESUME and QUIT TO TITLE. Aiming uses pointer lock; where pointer lock is blocked, typically inside an iframe, the game falls back to steering by mouse position.

Touch: left thumb on an analog stick, right thumb drags to aim, weapon slots select a gun, and dedicated `RELOAD`, jump (`▲`), pause (`II`) and `TURN` controls. `TURN` is a 180-degree flip for when the horde gets behind you.

The fire button is also an aim zone: hold to shoot, drag to look, one thumb. That was a bug report from a nine-year-old before it was a feature. Kids grip the fire button and expect the same thumb to steer, and fighting that instinct loses.

Tactical pause is rationed: three presses per wave, three seconds each. A spent ration denies the pause and leaves combat running; the next wave restores all three. Touch and fallback mouse steering can resume automatically when the timer expires. Desktop play without pointer lock stays held until you explicitly resume.

OS interruptions, blur, hidden tabs, resize/orientation changes and externally lost pointer lock hold the run without spending another tactical pause. Held input is cleared and simulation time stops. Returning to the page does not restart combat: use RESUME or QUIT TO TITLE. A tactical pause's own lock release does not count as an interruption.

MUTE SOUND and REDUCED EFFECTS are local preferences available on the title, pause and held-run menus. Reduced effects defaults to the browser's reduced-motion preference unless you override it. It removes cosmetic bob, shake, roll, sway, grain, flicker and white victory/death flashes, and dims muzzle flash. Pitch/yaw aiming recoil, damage cues and weapon damage remain.

Waves escalate through 15, with regular HERO recipes capped at 44 and up to 30 enemies alive at once. The finale requests 36 enemies on HERO or 29 on EASY. Wave 1 comes out of the tunnel mouths. Most of every wave after that arrives as a train, which pulls in, opens its doors, and unloads, but not all of it. The rest comes through tunnel mouths, level platform entrances and the track bed, biased toward your nearest end. Every spawn has at least 7 m of horizontal clearance; a train door too close to you redirects to a safe flank. The stairs are closed decoration and the playable platform is level. Runners and crawlers join at wave 3, brutes at 5, and the last train brings a conductor. Two difficulty chips sit on the title screen: HERO uses full enemy health and damage; touch devices default to EASY, and the choice persists.

### Look down

Crawlers do not stand up. They drag along the platform at ankle height, which puts them under the crosshair at a level look: a shot aimed straight ahead passes over them at every range, no matter how close they are. You need about eleven degrees of down-angle at six meters and thirty at two. They have cold cyan eyes, the one colour nothing else on the platform uses, and their own dragging scrape in the mix, because stereo panning cannot say "low" and something has to send your eyes to the floor.

Everything that reaches you telegraphs. A zombie in range winds up for between 0.18 and 0.34 seconds before the damage lands, and the hit only registers if you are still there when it does. Brutes and conductors wind up longest and hit hardest. Backing out of a swing is a real option. Standing still is not, because they close inside their own reach now and push you where they want you, and when something hits you from behind an arrow tells you which way to turn.

Health does not fully come back. Out of contact it regenerates to 70 and stops, 85 on EASY. Past that you need a medkit, which drops from brutes and conductors and occasionally from anything else, but only while you are already hurt, and it drops on the reachable platform near the body. Ammunition works the same way: kills drop it, the between-wave restock is deliberately thin, and both of them mean the same thing, which is that holding one corner slowly starves you out of it.

### The record is the score

Wave 15 is a finite finale. BEST SCORE ranks runs by score, not survival time; time remains a run statistic. If you hold it, you earn a badge and the next run starts in New Game+, where the same 15 waves come back harder and your badge keeps paying. Five badges, earned in order, one per victory:

| Badge | Effect |
|---|---|
| BRAVE | +12% weapon damage |
| DEADEYE | +0.5 headshot multiplier |
| SPEEDLOADER | -20% reload time |
| SCAVENGER | More ammo drops and restock |
| SPRINTER | +10% move speed |

Losing on NG+ keeps the prestige counter and badges. Death and victory both record a new best only when its score is strictly higher. Existing valid profiles retain their format; progression, the five badge booleans and the best-run record are validated independently, so an invalid best does not erase valid progress. See [save normalization](docs/HOW-IT-WORKS.md#local-profile-and-preferences).

### Weapons

Three weapons, three jobs. The M9 sidearm is the skill weapon: the highest headshot multiplier in the game, the tightest sights, the smallest magazine, and one headshot kills a base walker with 10.2 damage to spare (38 x 2.9 = 110.2 against 100 HP). It is the gun the title screen means when it says "aim for the eyes." The MK9 SMG is the panic button at 820 rounds per minute, and it burns reserve ammo exactly as fast as it burns the horde. The 870 pump is the conversation ender, nine pellets at 19 damage each, with a 2.6-second reload that is an eternity when something is running at you.

All three bloom as you fire, which the crosshair shows, and dry-firing with reserve ammo starts an automatic reload, which is the game being polite about a mistake you are about to make again. Full numbers are in the [tuning tables](docs/TUNING.md#weapons).

---

## Running and hosting

The HTML, local vendor files and worker are the shipped artifact. Serve them from any static host; there is nothing to build.

**GitHub Pages.** Push `index.html`, `og-image.png`, `sw.js` and `vendor/` to the repository root. In Settings, under Pages, set the source to "Deploy from a branch" and pick your default branch with the `/ (root)` folder. The game is then live at the bare repository URL, `https://<user>.github.io/<repo>/`, which is how this copy is hosted. Keep `og-image.png` beside it, and point the `og:image` meta tag at the absolute URL it will live at: Open Graph consumers do not resolve relative paths, so a relative one shows a grey card instead of the station.

**Anywhere else.** Copy all of it: `index.html`, `sw.js`, `vendor/`, `og-image.png`. There is nothing to build and nothing to fetch.

**Offline.** Handled by the service worker. The first visit precaches the page and the vendored engine; every reload after that, including ones with no internet and an empty HTTP cache, boots from Cache Storage. The import map points at the vendored files, so there is no third-party request at any point. When you change the page or the engine, bump the `CACHE` string in `sw.js`; activation deletes old `ashworth-` caches while preserving unrelated origin caches. Browser eviction or cleared site data can remove the offline copy.

---

## Contributing

Bugs go in the [issue tracker](https://github.com/AUAggy/ashworth-station/issues).

The file is long but the seams are visible. Every system has a banner, every tuning number lives in a table or config object, and the comments explain why, not what.

Good first changes:

- **Balance passes.** Tweak a weapon in the weapon table, an enemy in the spawn config, or a wave recipe in the director. Report before and after.
- **A new enemy.** Add a config row, geometry if it needs a new shape, and a recipe line. The conductor is the template for "special"; the crawler is the template for a different *shape*, and it is the harder one, because anything that does not stand upright needs its own hit volumes, its own broad-phase bounds and its own aim-assist target, and every one of those fails quietly.
- **A new weapon.** Add a definition row and a builder. The three builders show the pattern.
- **Accessibility.** The difficulty chips, aim assist, and the TURN button exist because a child plays this game. Ideas in that spirit are welcome.
- **Badge changes.** There are five badge slots. Adding a sixth requires updating the table, validation, save compatibility, UI and tests together.

Development checks are separate from the shipped game and use externally installed Playwright. See [TESTING.md](docs/TESTING.md) for correctness checks, matched rendering captures and pending real-device checks. Vendored engine sources and hashes are in [VENDOR.md](docs/VENDOR.md).

Two hard rules. Pull requests that add a build step, a package manifest, a network dependency, or an external asset file will be closed; if a change needs an image or a sound, it needs to generate it instead. And every PR must be played before it is opened, on both EASY and HERO, and with both input modes, mouse and touch. Automated checks catch regressions, but they do not replace human play on the intended devices.

---

## License

MIT. See [LICENSE](LICENSE). This file is the game; take it, fork it, teach yourself something with it.

---

**Tip jar:** [Buy Me a Coffee](https://buymeacoffee.com/auaggy). No part of the game is gated behind it.

*Built as an exercise in how far one HTML file can go, and because a kid needed a game worth losing.*
