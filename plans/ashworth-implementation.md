# Ashworth Station implementation

Source: `docs/REVIEW-2026-10-08.md`, review IDs 1–20. Base: `c0fa96a`. Branch: `improvement/ashworth-review-20`.

Run status: active

## Authority and constraints

The user authorized implementation of all 20 recommendations, up to two worker agents in isolated worktrees, local commits, pushing, deployment, and necessary provider costs. Preserve the deliverable: static HTML application, vendored Three.js, generated art/audio, local progress, no runtime network dependency, accounts, telemetry, build step, or package manifest. Development-only test dependencies must live outside the repository. Do not publish credentials or session transcripts.

Approved decisions: close the playable stairwell and elevated spawn route; preserve timed tactical pauses but suspend safely for OS/input interruptions; preserve best-score behavior. Keep existing profiles compatible. No speculative feature work or broad module rewrite. Retain the graphics light count, texture sizes, draw-call budget, and rendering passes. Real iOS/audio, mobile thermal performance, balance, and subjective visual approval remain pending until actually assessed.

## Execution

1. Record baseline and create development-only syntax, browser, simulation, offline, and resource checks. Existing bugs should fail their regression checks; report known baseline failures rather than suppress them.
2. Integrate worker QA/service-worker and UI changes. Coordinator alone integrates commits and updates this ledger.
3. Fix resource ownership, remove playable elevation, normalize saves, correct movement, and reset transient state. Add/re-run focused checks with each coherent commit.
4. Fix menu shooting, safe interruptions, and sound/reduced-effects preferences after UI integration.
5. Capture seeded matched scenes and performance baseline. Change lighting/materials, textures/contact shading, and silhouettes in reversible passes. Preserve gameplay hit volumes and muzzle/ejection coordinates.
6. Run accumulated checks and soak scenarios; correct documentation. Push the tested branch. Deploy to the existing GitHub Pages `main` source only after automated checks pass and record the deployed commit/build result. Device/subjective checks remain explicitly pending.

Commit one coherent tested change at a time, grouping only tightly coupled changes. Include the service-worker cache version bump with changes to shipped HTML/engine. Keep test failures and unfinished work visible. On interruption inspect Git state before continuing; never reset or discard unknown changes.

## Progress ledger

Statuses: pending, in progress, automated verified, blocked. Graphics can be implemented/desktop checked while real-device and subjective acceptance remain pending.

| ID | Task | Status | Evidence / commit |
|---:|---|---|---|
| 1 | Consume menu gestures | automated verified | Menu click semantics plus canvas-only mouse shooting; dual-button releases independent; deploy/redeploy/resume retain 15 rounds |
| 2 | Scope service-worker cache ownership | automated verified | `d1fc1e9`; 7/7 syntax/import/cache checks and real primed-offline/unrelated-cache checks pass |
| 3 | Enemy jaw resource ownership | automated verified | Shared jaw geometry; owned material disposed by both cleanup paths; 8 rendered cycles/path plateau at 190 geometries, 34 textures, 20 programs |
| 4 | Short-screen menu layout | automated verified | `06d0398`; scrollable safe-area overlay, compact landscape, 2x2 end stats; four regression viewports and worker swipe evidence |
| 5 | Spawn safety | automated verified | Stair route removed; near-end track offset reverses instead of clamping onto player; train doors reject near-player positions. 2,700 seeded entrance/type samples minimum 7.121 m (7 m contract) |
| 6 | Clean WebGL failure | automated verified | Boot returns immediately after fallback panel; renderer failure has no uncaught exception, input setup, or RAF |
| 7 | Frame-independent movement | automated verified | Exponential approach to configured 4.5 m/s target; walking 2s travel 8.681/8.647/8.629 at 30/60/120 Hz (<0.7% spread); sprint/aim/diagonal/stopping also pass. Actual speed is now the documented target, rather than legacy 60Hz 3.675 m/s; human balance pending |
| 8 | Safe interruption suspension | pending | Preserve tactical ration |
| 9 | Regression/release checks | in progress | `9167862`: syntax/import map, cache isolation, deterministic browser/simulation/resource checks; baseline 14/28 browser checks passed, 14 confirmed failures; 4/7 static/SW passed |
| 10 | Existing lighting/exposure/fog | pending | Matched views and frame times |
| 11 | Close playable stairwell | automated verified | Both gates closed; removed upper flight, height field, elevated spawns and special-case bounds. Player ±39 / enemy ±41.45 m clamps; north bullet gate distance 2.90 m; director/resources smoke pass; human assessment pending |
| 12 | Native menu buttons/touch instructions | automated verified | `06d0398`; keyboard-native actions, aria-pressed difficulty, focus styling/restoration, explicit pause quit; worker keyboard/touch checks |
| 13 | Transient-state resets | pending | |
| 14 | Save normalization | pending | Preserve best-score format |
| 15 | Reflective material tuning | pending | No new shader features |
| 16 | Mute and reduced effects | pending | Local preferences |
| 17 | Procedural surface detail | pending | Same texture dimensions |
| 18 | Contact/seam shading | pending | Existing resources only |
| 19 | Documentation and proven dead code | pending | Include vendor provenance |
| 20 | Selective silhouette/pose refinement | pending | Hit/muzzle bounds preserved |

## Autonomous continuation

`tools/supervise.py` is a development-only bounded supervisor. It must never run a second writer while this Herdr coordinator is working. When the existing Pi pane becomes idle after a temporary provider limit, it may send a continuation prompt to that pane. If the pane has exited, it can start a separate persistent CLI session using this plan as the source of truth. Resume from the next unfinished task after examining Git status and the latest tests. Never infer success solely from a process exit code or an assistant's completion claim.

Bounds: 12 hours from supervisor start, at most 24 continuation attempts, at least five minutes between continuation attempts, and an explicit STOP file in the run-state directory. Authentication failures, permanent billing errors, repeated identical failures, or a task requiring a new product decision must stop with a recorded blocker. Use already configured credentials/model first; no new subscriptions or credential changes. Provider usage limits cannot be bypassed by more workers. Run logs and session files remain local and untracked.

## Current checkpoint

- Worker QA baseline reproduced input, WebGL, layout, movement, reset, malformed save, disposal, and cache defects; also exposed EASY NG+ finale recipe/queue mismatch (31 entries, 29 spawns). Fix the recipe budget without dropping the conductor.
- `7894b1e`: bounded supervisor and seven unit checks; running under caffeinate, 12-hour deadline, 15-minute retry cadence, at most 24 continuations. STOP file: `.git/ashworth-run/STOP`. Status/logs in `.git/ashworth-run/` (never tracked).
- GitHub Pages is configured to deploy the root of `main`; GitHub authentication is available.
- Next: test foundation and supervised continuation setup; launch isolated workers.

## Required final assessment

- Actual iPad/iPhone Safari audio unlocking, mute, touch controls, and orientation handling.
- Sustained mobile/tablet frame times, thermal behavior, and battery use.
- Human play on EASY/HERO with mouse/touch and subjective visual/balance approval.

Do not mark these checks passed using desktop Chromium emulation.
