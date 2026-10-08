import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function serve() {
  const server = createServer(async (req, res) => {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== resolve(root) && !path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end(); return;
    }
    try {
      const target = path.endsWith(sep) || path === root.slice(0, -1) ? resolve(path, 'index.html') : path;
      const body = await readFile(target);
      const type = target.endsWith('.html') ? 'text/html' : target.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

export async function runCases(cases) {
  let failed = 0;
  for (const [name, fn] of cases) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}\n  ${error.stack || error}`); }
  }
  console.log(`${cases.length - failed}/${cases.length} passed; ${failed} failed`);
  if (failed) process.exitCode = 1;
}
