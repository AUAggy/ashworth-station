#!/usr/bin/env node
// Development only: no package install, build, or production hooks.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { root, runCases } from '../tests/helpers.mjs';
import { serviceWorkerCases } from '../tests/sw.mjs';

const html = await readFile(join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
await runCases([
  ['syntax: executable scripts, worker, vendored modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ashworth-syntax-'));
    try {
      const sources = scripts.filter(s => !s[1].includes('importmap')).map(s => s[2]);
      for (const path of ['sw.js', 'vendor/three.module.min.js', 'vendor/RoomEnvironment.js']) sources.push(await readFile(join(root, path), 'utf8'));
      for (const [i, source] of sources.entries()) {
        const path = join(dir, `${i}.mjs`); await writeFile(path, source);
        const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }],
  ['import map: every application/vendor bare import resolves locally', async () => {
    const maps = scripts.filter(s => s[1].includes('importmap')); assert.equal(maps.length, 1);
    const { imports } = JSON.parse(maps[0][2]);
    for (const target of Object.values(imports)) {
      assert.ok(target.startsWith('./vendor/'), `non-local import ${target}`);
      await access(join(root, target));
    }
    const sources = [scripts.find(s => s[1].includes('module'))[2], await readFile(join(root, 'vendor/RoomEnvironment.js'), 'utf8')];
    for (const source of sources) for (const [, specifier] of source.matchAll(/^import\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/gm)) {
      assert.ok(imports[specifier], `unmapped import ${specifier}`);
    }
  }],
  ...await serviceWorkerCases()
]);
