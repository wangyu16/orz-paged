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
import { integrity, prose, withLayout } from './integrity.js';

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
  await routeCdn(ctx, { highlight: true }); // highlight.js' token DOM (a stand-in, offline)
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

  it('[R.12] long highlighted code fences (240 and 300 lines, Python and unlabelled, highlight.js\' token DOM) and a page-tall plain fence, at A4 and A5 in three themes: every line on the pages, in order, with its whitespace (newlines, indentation), none clipped at a page bottom', async () => {
    const code = (n: number, seed: number): string => Array.from({ length: n }, (_, i) => `def f${i}(x):  # [K${i}] ${prose(seed + i, 3)}\n    return x * ${i} + "s${i}"`).join('\n');
    const cases: { name: string; text: string }[] = [];
    for (const [theme, size] of [['light-neat-1', 'A4'], ['light-academic-1', 'A5'], ['beige-decent-2', 'A4']] as const) {
      for (const [lang, n] of [['python', 300], ['', 240], ['text', 120]] as const) {
        cases.push({ name: `code-${lang || 'auto'}-${n}-${theme}-${size}`, text: `{{nyml\nkind: document\ntitle: Code\ntheme: ${theme}\npage_size: ${size}\n}}\n\n**[P0]** ${prose(1, 30)}\n\n\`\`\`${lang}\n${code(n, n)}\n\`\`\`\n\n**[END]** ${prose(2, 12)}\n` });
      }
    }
    const { results, errors } = await check(cases);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
  }, 300_000);

  it('[C.6] tables in columns: a table taller than the rest of the page (or than a whole page) inside `.cols` — in the left or right column or opening it, short rows and tall ones, 6 to 110 rows, with and without a repeated header, in four themes and sizes — is split between rows within its column (its widths kept, its header repeated) or, when a row is taller than a column page, laid out as plain flow: the grid never broken by Paged.js, no row in the hidden column, every row once', async () => {
    const tbl = (n: number, seed: number, tall: number): string => `| H0 | H1 |\n|---|---|\n${Array.from({ length: n }, (_, i) => `| [r${i}] ${prose(seed + i, tall && i % tall === tall - 1 ? 25 : 2)} | ${i} |`).join('\n')}`;
    const cases: { name: string; text: string }[] = [];
    for (const [theme, size] of [['light-neat-1', 'A4'], ['light-academic-1', 'A5'], ['beige-decent-2', 'Letter'], ['light-playful-1', 'A5']] as const) {
      for (const where of ['left', 'right', 'first'] as const) {
        for (const [n, tall] of [[6, 5], [30, 0], [30, 5], [110, 5]] as const) {
          const t = tbl(n, n, tall);
          const left = where === 'first' ? `${t}\n\n**[C1]** ${prose(5, 60)}` : where === 'left' ? `**[C1]** ${prose(5, 60)}\n\n${t}` : `**[C1]** ${prose(5, 120)}\n\n**[C2]** ${prose(6, 80)}`;
          const right = where === 'right' ? `**[C3]** ${prose(7, 50)}\n\n${t}` : `**[C3]** ${prose(7, 140)}`;
          cases.push({ name: `coltable-${theme}-${size}-${where}-n${n}-t${tall}`, text: `{{nyml\nkind: document\ntitle: CT\ntheme: ${theme}\npage_size: ${size}\n${n === 30 && tall ? 'repeat_table_header: false\n' : ''}}}\n\n**[C0]** ${prose(4, 40)}\n\n::::: cols\n:::: col\n${left}\n::::\n:::: col\n${right}\n::::\n:::::\n\n**[END]** ${prose(8, 10)}\n` });
        }
      }
    }
    const { results, errors } = await check(cases);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
  }, 600_000);

  it('[P.11] a length sweep of long tables (20–60 rows, short and tall cells, a short and a page-long lead, three themes and sizes, with and without the repeated header): every row once and in order, none below the page area or in the hidden column, no header stranded alone at a page bottom', async () => {
    const tbl = (n: number, tall: number, seed: number): string => `| H0 | H1 | H2 |\n|---|---|---|\n${Array.from({ length: n }, (_, i) => `| [Tr${i}] ${prose(seed + i, tall && i % tall === tall - 1 ? 40 : 2)} | ${prose(seed * 7 + i, 1)} | ${i} |`).join('\n')}`;
    const cases: { name: string; text: string }[] = [];
    for (const [theme, size] of [['light-neat-1', 'A4'], ['light-academic-1', 'A5'], ['beige-decent-2', 'Letter']] as const) {
      for (const repeat of [true, false]) {
        for (const tall of [0, 7]) {
          // 26 rows after a page-long lead, light-academic-1 at A5, with the header: a row Paged.js lost into the hidden
          // column without the round-3 mitigation (1 case in a 336-case sweep)
          for (const n of [20, 25, 26, 30, 35, 40, 45, 50, 55, 60]) {
            const lead = n % 10 === 0 || n === 26 ? 90 : 10;
            cases.push({ name: `table-${theme}-${size}-${repeat ? 'rep' : 'norep'}-t${tall}-n${n}`, text: `{{nyml\nkind: document\ntitle: T\ntheme: ${theme}\npage_size: ${size}\n${repeat ? '' : 'repeat_table_header: false\n'}}}\n\n**[P0]** ${prose(3, lead)}\n\n${tbl(n, tall, n)}\n\n**[END]** ${prose(4, 20)}\n` });
          }
        }
      }
    }
    const { results, errors } = await check(cases);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
  }, 900_000);
});
