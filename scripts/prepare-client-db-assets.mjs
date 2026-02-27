#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const copyJobs = [
  {
    source: resolve(repoRoot, 'data/kjv.sqlite'),
    destination: resolve(repoRoot, 'public/kjv.sqlite'),
    label: 'KJV SQLite database',
  },
  {
    source: resolve(repoRoot, 'node_modules/sql.js/dist/sql-wasm.wasm'),
    destination: resolve(repoRoot, 'public/assets/sql.js/sql-wasm.wasm'),
    label: 'sql.js wasm runtime',
  },
  {
    source: resolve(repoRoot, 'node_modules/sql.js/dist/sql-wasm.js'),
    destination: resolve(repoRoot, 'public/assets/sql.js/sql-wasm.js'),
    label: 'sql.js browser runtime',
  },
];

for (const job of copyJobs) {
  if (!existsSync(job.source)) {
    throw new Error(
      `Missing ${job.label} at ${job.source}. ` +
        'Run `npm install` and ensure the SQLite conversion script has produced data/kjv.sqlite.'
    );
  }
}

for (const job of copyJobs) {
  mkdirSync(dirname(job.destination), { recursive: true });
  copyFileSync(job.source, job.destination);
  console.log(`Copied ${job.label} -> ${job.destination}`);
}
