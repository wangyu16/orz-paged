/**
 * The full column matrix (closed loop round 2): every column fixture
 * (tests/fixtures/columns) × every print theme × A5, A4, Letter, each laid
 * out in real Chrome and checked by the whole-document integrity oracle
 * (tests/integrity.ts: per-column text, tag counts, clipping, the hidden
 * off-page column, blank pages, grid breaks). tests/integrity.test.ts runs a
 * representative part of it; this runs all (minutes).
 *
 *   npx tsx scripts/columns-matrix.ts [--docs a_long,f_exam] [--themes light-playful-1] [--sizes A5]
 *
 * Exit 1 when any case fails.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../src/assemble.js';
import { THEMES } from '../src/themes.js';
import { bundle, launch, pagesIdle, routeCdn, serve, tempDir } from '../tests/browser-env.js';
import { integrity, withLayout } from '../tests/integrity.js';

const FIX = 'tests/fixtures/columns';
const arg = (name: string): string[] | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]!.split(',') : null;
};
const docs = arg('docs') ?? readdirSync(FIX).filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3));
const themes = arg('themes') ?? [...THEMES];
const sizes = arg('sizes') ?? ['A5', 'A4', 'Letter'];

const browser = await launch();
if (!browser) { console.error('Chrome is not installed'); process.exit(2); }
const files = tempDir('orz-paged-matrix-');
files.write('fig.svg', readFileSync(join(FIX, 'fig.svg'), 'utf8'));
const site = await serve(files.dir);
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1200 } });
await routeCdn(ctx);
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const b = await bundle();
let failed = 0;
let n = 0;
const t0 = Date.now();
for (const d of docs) for (const th of themes) for (const sz of sizes) {
  const text = withLayout(readFileSync(join(FIX, `${d}.md`), 'utf8'), th, sz);
  files.write('x.paged.html', assemble(text, { engineSource: b.iife }));
  await page.goto(`${site.url}/x.paged.html`);
  await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
  await pagesIdle(page);
  const r = await integrity(page, text);
  n++;
  if (r.problems.length) failed++;
  console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${d} ${th} ${sz} pages=${r.pages}${r.problems.length ? ` ${r.problems.slice(0, 6).join(' ; ')}` : ''}`);
}
console.log(`${n - failed}/${n} clean in ${Math.round((Date.now() - t0) / 1000)} s; page errors: ${JSON.stringify(errors.slice(0, 5))}`);
await browser.close();
await site.close();
files.clean();
process.exit(failed || errors.length ? 1 : 0);
