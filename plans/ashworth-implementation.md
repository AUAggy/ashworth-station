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
| 8 | Safe interruption suspension | automated verified | `dc9c47d`, `6c5df2c`; blur/hidden/pagehide/resize/lock loss across mouse/touch, playing/paused, zero/full rations freeze simulation; touch/fallback tactical pause resumes at 3s; missing desktop lock safely holds; explicit mouse/touch/keyboard resume/quit pass |
| 9 | Regression/release checks | in progress | `9167862`: syntax/import map, cache isolation, deterministic browser/simulation/resource checks; baseline 14/28 browser checks passed, 14 confirmed failures; 4/7 static/SW passed |
| 10 | Existing lighting/exposure/fog | desktop verified; device pending | Modest exposure/fog/environment/hemisphere rebalance and darker ceiling tint. 24 matched views/four profiles retain lights, shader programs, texture dimensions, PR, MSAA, anisotropy, draw calls and triangles. Headless frame-time evidence saved; subjective and sustained device acceptance pending |
| 11 | Close playable stairwell | automated verified | Both gates closed; removed upper flight, height field, elevated spawns and special bounds. Player/enemy clamps, bullet-wall occlusion and all type hit volumes pass. Ammo/med drops now both start on the platform (obsolete elevated ammo/halo origin removed); human assessment pending |
| 12 | Native menu buttons/touch instructions | automated verified | `06d0398`; keyboard-native actions, aria-pressed difficulty, focus styling/restoration, explicit pause quit; worker keyboard/touch checks |
| 13 | Transient-state resets | automated verified | Full restart clears input, velocity/jump, recoil, bob, weapon pump/bloom/kick/flash/raise, pooled effects and decals; explicit baseline camera/weapon pose; accumulated 42/42 checks pass |
| 14 | Save normalization | automated verified | `7f4094f`; valid profiles preserved, five strict boolean badges, safe/finite fields, invalid best independent of valid progression; 20 malformed/boundary/reload cases plus storage-disabled play pass |
| 15 | Reflective material tuning | desktop verified; device pending | Existing uniform parameters separate metal, matte polymer/wood, painted train panels, glass and wet patches. 24 captures retain all resource/draw/quality budgets; focused boot/ballistic/cleanup checks 4/4 pass. Tablet median +20% in this variable headless pass requires matched repeat, not a performance claim |
| 16 | Mute and reduced effects | automated verified | Local strict-boolean preferences; OS reduced-motion default with explicit override; native controls on title/pause/suspension; master gain mute and single-context unmute; cosmetic bob/shake/roll/sway/flash/flicker/grain reduced while pitch/yaw aiming recoil and damage cues remain. All preference/ballistic checks pass; real iOS/audio pending |
| 17 | Procedural surface detail | desktop verified; device pending | Quieter concrete with directional wear, darker grout and periodic brushed steel; dimensions/resources and RNG call order preserved. Worker seed-1984 checks and matched snapshots pass; coordinator static 7/7 and focused resource/hit/pickup 9/9 pass. Adds only 128 canvas strokes at startup |
| 18 | Contact/seam shading | desktop verified; device pending | Existing contact gradient gets a tighter dark core and bench opacity .30→.34; no extra decals/quads, enlarged shadows or shader features. Corpse fading and below-platform suppression untouched; same focused checks pass |
| 19 | Documentation and proven dead code | in progress | `7559561` fixes regression-discovered finale roster budget while preserving bosses; exact recipes and EASY/HERO/NG+ scripted 15-wave runs pass; docs/vendor provenance still pending |
| 20 | Selective silhouette/pose refinement | desktop verified; device pending | Narrower shared torso/legs/hands, restrained type-specific upright stride/arm poses, tidier pistol serrations and SMG magazine; shotgun ribs corrected from double-offset world placement to pump-local coordinates. No added nodes/materials/triangles; head geometry, hit volumes and attachment vectors unchanged. Focused hit/ballistic/attachment/cleanup 9/9 pass; 24 matched budget captures pass. Subjective approval pending |

## Autonomous continuation

`tools/supervise.py` is a development-only bounded supervisor. It must never run a second writer while this Herdr coordinator is working. When the existing Pi pane becomes idle after a temporary provider limit, it may send a continuation prompt to that pane. If the pane has exited, it can start a separate persistent CLI session using this plan as the source of truth. Resume from the next unfinished task after examining Git status and the latest tests. Never infer success solely from a process exit code or an assistant's completion claim.

Bounds: 12 hours from supervisor start, at most 24 continuation attempts, at least five minutes between continuation attempts, and an explicit STOP file in the run-state directory. Authentication failures, permanent billing errors, repeated identical failures, or a task requiring a new product decision must stop with a recorded blocker. Use already configured credentials/model first; no new subscriptions or credential changes. Provider usage limits cannot be bypassed by more workers. Run logs and session files remain local and untracked.

## Current checkpoint

- Worker QA baseline reproduced input, WebGL, layout, movement, reset, malformed save, disposal, and cache defects; also exposed EASY NG+ finale recipe/queue mismatch (31 entries, 29 spawns). Fix the recipe budget without dropping the conductor.
- `7894b1e`: bounded supervisor and seven unit checks; running under caffeinate, 12-hour deadline, 15-minute retry cadence, at most 24 continuations. STOP file: `.git/ashworth-run/STOP`. Status/logs in `.git/ashworth-run/` (never tracked).
- GitHub Pages is configured to deploy the root of `main`; GitHub authentication is available.
- Core completed: 130/130 accumulated browser checks and 7/7 syntax/import/cache checks pass at `ee07718`; 8/8 supervisor unit checks pass. No deployment yet.
- Rendering baseline: `/tmp/ashworth-render-before/` (core HTML `ee07718`, actual HTML hash in render.json), four fixed-quality profiles and 24 scenes. Native ANGLE/Metal on Apple M1 Max, headless Chromium 152; viewport emulation is not phone/tablet GPU or thermal certification. Lighting comparison in `/tmp/ashworth-render-lighting/` retains every measured resource/draw/quality budget.
- Provider Subscription Sharing allowance was exhausted. Supervisor performed 11 bounded 15-minute retries and resumed this saved session after access returned. Temporarily paused to add pending-request deduplication; preserve its original deadline/remaining attempt budget when restarting.
- Next: reflective materials and selective silhouettes; integrate procedural/contact and documentation workers; serial rendering comparison and full release checks, then publish.

## Required final assessment

- Actual iPad/iPhone Safari audio unlocking, mute, touch controls, and orientation handling.
- Sustained mobile/tablet frame times, thermal behavior, and battery use.
- Human play on EASY/HERO with mouse/touch and subjective visual/balance approval.

Do not mark these checks passed using desktop Chromium emulation.
