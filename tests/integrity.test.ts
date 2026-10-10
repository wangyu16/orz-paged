/**
 * Whole-document integrity of the column layout (claims C.4, C.5; closed
 * loop round 2): the reusable oracle of tests/integrity.ts — per-column text
 * across pages, tag counts, clipping, Paged.js' hidden off-page column, blank
 * pages, grid breaks — over the column fixtures × a representative theme and
 * size matrix (the full matrix, every theme × A5/A4/Letter, is
 * `npx tsx scripts/columns-matrix.ts`), and over length sweeps of a block
 * with a ratio (`::: cols 1 2`, an inline style Paged.js' undisplayed filter
 * marked: its continuation never broke, text was lost or repeated).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../src/assemble.js';
import { REPLAN_STEP } from '../src/paged/cols-flow.js';
import { bundle, launch, pagesIdle, routeCdn, serve, tempDir, type Browser, type BrowserContext } from './browser-env.js';
import { integrity, withLayout } from './integrity.js';

const FIX = 'tests/fixtures/columns';
const DOCS = readdirSync(FIX).filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3));

describe('[C.4] the column handler\'s round-2 rules (source)', () => {
  it('[C.4] a re-plan moves the cut by at least a line; an empty head of a block moved whole is never drawn and its continuation follows at once when it lands on a fresh page; an over-tall kept-whole block (an exam question) is split at a page top; three auto columns keep a smaller minimum', () => {
    const src = readFileSync('src/paged/cols-flow.ts', 'utf8');
    expect(REPLAN_STEP).toBeGreaterThanOrEqual(12);
    expect(src).toContain('limit -= Math.max(Math.ceil(over) + 1, REPLAN_STEP);');
    expect(src).toMatch(/node\.hasAttribute\(MOVED\) && !node\.firstElementChild/);
    expect(src).toContain("rest.removeAttribute('data-break-before')");
    expect(src).toMatch(/if \(!splitAvoided && \(cs\.breakInside === 'avoid'/);
    expect(readFileSync('assets/themes/base.css', 'utf8')).toMatch(/\.cols:has\(> \.col:nth-child\(3\):last-child\) \{\s*--orz-col-min: 7rem;/);
  });
  it('[C.5] the handler takes Paged.js\' undisplayed mark off every grid and cell in `filter` (before the layout reads it)', () => {
    const src = readFileSync('src/paged/cols-flow.ts', 'utf8');
    expect(src).toMatch(/filter\(parsed: DocumentFragment \| Element\): void \{\s*parsed\.querySelectorAll\('\.cols\[data-undisplayed\], \.col\[data-undisplayed\]'\)\.forEach\(\(e\) => e\.removeAttribute\('data-undisplayed'\)\);/);
    expect(src).not.toMatch(/afterParsed\([^)]*\)[^{]*\{[^}]*data-undisplayed/);
  });
});

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-integrity-');
files.write('fig.svg', readFileSync(join(FIX, 'fig.svg'), 'utf8'));
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;

/** Lay out each text in a read view (`pool` pages at a time) and return the oracle's problems per case. */
async function check(cases: { name: string; text: string }[], pool = 3): Promise<{ results: Record<string, string[]>; errors: string[] }> {
  const b = await bundle();
  const ctx: BrowserContext = await browser!.newContext({ viewport: { width: 1100, height: 1200 } });
  await routeCdn(ctx);
  const results: Record<string, string[]> = {};
  const errors: string[] = [];
  const queue = [...cases];
  await Promise.all(Array.from({ length: pool }, async (_, w) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    for (let c = queue.shift(); c; c = queue.shift()) {
      const name = `w${w}-${c.name}.paged.html`;
      files.write(name, assemble(c.text, { engineSource: b.iife }));
      await page.goto(`${site.url}/${name}`);
      await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
      await pagesIdle(page);
      const r = await integrity(page, c.text);
      results[c.name] = r.pages > 0 ? r.problems : ['no pages'];
    }
  }));
  await ctx.close();
  return { results, errors };
}

const failures = (results: Record<string, string[]>): Record<string, string[]> => Object.fromEntries(Object.entries(results).filter(([, p]) => p.length).map(([k, p]) => [k, p.slice(0, 4)]));

chrome('the column integrity matrix (real Chrome)', () => {
  it('[C.4] every column fixture × light-academic-1, light-playful-1 (the ruled grid), beige-decent-2 at A5 and the default theme at Letter: the pages hold the document whole — per-column text in order, every tag once, nothing clipped or in the hidden off-page column, no blank page, no grid broken by Paged.js', async () => {
    const cases: { name: string; text: string }[] = [];
    for (const d of DOCS) {
      const text = readFileSync(join(FIX, `${d}.md`), 'utf8');
      for (const th of ['light-academic-1', 'light-playful-1', 'beige-decent-2']) cases.push({ name: `${d}-${th}-A5`, text: withLayout(text, th, 'A5') });
      cases.push({ name: `${d}-default-Letter`, text: text.replace(/^page_size:.*$/m, 'page_size: Letter') });
    }
    const t0 = Date.now();
    const { results, errors } = await check(cases);
    // eslint-disable-next-line no-console
    console.log(`[C.4] ${cases.length} layouts in ${Math.round((Date.now() - t0) / 1000)} s`);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
  }, 600_000);

  it('[C.5] a ratio block (`::: cols 1 2`, an inline style): three columns with custom widths at Letter in the default theme, and a length sweep of a long right column (0–40 steps of 9 words) at A5 and A4 — nothing lost or repeated', async () => {
    const S = 'The measured response follows the predicted curve closely across the full range of inputs. Small deviations appear near the boundary, where the approximation is known to weaken.';
    const W = S.split(' ');
    const cases: { name: string; text: string }[] = [{ name: 'd_three_custom-Letter', text: readFileSync(join(FIX, 'd_three_custom.md'), 'utf8') }];
    for (const [theme, size] of [['beige-decent-2', 'A5'], ['light-academic-1', 'A4']] as const) {
      for (let n = 0; n <= 40; n += 5) {
        const words = Array.from({ length: 250 + n * 9 }, (_, i) => W[i % W.length]).join(' ');
        cases.push({ name: `dupmin-${theme}-${size}-${n}`, text: `{{nyml\nkind: document\ntheme: ${theme}\npage_size: ${size}\n}}\n\n**[P0]** ${S}\n\n## Custom widths\n\n::::: cols 1 2\n:::: col\n**[L1]** ${S}\n::::\n:::: col\n**[R1]** ${words}\n\n**[R2]** ${S}\n::::\n:::::\n\n**[AFTER]** ${S} ${S}\n\n**[END]** done.\n` });
      }
    }
    const { results, errors } = await check(cases);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
  }, 300_000);
});
