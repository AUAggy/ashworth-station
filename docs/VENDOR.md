# Vendored engine provenance

The shipped import map in [index.html](../index.html) maps `three` to [vendor/three.module.min.js](../vendor/three.module.min.js) and the RoomEnvironment addon to [vendor/RoomEnvironment.js](../vendor/RoomEnvironment.js). RoomEnvironment imports `three` through that same map, so it uses the same local engine. No CDN or runtime package installation is needed.

## Source and license

Three.js is MIT licensed. The local engine header names the Three.js Authors, copyright 2010–2024, and `SPDX-License-Identifier: MIT`; its exported `REVISION` is `170`.

Pinned official sources:

- [Three r170 engine](https://github.com/mrdoob/three.js/blob/r170/build/three.module.min.js)
- [Three r170 RoomEnvironment](https://github.com/mrdoob/three.js/blob/r170/examples/jsm/environments/RoomEnvironment.js)
- [Three r170 MIT license](https://github.com/mrdoob/three.js/blob/r170/LICENSE)

RoomEnvironment's header credits Google's model-viewer `EnvironmentScene.ts` as its design source. Its vendored implementation comes from the Three r170 addon, not a separate model-viewer runtime.

Both files were fetched from the official repository's `r170` tag into an operating-system temporary directory for this review. `cmp` of the engine and `diff` of RoomEnvironment found no differences. No local modifications to either vendored file were found, and neither was changed by this review.

## SHA-256

| Local file | SHA-256 (also matches the fetched r170 source) |
|---|---|
| `vendor/three.module.min.js` | `08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7` |
| `vendor/RoomEnvironment.js` | `85869bdd22f7cf0b22e68dcefe6cb710480af0f5c901a76f7a7764fd07fc8014` |

Hashes identify these bytes; they do not establish security. This provenance comparison is not a vulnerability audit. Vendoring avoids a third-party runtime request but leaves engine update review with the project. Keep both imports local and on the same reviewed release, preserve upstream licensing, and recheck hashes and the service-worker cache version when updating shipped files.
