import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { root } from './helpers.mjs';

const origin = 'https://example.test';
const base = `${origin}/ashworth/`;
const absolute = value => new URL(typeof value === 'string' ? value : value.url, base).href;

async function harness() {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const handlers = {}, stores = new Map(), deleted = [], network = [];
  const open = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
      addAll: async assets => { for (const asset of assets) data.set(absolute(asset), `own:${asset}`); },
      match: async request => data.get(absolute(request)),
      put: async (request, response) => data.set(absolute(request), response)
    };
  };
  const caches = {
    open, keys: async () => [...stores.keys()],
    delete: async name => { deleted.push(name); return stores.delete(name); },
    match: async request => {
      for (const data of stores.values()) if (data.has(absolute(request))) return data.get(absolute(request));
    }
  };
  vm.runInNewContext(source, {
    URL, caches, location: { origin, href: base + 'sw.js' },
    self: { location: { origin, href: base + 'sw.js' }, registration: { scope: base },
      addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    fetch: async request => { network.push(absolute(request)); return { ok: true, clone() { return this; } }; }
  }, { filename: root + 'sw.js' });
  const dispatch = async (name, request) => {
    let result, intercepted = false;
    handlers[name]({ request, waitUntil: promise => { result = promise; }, respondWith: promise => { intercepted = true; result = promise; } });
    return { response: await result, intercepted };
  };
  const request = (path, mode = 'cors', method = 'GET') => ({ url: new URL(path, base).href, mode, method });
  const current = source.match(/const CACHE\s*=\s*['"]([^'"]+)/)[1];
  return { stores, deleted, network, open, dispatch, request, current };
}

export async function serviceWorkerCases() {
  return [
    ['SW: precache assets and query navigation boot offline', async () => {
      const h = await harness(); await h.dispatch('install');
      assert.equal(h.stores.get(h.current).size, 4);
      for (const path of ['./', './index.html', './vendor/three.module.min.js', './vendor/RoomEnvironment.js']) {
        const result = await h.dispatch('fetch', h.request(path)); assert.ok(result.response);
      }
      const nav = await h.dispatch('fetch', h.request('./?offline=1', 'navigate'));
      assert.equal(nav.response, 'own:./index.html'); assert.deepEqual(h.network, []);
    }],
    ['SW: activation preserves unrelated origin caches', async () => {
      const h = await harness(); await h.open('another-game-v9'); await h.open('ashworth-v1'); await h.dispatch('install'); await h.dispatch('activate');
      assert.ok(h.deleted.includes('ashworth-v1')); assert.ok(h.stores.has(h.current));
      assert.ok(h.stores.has('another-game-v9'), 'unrelated cache was deleted');
    }],
    ['SW: only own cache serves assets and navigations', async () => {
      const h = await harness(); const other = await h.open('another-game-v9');
      await other.put('./index.html', 'poison-page'); await other.put('./vendor/three.module.min.js', 'poison-engine');
      await h.dispatch('install');
      assert.equal((await h.dispatch('fetch', h.request('./?x=1', 'navigate'))).response, 'own:./index.html');
      assert.equal((await h.dispatch('fetch', h.request('./vendor/three.module.min.js'))).response, 'own:./vendor/three.module.min.js');
    }],
    ['SW: arbitrary assets and asset queries do not grow cache', async () => {
      const h = await harness(); await h.dispatch('install');
      for (const path of ['./og-image.png', './vendor/three.module.min.js?extra=1', '/other/index.html']) {
        assert.equal((await h.dispatch('fetch', h.request(path))).intercepted, false, `intercepted ${path}`);
      }
      assert.equal(h.stores.get(h.current).size, 4);
    }],
    ['SW: cross-origin and non-GET requests are untouched', async () => {
      const h = await harness(); await h.dispatch('install');
      for (const request of [h.request('https://elsewhere.test/x'), h.request('./index.html', 'cors', 'POST')]) {
        assert.equal((await h.dispatch('fetch', request)).intercepted, false);
      }
    }]
  ];
}
