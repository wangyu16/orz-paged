/**
 * Runs once before the suite — what `npm run build` makes (the layout of
 * orz-mdhtml's tests/global-setup.ts):
 * - the browser engine staged into `dist/` (`orz-paged.browser.js` +
 *   `release.json`), where the Node library (src/engine.ts) and the CLI read
 *   it, and into `browser/`; tests check those bytes against the in-memory
 *   build (tests/lib.test.ts, tests/bundle.test.ts), so a stale engine cannot pass unnoticed;
 * - dist/ removed first (as `npm run build` does: no stale module ships);
 * - the compiled library and CLI (`tsc -p tsconfig.build.json` → dist/), so
 *   tests/cli.test.ts spawns the very `dist/cli.js` the package ships.
 */
import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { buildBrowser, writeBrowser, writeLibEngine } from '../build/bundle.js';

export async function setup(): Promise<void> {
  // as `npm run build`: dist/ from scratch (a module removed from src/ must not linger there and ship)
  rmSync('dist', { recursive: true, force: true });
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const compile = promisify(execFile)(process.execPath, [tsc, '-p', 'tsconfig.build.json']).catch((e: { stdout?: string; message: string }) => {
    throw new Error(`tsc -p tsconfig.build.json failed:\n${e.stdout ?? e.message}`);
  });
  const b = await buildBrowser();
  writeBrowser(b);
  writeLibEngine(b);
  await compile;
}
