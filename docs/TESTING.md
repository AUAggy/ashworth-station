# Development checks

These checks do not change how Ashworth is hosted. There is no package manifest, build step, shipped test dependency, or production test hook. Run commands from the repository root. A failing assertion sets exit status 1; known baseline defects remain failures, not skips or expected-pass annotations.

## Current suite

The browser suite now has **131 cases** by default (132 with the optional `--capture` case); the historical 28- and 116-case runs below describe earlier checkpoints, not the current release status. `node tools/check.mjs` has seven standard-library checks. The supervisor has eight unit checks. Counts are not a claim that all checks have been run or passed against the current graphics changes.

## Run

```sh
# Node standard library only: syntax, local import map, mocked service worker.
node tools/check.mjs

# Install Playwright OUTSIDE the checkout. This is a development dependency.
QA_CACHE="$HOME/.cache/ashworth-qa"
npm install --prefix "$QA_CACHE" --no-save --package-lock=false playwright
export ASHWORTH_PLAYWRIGHT="$QA_CACHE/node_modules/playwright/index.mjs"

# Optional when the bundled Chromium browser is absent:
export ASHWORTH_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node tests/browser.mjs
```

Without `ASHWORTH_CHROME`, the runner tries bundled Chromium, then that Chrome path if the bundle is missing. On other operating systems, set `ASHWORTH_CHROME` to a locally installed Chromium-compatible executable, or install Playwright's browser externally. The portable module path is `$HOME/.cache/ashworth-qa/node_modules/playwright/index.mjs`. Do not add a package manifest, `node_modules`, browser binaries or a build step to this checkout.

A focused rerun is available, for example:

```sh
node tests/browser.mjs --only='GPU|recipes|movement'
node tests/browser.mjs --only='real SW'
node tests/browser.mjs --only='spawns|near train-door|elevated|end clamps|bullet end|dropped|broad-phase'
node tests/browser.mjs --only='safe lifecycle|suspend API|automatic resume|normal tactical|suspension'
node tests/browser.mjs --only='comfort'
python3 -m unittest discover -s tests -p test_supervisor.py
```

Do not run browser or GPU checks while `/tmp/ashworth-benchmark.lock` exists: another worker may own the graphics measurement window. Standard-library checks and supervisor unit tests do not need the GPU.

Each browser case gets a fresh context and seeded randomness. Simulation cases block service workers, intercept only the document response, and inject `window.__test` immediately before the **final** `requestAnimationFrame(frame);` call. A coordinator change that wraps initialization in `boot()` still permits injection within that function. The hook exposes the actual module functions and state; it does not reimplement the simulation. RAF callbacks are queued for controlled stepping. `__test.advance(seconds)` starts from the application's own `last` timestamp and runs the real frame at 50 ms steps through the real dt clamp. These clock probes suppress only `renderer.render()` during stepping; movement, damage, timers, input and all other frame logic remain actual application code. For read-only comparisons, `ASHWORTH_SOURCE=/absolute/path` selects the whole fixture root: intercepted HTML, served assets and raw service-worker pages. Provide `index.html`, `sw.js`, `vendor/` and the other shipped files in that root. This override does not edit the application. Lifecycle probes replace document visibility/focus/lock getters and dispatch browser events explicitly, so a headless runner's focus cannot accidentally make a test pass. Pointer-lock rejection returns a rejected `NotAllowedError` promise. These are synthetic event/state probes, not operating-system app-switch certification. No repository application file is modified.

The real-service-worker cases use an unmodified page with service workers enabled. Unrelated/old caches are seeded **before** game navigation, so activation cannot race their creation. The server binds only to `127.0.0.1` on a random port and closes after the run. Correctness checks use locators, state predicates, or explicit simulation steps, not arbitrary sleeps. Updated menu buttons are selected by role, with existing HUD/menu IDs or exact baseline text as fallbacks.

## Coverage and limits

- Normal renderer/title startup and uncaught boot errors.
- Difficulty selection and deploy/redeploy/resume without a free shot.
- Forced WebGL context failure: fallback text, no uncaught error, no scheduled game frame.
- Seeded touch menu title/action/statistic reachability at **844×390, 390×844, 1024×768, and 1280×720**, including pause and death menus. Scrollable menus are allowed.
- Actual player updates at 30/60/120 Hz for two seconds: walk, sprint, aiming, diagonal movement, and release-to-stop. Integrated travel must differ by less than **0.15 units**; velocity must fall below **0.01 units/s** after one second without input. Position is reset between updates to keep station collisions and bounds out of this timing check.
- Restart resets for held aim/fire, keys/touch, airborne state, recoil/look deltas, bob, shotgun pump position, weapon pumping/bloom/kick/flash/reload/cooldown; focus loss must clear aim/fire and leave active combat.
- Missing, malformed, old, valid, negative, incorrectly typed, and huge progress records, plus storage-disabled play. Invalid best records must not discard valid progression. Each save variant boots in a fresh context; disabled storage is installed before module boot. The WebGL probe drains the controlled RAF queue once to detect any mistakenly scheduled game loop.
- Rendered spawn/clear and natural corpse-removal loops for all five enemy types. Seven cycles check geometry/texture/program counts against the third cycle, allowing at most one additional resource after warm-up. Corpse tests mark enemies dead directly and exercise the actual expiry/disposal path; they are not a combat/balance test.
- Recipe length/queue/type agreement across EASY/HERO, NG+ 0/1/5/100, and early/late/final waves. The actual director/train/spawn code is advanced through all 15 waves, with scripted clears checking the live cap and victory transition. This does **not** prove human survivability or balance.
- Deliberate firing, keyboard weapon selection, timed reload, and ammo conservation; death/redeploy/title transitions. Weapon muzzle/ejection vectors remain exact; all five shotgun ribs fit the pump's local height/depth bounds.
- Primed offline **query-navigation** reload with the real worker; old Ashworth cache deletion and unrelated cache preservation. Standard-library worker checks additionally cover poisoned unrelated cache entries, exact asset allowlisting, cross-origin requests, and non-GET requests.

### Safety and comfort regressions

- **Spawn distance:** each of the five enemy types gets 64 seeded iterations at every combination of player x **−6/+6** and z **−39/0/+39**, separately through `spawnFlank()` and open-train `spawnOne()` (**3,840 placements** total). The train's actual position and state are both placed at the platform. Diagnostics record minimum horizontal distance per observed entrance; every placement must be at least **7 metres** away. Coverage must include track bed, upright alcove/platform entrances, and train doors where applicable. Five independent forced-centre-door cases ensure a near-player train placement redirects to a safe flank and consumes exactly one queue entry. Another **960 seeded flank placements** reject elevated/out-of-bounds spawns, even in late waves.
- **Geometry:** actual player collision updates must stay inside `Z_MIN+3..Z_MAX−3` after blocker or brute pushes; actual enemy updates must stay inside `Z_MIN+0.55..Z_MAX−0.55` after crowd/blocker steering. Centre and side lanes at both ends are probed. Actual world ray intersections, enemy ray intersections and `fire()` agree on end-wall occlusion, while actual player updates must not allow standing beyond those walls. Ammo and med drops from bed/platform/formerly elevated origins are checked at creation and after pickup updates; their halos must stay at platform height.
- **Hit volumes:** all five types, every head/body sphere, facing 0/90/180 degrees, ranges **3/8/20 metres**, and outer-head rays at 90% of the head radius. The analytic expected intersection distance is compared with the actual broad-phase/narrow-phase result. Rays approach perpendicular to facing so a crawler's other prone volumes cannot obscure the intended sphere.
- **Safe lifecycle:** 36 independent combinations of blur/pagehide/hidden/resize while playing/paused, plus lost lock during active play, ration **0/3**, and desktop/touch. Each must enter `suspended`, preserve the ration, and clear keys, fire, aim, look deltas, fallback mouse offsets and all held touch state. Four seconds of real synthetic frames must freeze HP, run/wave timers, train position and enemy positions/attack timers. Returning visible/focused and another four seconds must not restart combat. Separate cases check suspension's state guard and blocked automatic resume when hidden, unfocused or missing desktop lock. A tactical pause's **own** pointer-lock release must leave the timed pause intact; if the lock is still missing when its countdown expires, automatic resume must safely suspend.
- **Deliberate recovery:** independent mouse/touch/keyboard RESUME and QUIT TO TITLE actions from suspension. Desktop resume explicitly exercises pointer-lock rejection and fallback steering, without firing a round or changing a spent ration. Normal tactical pause remains separate: touch/fallback must hold before three seconds, auto-resume after three seconds and spend exactly one ration, even if `pause()` is called twice.
- **Comfort:** `prefs`/`ashworthPrefs`, default reduced motion, explicit overrides, malformed/incorrect types, accessible `MUTE SOUND` / `REDUCED EFFECTS` buttons and `aria-pressed`; menu/pause/suspension reachability; actual reload persistence; blocked storage at boot and on write. Native AudioContext construction and gain nodes are observed to check master-gain mute/unmute and single-context reuse. Reduced effects must remove cosmetic camera bob/shake/roll and weapon motion, reduce muzzle flash, disable grain/flicker/death and victory white flashes, retain enemy/directional damage cues and pitch/yaw aiming recoil, and preserve matched actual head/body damage, ammo and recoil calculations.

The earlier integration harness guarded missing planned APIs at injection with `typeof` and reported them as **PENDING parent feature/API** assertion failures. They do not break boot, skip cases, or count as passes. Every case fails on an uncaught `pageerror`, including errors delivered after a different assertion failed. The forced-WebGL case explicitly requires a handled fallback with **no** uncaught exception and **no** game frame.

The harness is intentionally small: no test framework or page-object layer. A failed assertion within one case can prevent later assertions in that case; a failure does not establish that every subcheck failed. Separate cases continue running.

## Matched graphics capture

Use the dedicated fixed-quality runner for graphics review:

```sh
# Wait until /tmp/ashworth-benchmark.lock is absent.
export ASHWORTH_PLAYWRIGHT="$HOME/.cache/ashworth-qa/node_modules/playwright/index.mjs"
ASHWORTH_CAPTURE_LABEL="$(git rev-parse --short HEAD)" node tests/render.mjs
# Compare with a prior external artifact directory:
ASHWORTH_COMPARE=/tmp/ashworth-render-before/render.json node tests/render.mjs
```

[tests/render.mjs](../tests/render.mjs) writes **24 screenshots**: pistol, SMG, shotgun, threats, train and crowd for each of four profiles (desktop 1280×720, phone landscape 844×390, phone portrait 390×844, tablet 1024×768). Each profile also benchmarks the same frozen seeded crowded scene at its base pixel ratio, with 20 warm-up frames and 120 raw pre-clamp RAF intervals. Adaptive resolution and enemy simulation cannot mask a slower graphics pass. `render.json` records the HTML SHA-256, browser version, startup time, quality/resource counts, texture dimensions, driver and median/p95 intervals. Comparison checks matched profiles and rendering budgets; timings remain headless Chromium evidence, not real-device GPU-time, balance or thermal certification.

Artifacts default to OS temporary storage; set `ASHWORTH_ARTIFACTS` only to an external directory. The older browser-runner capture remains available for historical comparisons:

```sh
# Artifacts default to a fresh directory under the operating system temp directory.
# If overriding, use an external directory, not a tracked checkout path.
ASHWORTH_CAPTURE_LABEL="$(git rev-parse --short HEAD)" \
  node tests/browser.mjs --capture

# Capture only, useful while baseline regression assertions still fail:
ASHWORTH_CAPTURE_LABEL="$(git rev-parse --short HEAD)" \
  node tests/browser.mjs --capture --only='capture seeded'
```

`--capture` writes `seeded-crowd.png` and `performance.json`: seed 1984, fixed 1280×720 camera, 30 scripted enemies, 180 **raw wall-clock RAF intervals before the simulation dt clamp**, draw calls, triangles, GPU resource counts, and program count. `ASHWORTH_ARTIFACTS` can choose an external output directory. No generated screenshot or log is committed. Use the same browser, viewport, seed, camera, and machine for a before/after comparison. These headless desktop numbers are not a mobile rendering budget or thermal result.

## Documentation-review verification

For the bounded documentation review on `improvement/current-docs`, after the allowed chamfer geometry and dead-binding cleanup:

```text
node tools/check.mjs                         7/7 passed
python3 -m unittest discover -s tests -p test_supervisor.py
                                            8 unit checks passed
node tests/browser.mjs --only='normal boot|GPU disposal|broad-phase'
                                            8/8 passed
```

The browser subset ran only after `/tmp/ashworth-benchmark.lock` was absent. Both clear and corpse-expiry resource paths plateaued across seven rendered cycles; all five enemy broad-phase cases passed. This review did not run the full 130-case suite or `tests/render.mjs`, and makes no new balance, actual iPad or thermal claim. Logs stay outside the checkout at `/tmp/ashworth-docs-check.log`, `/tmp/ashworth-docs-supervisor.log` and `/tmp/ashworth-docs-browser.log`.

## Unmodified baseline evidence

Baseline application/worker: `33cab4c` (application source reviewed at `c0fa96a`). Captured on this QA worktree before application or worker fixes, using Node **v25.2.1** and Google Chrome **152.0.7977.75**, headless, with externally cached Playwright.

```text
$ node tools/check.mjs
PASS syntax: executable scripts, worker, vendored modules
PASS import map: every application/vendor bare import resolves locally
PASS SW: precache assets and query navigation boot offline
FAIL SW: activation preserves unrelated origin caches
FAIL SW: only own cache serves assets and navigations
FAIL SW: arbitrary assets and asset queries do not grow cache
PASS SW: cross-origin and non-GET requests are untouched
4/7 passed; 3 failed (exit 1)

$ node tests/browser.mjs --capture
14/28 passed; 14 failed (exit 1)
```

Browser failures observed:

| Assertion | Baseline evidence |
|---|---|
| Menu gestures | Deploy/redeploy/resume each left 14 pistol rounds, expected 15. Ammo and cooldown reset before the resume probe. |
| WebGL failure | `this._renderer.compile is not a function` after the fallback appeared. |
| 844×390 menu | Title bounds: x 42.20, y **−74.77**, width 759.59, height 135.03. |
| Movement | Two-second walking travel: **5.5675 / 7.1235 / 7.8918** units at 30/60/120 Hz. |
| Restart | Held `aiming` survived `startGame()`. |
| Focus loss | Held `aiming` survived blur. |
| Negative progress | `ngP: -5` accepted. |
| Wrong save types | Best `score: "bad"` and `time: -1` accepted. |
| Invalid best / valid progress | `ngP: 3` retained, but invalid `best.score: null` retained too. |
| Huge save | Invalid best `score: -5` retained. Huge progression itself became 0 through bitwise conversion. |
| Clear resource disposal | Geometry counts **194, 199, 204, 209, 214, 219, 224** across seven rendered cycles. |
| Corpse resource disposal | Same geometry growth through the expiry path. |
| Recipe agreement | EASY, NG+ 1, wave 15: **31** recipe entries for a queue of **29**. |
| Real worker isolation | Deleted pre-existing `another-game-v9`. |

Baseline passes: normal boot; menu geometry at the other three sizes; missing/malformed/old/valid saves; storage-disabled play; scripted wave-15 victory/live cap; firing/weapon selection/reload; real offline query reload; death/redeploy/title transitions; capture output. Without `--capture`, totals are **13/27 passed, 14 failed**.

Standard-library SW failure details: activation removed an unrelated cache; a poisoned unrelated page response won over the game's page; `./og-image.png` was intercepted despite not being a pre-cache asset. The suite retains all three failing assertions.

Raw run logs were kept outside the checkout at `/tmp/ashworth-qa-check-baseline.log` and `/tmp/ashworth-qa-browser-baseline.log`. The matched baseline capture was kept in an OS temporary directory. Its 180 raw intervals had median **33.40 ms**, p95 **66.70 ms**, and maximum **83.40 ms**; the final frame reported **762 draw calls**, **37,856 triangles**, **228 geometries**, **34 textures**, and **20 programs**. Repeated baseline leaks and headless software/hardware scheduling affect those numbers; do not call them real-device performance evidence.

## Historical service-worker fix verification

After the separate `sw.js` change to **ashworth-v3**, with `index.html` still unmodified:

```text
$ node tools/check.mjs
7/7 passed; 0 failed (exit 0)

$ node tests/browser.mjs
14/27 passed; 13 failed (exit 1)
PASS real SW: primed offline query reload
PASS real SW: unrelated cache preservation
```

All five worker checks now pass: pre-cache/query navigation; old Ashworth cache deletion without deleting an unrelated cache; own-cache lookup despite poisoned unrelated entries; no interception/cache growth for arbitrary assets or query-variant assets; cross-origin/non-GET bypass. Both real-browser worker cases pass too. Cache lookup is through `caches.open(CACHE)`, cleanup is limited to `ashworth-` names, and only exact pre-cache URLs or navigations are handled. The unsupported seven-day Safari eviction claim has been removed.

At that checkpoint, the remaining **13 expected baseline failures** were menu gestures, forced WebGL failure, 844×390 menu clipping, movement timing, restart transients, focus-loss aim/suspension, four unsafe-save cases (negative, wrong types, invalid best with valid progress, huge progression with an invalid best), both GPU disposal paths, and recipe/queue agreement. They failed normally and blocked a green result at that checkpoint; this historical run predates the application fixes.

Post-fix logs remain local at `/tmp/ashworth-qa-check-v3.log` and `/tmp/ashworth-qa-browser-v3.log`. Protected application/plan/review files were not edited.

## Historical safety-regression interim evidence

Application source was at **782499a** in that worktree (the QA/SW foundation, before the parent's core safety/comfort integration). Node **v25.2.1**, Chrome **152.0.7977.75**, headless, externally cached Playwright. Only `tests/browser.mjs`, `tests/instrument.mjs` and this document changed. No performance capture ran alongside correctness checks.

```text
$ node tools/check.mjs
7/7 passed; 0 failed (exit 0)

$ node tests/browser.mjs
27/116 passed; 89 failed (exit 1)
```

This is intentionally **not release-green**. Of 88 new cases, eight pass: all five broad-phase hit-volume cases, platform-level med drops, and both normal timed tactical-pause cases. The other 80 new cases fail against pre-integration behavior: ten seeded distance checks, five forced near-door fallbacks, elevated spawning, three clamp/push checks, end-wall/player agreement, elevated-origin ammo drops, all 36 safe-lifecycle cases, suspension API, three automatic-resume guards, tactical-pause lock-release/countdown safety, six explicit suspension UI actions, and twelve comfort cases. Missing suspension/comfort APIs are labelled pending failures. The nine existing failures are forced-WebGL fallback, movement timing, restart transients, focus-loss suspension, four unsafe-save variants and recipe/queue agreement.

Selected deterministic reproductions:

| Probe | Interim actual calculation |
|---|---|
| Walker flank, x −6 / z −39 | Seeded minimum **2.108 m**, below 7 m. One bed placement was `[−7.5201, −1.25, −40.5]`, just **2.136 m** away. Clamping the randomly chosen outward z to the station end collapsed the intended spacing. |
| Walker train doors, player x −6 / z 0 | Actual platform-positioned train produced a door minimum of **1.191 m**; near-door points remained `state: exit`. Forced-centre-door checks fail for all five types. |
| Removed-route probe | Late-wave walker spawned at y **2.85**, z **−45.1191**. Elevated spawns remain reachable in baseline logic. |
| Player north push, x 0 | Blocker push ended at z **−40.18**; brute push at **−39.8864**. Required minimum is **−39**. |
| Enemy north push, x 0 | Walker ended at z **−43.5498**, y **0.9888** instead of staying at/above **−41.45** at platform level. |
| Formerly elevated ammo origin | Initial pickup y **3.01**, halo y **2.88**; the first pickup update snaps the mesh back down but leaves the halo elevated. Med drops already remain at platform level. |
| Blur while playing, ration 0 | Remained `playing`; aim/look/fallback offsets survived. After exactly four synthetic seconds, HP **100 → 83.65**, run timer **0 → 4.0**. Returning focus still left combat active. |
| Blur while tactically paused | Remained `paused` immediately, then auto-resumed unseen; run timer advanced **0 → 1.0** during the four-second probe. Safe suspension must not inherit the timed tactical-pause countdown. |

Full logs remain outside the checkout at `/tmp/ashworth-safety-regressions.log`; focused reproduction logs are `/tmp/ashworth-safety-geometry.log` and `/tmp/ashworth-safety-focused.log`. Earlier logs preserve earlier probe versions; the full log and figures above describe the final checks. A failing first assertion does not mean every later assertion in that case independently failed. Re-run the same commands after the parent integrates fixes; do not relabel pending failures as passes.

### Coordinator safety comparison

After reading `/tmp/ashworth-core-note.md`, the final safety checks were also run against the **read-only current parent HTML**, without changing `index.html` or `tests/helpers.mjs` in this worktree:

```sh
ASHWORTH_SOURCE=/absolute/path/to/coordinator-checkout \
  node tests/browser.mjs --only='^(safe (flank|door|lifecycle)|near train-door|no elevated|player end|enemy end|bullet end|dropped|broad-phase|suspend API|automatic resume|tactical pause|normal tactical|suspension)'
# 75/76 passed; 1 failed (exit 1)
```

All deterministic spawn, bounds, ray-hit, lifecycle, freezing, blocked-auto-resume and explicit recovery cases pass against that parent checkpoint. The one remaining interim failure is elevated-origin `dropAmmo()` positioning: it still creates the mesh at y **3.01** and its halo at **2.88** for input y **2.85**. The elevated route itself is removed and the no-elevated-spawn check passes, so this is a helper invariant failure, **not evidence that current enemies still spawn upstairs**. Comfort was not included in this comparison; the checkpoint note says those features are still being implemented. Do not attribute stale-worktree failures to the parent's fixed source.

An initial comparison exposed an over-strict harness assertion: edge-lane enemy steering can legitimately descend toward the track bed. The final geometry check allows `BED..0` there and requires exactly platform level in the centre lane. The harness also distinguishes externally lost lock during play from the intentional lock release inside tactical pause. The latter has its own independent countdown-to-safe-suspension case. Comparison log: `/tmp/ashworth-safety-parent.log`.

## Bounded supervisor

The optional development supervisor is [tools/supervise.py](../tools/supervise.py), not part of the hosted game. Its eight unit checks cover settled/error results, retries, event parsing, pending work and ledger/session inspection. Defaults bound it to 12 hours and 24 continuation attempts with a 900-second interval; it refuses intervals below 300 seconds and a second owner of the same checkout.

Status, locks and batch logs live under the checkout's Git metadata directory, `ashworth-run` (normally `.git/ashworth-run`; linked worktrees use their resolved Git directory). To stop at the next supervisor poll:

```sh
GIT_DIR="$(git rev-parse --absolute-git-dir)"
touch "$GIT_DIR/ashworth-run/STOP"
```

STOP does not terminate an already-running batch immediately. Inspect local status/logs before restarting and remove STOP only when deliberately starting a new bounded run. Keep session transcripts and credentials out of public docs, artifacts and commits.

## Release checklist

- [ ] Run `node tools/check.mjs` and `node tests/browser.mjs`; resolve every failure before release.
- [ ] Bump the SW `CACHE` whenever shipped HTML or engine assets change; verify the worker keeps unrelated origin caches intact.
- [ ] Capture matched before/after scenes and inspect threat/weapon readability, resource counts, draw calls, startup, and raw frame intervals.
- [ ] Manually test pointer-lock rejection, app switching, hidden-tab/focus loss, orientation changes, death/redeploy, and quit-to-title with working controls.
- [ ] On an **actual iPad/iPhone Safari**, test audio unlock/mute, touch controls, menu reachability, orientation, and offline reload after installation.
- [ ] Run a sustained real-device session for frame times, thermal behavior, and battery use.
- [ ] Human play on EASY/HERO with mouse/touch; approve balance and visual changes.

Actual iPad/iPhone, Safari audio behavior, sustained mobile performance, and human visual/balance acceptance remain **pending**. Chromium touch emulation does not satisfy those items. Cache Storage can be evicted by the browser or cleared by the user; a primed offline pass does not promise indefinite retention or a first-ever offline visit.
