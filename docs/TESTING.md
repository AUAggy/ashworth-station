# Development checks

Run from the repository root. These tools are for development; the game needs no installation or build step.

```sh
node tools/check.mjs
```

For browser checks, install Playwright outside the checkout:

```sh
QA_CACHE="$HOME/.cache/ashworth-qa"
npm install --prefix "$QA_CACHE" --no-save --package-lock=false playwright
"$QA_CACHE/node_modules/.bin/playwright" install chromium
export ASHWORTH_PLAYWRIGHT="$QA_CACHE/node_modules/playwright/index.mjs"
node tests/browser.mjs
```

Optional desktop WebKit checks:

```sh
"$QA_CACHE/node_modules/.bin/playwright" install webkit
ASHWORTH_BROWSER=webkit node tests/browser.mjs
```

Set `ASHWORTH_CHROME` to a Chrome/Chromium executable to use an existing browser; WebKit ignores this setting. Rerun selected cases with `node tests/browser.mjs --only='movement|spawns'`.

For graphics changes, set `ASHWORTH_CHROME` and run `node tests/render.mjs` (Chromium only). It captures matched scenes at fixed quality and writes screenshots and measurements to a temporary directory. Headless timings do not establish real-device performance.

Do not run browser or rendering checks while `/tmp/ashworth-benchmark.lock` exists; another worker may be measuring graphics.

Before release:

- Resolve failures in the checks above.
- After changing `index.html` or the vendored engine, bump `CACHE` in `sw.js`.
- Play EASY and HERO with mouse and touch. Check app switching, orientation, audio, restart and offline reload after an online visit.
- Test on actual phones and tablets, including iPad/iPhone Safari and a sustained play session. Desktop touch emulation cannot verify Safari device behavior, heat or battery use.
