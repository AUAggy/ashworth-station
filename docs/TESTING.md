# Development checks

These checks do not change how Ashworth is hosted. There is no package manifest, build step, shipped test dependency, or production test hook. Run commands from the repository root. A failing assertion sets exit status 1; known baseline defects remain failures, not skips or expected-pass annotations.

## Run

```sh
# Node standard library only: syntax, local import map, mocked service worker.
node tools/check.mjs

# Install Playwright OUTSIDE the checkout. This is a development dependency.
QA_CACHE="$HOME/Library/Caches/ashworth-qa"
npm install --prefix "$QA_CACHE" --no-save --package-lock=false playwright
export ASHWORTH_PLAYWRIGHT="$QA_CACHE/node_modules/playwright/index.mjs"

# Optional when the bundled Chromium browser is absent:
export ASHWORTH_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node tests/browser.mjs
```

Without `ASHWORTH_CHROME`, the runner tries bundled Chromium, then that Chrome path if the bundle is missing. On other operating systems, set `ASHWORTH_CHROME` to a locally installed Chromium-compatible executable, or install Playwright's browser externally. This workstation also has Playwright at `/Users/aggy/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs`; point `ASHWORTH_PLAYWRIGHT` there to reuse it.

A focused rerun is available, for example:

```sh
node tests/browser.mjs --only='GPU|recipes|movement'
node tests/browser.mjs --only='real SW'
```

Each browser case gets a fresh context and seeded randomness. Simulation cases block service workers, intercept only the document response, and inject `window.__test` immediately before the **final** `requestAnimationFrame(frame);` call. A coordinator change that wraps initialization in `boot()` still permits injection within that function. The hook exposes the actual module functions and state; it does not reimplement the simulation. RAF callbacks are queued for controlled stepping. No repository application file is modified.

The real-service-worker cases use an unmodified page with service workers enabled. Unrelated/old caches are seeded **before** game navigation, so activation cannot race their creation. The server binds only to `127.0.0.1` on a random port and closes after the run. Correctness checks use locators, state predicates, or explicit simulation steps, not arbitrary sleeps. Updated menu buttons are selected by role, with existing HUD/menu IDs or exact baseline text as fallbacks.

## Coverage and limits

- Normal renderer/title startup and uncaught boot errors.
- Difficulty selection and deploy/redeploy/resume without a free shot.
- Forced WebGL context failure: fallback text, no uncaught error, no scheduled game frame.
- Seeded touch menu title/action/statistic reachability at **844×390, 390×844, 1024×768, and 1280×720**, including pause and death menus. Scrollable menus are allowed.
- Actual player updates at 30/60/120 Hz for two seconds: walk, sprint, aiming, diagonal movement, and release-to-stop. Integrated travel must differ by less than **0.15 units**; velocity must fall below **0.01 units/s** after one second without input. Position is reset between updates to keep station collisions and bounds out of this timing check.
- Restart resets for held aim/fire, keys/touch, airborne state, recoil/look deltas, bob, shotgun pump position, weapon pumping/bloom/kick/flash/reload/cooldown; focus loss must clear aim/fire and leave active combat.
- Missing, malformed, old, valid, negative, incorrectly typed, and huge progress records, plus storage-disabled play. Invalid best records must not discard valid progression. Each save variant boots in a fresh context.
- Rendered spawn/clear and natural corpse-removal loops for all five enemy types. Seven cycles check geometry/texture/program counts against the third cycle, allowing at most one additional resource after warm-up. Corpse tests mark enemies dead directly and exercise the actual expiry/disposal path; they are not a combat/balance test.
- Recipe length/queue/type agreement across EASY/HERO, NG+ 0/1/5/100, and early/late/final waves. The actual director/train/spawn code is advanced through all 15 waves, with scripted clears checking the live cap and victory transition. This does **not** prove human survivability or balance.
- Deliberate firing, keyboard weapon selection, timed reload, and ammo conservation; death/redeploy/title transitions.
- Primed offline **query-navigation** reload with the real worker; old Ashworth cache deletion and unrelated cache preservation. Standard-library worker checks additionally cover poisoned unrelated cache entries, exact asset allowlisting, cross-origin requests, and non-GET requests.

The harness is intentionally small: no test framework or page-object layer. A failed assertion within one case can prevent later assertions in that case; a failure does not establish that every subcheck failed. Separate cases continue running.

## Matched graphics capture

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

Raw run logs remain local at `/tmp/ashworth-qa-check-baseline.log` and `/tmp/ashworth-qa-browser-baseline.log`. The matched baseline capture is local at `/var/folders/0_/3lt66k5n3_sbpl4bqjf_0k380000gn/T/ashworth-capture-1791471055119/`. Its 180 raw intervals had median **33.40 ms**, p95 **66.70 ms**, and maximum **83.40 ms**; the final frame reported **762 draw calls**, **37,856 triangles**, **228 geometries**, **34 textures**, and **20 programs**. Repeated baseline leaks and headless software/hardware scheduling affect those numbers; do not call them real-device performance evidence.

## Release checklist

- [ ] Run `node tools/check.mjs` and `node tests/browser.mjs`; resolve every failure before release.
- [ ] Bump the SW `CACHE` whenever shipped HTML or engine assets change; verify the worker keeps unrelated origin caches intact.
- [ ] Capture matched before/after scenes and inspect threat/weapon readability, resource counts, draw calls, startup, and raw frame intervals.
- [ ] Manually test pointer-lock rejection, app switching, hidden-tab/focus loss, orientation changes, death/redeploy, and quit-to-title with working controls.
- [ ] On an **actual iPad/iPhone Safari**, test audio unlock/mute, touch controls, menu reachability, orientation, and offline reload after installation.
- [ ] Run a sustained real-device session for frame times, thermal behavior, and battery use.
- [ ] Human play on EASY/HERO with mouse/touch; approve balance and visual changes.

Actual iPad/iPhone, Safari audio behavior, sustained mobile performance, and human visual/balance acceptance remain **pending**. Chromium touch emulation does not satisfy those items. Cache Storage can be evicted by the browser or cleared by the user; a primed offline pass does not promise indefinite retention or a first-ever offline visit.
