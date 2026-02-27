#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const outputDirArg = process.argv[2];
const portArg = process.argv[3];

if (!outputDirArg) {
  console.error('Usage: node scripts/serve-dist.mjs <dist-dir> [port]');
  process.exit(1);
}

const rootDir = resolve(outputDirArg);
const port = Number(portArg ?? '4200');

if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
  console.error(`Dist directory not found: ${rootDir}`);
  process.exit(1);
}

const contentTypeByExtension = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
]);

const server = createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0] || '/');
  const relativePath = urlPath === '/' ? '/index.html' : urlPath;
  const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(rootDir, normalizedPath);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback for client-side routes.
    filePath = join(rootDir, 'index.html');
  }

  if (!existsSync(filePath)) {
    response.writeHead(404).end('Not Found');
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const contentType = contentTypeByExtension.get(extension) ?? 'application/octet-stream';

  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });

  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${rootDir} at http://127.0.0.1:${port}`);
});
