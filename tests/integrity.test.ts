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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../src/assemble.js';
import { MOVE_WHOLE_MAX_EMPTY, REPLAN_STEP } from '../src/paged/cols-flow.js';
import { bundle, launch, pagesIdle, routeCdn, serve, tempDir, type Browser, type BrowserContext } from './browser-env.js';
import { integrity, MOVE_MAX_EMPTY, prose, withLayout } from './integrity.js';

const FIX = 'tests/fixtures/columns';
const DOCS = readdirSync(FIX).filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3));

describe('[C.4] the column handler\'s round-2 rules (source)', () => {
  it('[C.4] a re-plan moves the cut by at least a line; an empty head of a block moved whole is never drawn and its continuation follows at once when it lands on a fresh page; an over-tall kept-whole block (an exam question) is split at a page top; three auto columns keep a smaller minimum', () => {
    const src = readFileSync('src/paged/cols-flow.ts', 'utf8');
    expect(REPLAN_STEP).toBeGreaterThanOrEqual(12);
    expect(MOVE_WHOLE_MAX_EMPTY).toBe(MOVE_MAX_EMPTY); // the handler's threshold is the owner's third (the oracle's own copy)
    expect(MOVE_MAX_EMPTY).toBe(1 / 3);
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
async function check(cases: { name: string; text: string }[], pool = 3): Promise<{ results: Record<string, string[]>; errors: string[]; stats: { tableMovedWhole: number; tablePulled: number; codeMoved: number } }> {
  const b = await bundle();
  const ctx: BrowserContext = await browser!.newContext({ viewport: { width: 1100, height: 1200 } });
  await routeCdn(ctx, { highlight: true }); // the real highlight.js (vendored, offline)
  const results: Record<string, string[]> = {};
  const errors: string[] = [];
  const stats = { tableMovedWhole: 0, tablePulled: 0, codeMoved: 0 };
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
      const st = await page.evaluate(() => (globalThis as unknown as { __orzPaged: { stats(): { tables: { movedWhole: number; pulled: number }; code: { moved: number } } } }).__orzPaged.stats());
      stats.tableMovedWhole += st.tables.movedWhole;
      stats.tablePulled += st.tables.pulled;
      stats.codeMoved += st.code.moved;
    }
  }));
  await ctx.close();
  return { results, errors, stats };
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

  it('[C.4] the hybrid\'s threshold at every height of a page (round 4): a short block (most of a page: it straddles the page bottom from every lead, split above a third left, moved below), a long block whose left column opens with a 25-row table, and a long block with headings through its columns, a long block whose left column opens with an image, after a lead one short paragraph longer each time, in two themes at A5 — a block moves whole by choice only when that leaves less than a third of the page empty (`MOVEGAP`), a column opening with a table keeps its header and rows when they fit (`TABLEMOVE`), a column\'s part never ends with a heading (`HEADLAST`), and the oracle\'s other checks hold', async () => {
    const cols = (left: string, right: string): string => `::::: cols\n:::: col\n${left}\n::::\n:::: col\n${right}\n::::\n:::::`;
    const tbl = (n: number, seed: number): string => `| H0 | H1 |\n|---|---|\n${Array.from({ length: n }, (_, i) => `| [tr${i}] ${prose(seed + i, 2)} | ${i} |`).join('\n')}`;
    const heads = (seed: number): string => Array.from({ length: 9 }, (_, i) => `### [H${seed}x${i}] Part ${i}\n\n**[B${seed}x${i}]** ${prose(seed * 13 + i, 26)}`).join('\n\n');
    const blocks: Array<[string, string]> = [
      ['short', cols(`**[S1]** ${prose(61, 40)}\n\n**[S3]** ${prose(65, 25)}`, `**[S2]** ${prose(62, 62)}`)],
      ['table', cols(`${tbl(25, 70)}\n\n**[T1]** ${prose(63, 30)}`, `**[T2]** ${prose(64, 200)}`)],
      ['headings', cols(heads(1), heads(2))],
      // a column opening with an image (it cannot split): moved whole only below the threshold, else that column goes on
      ['image', cols(`<img src="fig.svg" style="width:100%;height:330px">\n\n**[I1]** ${prose(66, 80)}`, `**[I2]** ${prose(67, 230)}`)],
    ];
    const cases: { name: string; text: string }[] = [];
    for (const theme of ['light-academic-1', 'beige-decent-2']) {
      for (const [name, block] of blocks) {
        for (let lead = 0; lead <= 24; lead += 2) {
          cases.push({ name: `threshold-${name}-${theme}-lead${lead}`, text: `{{nyml\nkind: document\ntitle: Threshold\ntheme: ${theme}\npage_size: A5\n}}\n\n${Array.from({ length: lead }, (_, i) => `**[Q${i}]** ${prose(20 + i, 7)}`).join('\n\n')}\n\n${block}\n\n**[END]** ${prose(5, 12)}\n` });
        }
      }
    }
    const { results, errors } = await check(cases);
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

  it('[R.12] the real highlight.js is what the tests highlight with: the vendored build is cdnjs\' highlight.js at the version orz-markdown pins (SHA-512 = cdnjs\' SRI), and no stand-in is left', async () => {
    const { PREVIEW_LIB_VERSIONS } = await import('orz-markdown/preview-frame');
    expect(PREVIEW_LIB_VERSIONS.highlightjs).toBe('11.9.0');
    const js = readFileSync('tests/fixtures/vendor/highlight.js-11.9.0/highlight.min.js');
    expect(createHash('sha512').update(js).digest('base64')).toBe('D9gUyxqja7hBtkWpPWGt9wfbfaMGVt9gnyCvYa+jojwwPHLCzUm5i8rpk7vD7wNee9bA35eYIjobYPaQuKS1MQ==');
    expect(js.toString('utf8', 0, 40)).toContain('Highlight.js v11.9.0');
    expect(existsSync('tests/fixtures/hljs-stub.js')).toBe(false);
    expect(readFileSync('tests/browser-env.ts', 'utf8')).not.toMatch(/stub/i);
  });

  it('[R.12] long code across pages with the REAL highlight.js (11.9.0) on real source files — argparse lines 1200–1500 (Python), 300 lines of this repo\'s cols-flow.ts (TypeScript), 300 lines of Paged.js\' layout.js (JavaScript, labelled and unlabelled) — and synthetic fences (300-line Python, 240 unlabelled, a page-tall plain fence) at A4, A5 and Letter in three themes: every line on the pages, in order, with its whitespace (the oracle\'s `CODE`), none clipped, and the rest of the document after each fence present (`TEXT`, `[AFTER]`, `[END]`); blank and indentation-only lines at every offset of a page bottom keep the fragment\'s box inside the area (`PREBOX`); and the same lookup outside code — a phrase repeated between inline math across page breaks — keeps every character once, in order', async () => {
    const synthetic = (n: number, seed: number): string => Array.from({ length: n }, (_, i) => `def f${i}(x):  # [K${i}] ${prose(seed + i, 3)}\n    return x * ${i} + "s${i}"`).join('\n');
    const lines = (text: string, from: number, n: number): string => text.split('\n').slice(from, from + n).join('\n');
    const sources: Array<[string, string, string]> = [
      ['argparse', 'python', readFileSync('tests/fixtures/code/argparse-3.12-1200-1500.py', 'utf8').replace(/\n$/, '')],
      ['colsflow', 'typescript', lines(readFileSync('src/paged/cols-flow.ts', 'utf8'), 100, 300)],
      ['layoutjs', 'javascript', lines(readFileSync('node_modules/pagedjs/src/chunker/layout.js', 'utf8'), 300, 300)],
      ['layoutjs-auto', '', lines(readFileSync('node_modules/pagedjs/src/chunker/layout.js', 'utf8'), 300, 300)],
      ['synthetic-python', 'python', synthetic(300, 300)],
      ['synthetic-auto', '', synthetic(240, 240)],
      ['plain', 'text', synthetic(120, 120)],
    ];
    // blank lines and indentation-only lines at every offset of a page bottom: a lead spacer 0–22 px high moves the
    // code's lines through a whole line height in 2 px steps (a lead of whole lines would keep them aligned)
    const blanks = Array.from({ length: 90 }, (_, i) => (i % 3 === 2 ? (i % 2 ? '' : '        ') : `    v${i} = step(v${i - 1}, "${prose(i, 2)}")`)).join('\n');
    const sweep: { name: string; text: string }[] = [];
    for (const [theme, size] of [['light-neat-1', 'A4'], ['light-academic-1', 'A5']] as const) {
      for (let lead = 0; lead < 24; lead++) {
        sweep.push({ name: `code-blank-lines-${theme}-${size}-lead${lead}`, text: `{{nyml\nkind: document\ntitle: Code\ntheme: ${theme}\npage_size: ${size}\n}}\n\n**[P0]** ${prose(10, 4)}\n\n<div class="orz-test-spacer" style="height: ${lead}px"></div>\n\n\`\`\`python\ndef run(v0):\n${blanks}\n\`\`\`\n\n**[END]** ${prose(5, 12)}\n` });
      }
    }
    const cases: { name: string; text: string }[] = [];
    for (const [theme, size] of [['light-neat-1', 'A4'], ['light-academic-1', 'A5'], ['beige-decent-2', 'Letter']] as const) {
      for (const [name, lang, code] of sources) {
        cases.push({ name: `code-${name}-${theme}-${size}`, text: `{{nyml\nkind: document\ntitle: Code\ntheme: ${theme}\npage_size: ${size}\n}}\n\n**[P0]** ${prose(1, 30)}\n\n\`\`\`\`${lang}\n${code}\n\`\`\`\`\n\n## After the code\n\n**[AFTER]** ${prose(2, 60)}\n\n- **[L1]** ${prose(3, 12)}\n- **[L2]** ${prose(4, 12)}\n\n**[END]** ${prose(5, 12)}\n` });
      }
    }
    cases.push(...sweep);
    // the same lookup outside code: a phrase repeated between inline math (sibling text nodes alike) over page breaks
    for (const [theme, size] of [['light-academic-1', 'A5'], ['light-neat-1', 'A4']] as const) {
      const para = (k: number): string => `**[M${k}]** ${Array.from({ length: 45 }, () => 'Some explanatory text for this part with inline math $a_{i}+b$.').join(' ')}`;
      cases.push({ name: `prose-repeated-between-math-${theme}-${size}`, text: `{{nyml\nkind: document\ntitle: Repeated\ntheme: ${theme}\npage_size: ${size}\n}}\n\n${para(1)}\n\n## [H] After the first\n\n${para(2)}\n\n${para(3)}\n\n**[END]** ${prose(5, 12)}\n` });
    }
    const { results, errors } = await check(cases);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
  }, 900_000);

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
      // a table's header at every height of a page bottom (a lead one short paragraph longer each time): the header
      // never stays alone at the bottom (closed loop round 4: report-35 p19 — a heading, a paragraph, then the table)
      for (let lead = 14; lead < 30; lead++) {
        cases.push({ name: `table-head-at-bottom-${theme}-${size}-lead${lead}`, text: `{{nyml\nkind: document\ntitle: T\ntheme: ${theme}\npage_size: ${size}\n}}\n\n${Array.from({ length: lead }, (_, i) => `**[Q${i}]** ${prose(40 + i, 9)}`).join('\n\n')}\n\n### A heading\n\n**[QH]** ${prose(90, 30)}\n\n${tbl(12, 0, 7)}\n\n**[END]** ${prose(4, 20)}\n` });
      }
    }
    // a table's first and second body rows at every offset of the page bottom (a lead spacer 0–31 px in 1 px steps): a
    // row flush with the bottom goes on with the overflow — never the only body row (the header would stay alone)
    for (let sp = 0; sp < 32; sp++) {
      cases.push({ name: `table-row-flush-A5-${sp}`, text: `{{nyml\nkind: document\ntitle: T\ntheme: light-academic-1\npage_size: A5\n}}\n\n${Array.from({ length: 8 }, (_, i) => `**[F${i}]** ${prose(140 + i, 9)}`).join('\n\n')}\n\n<div class="orz-test-spacer" style="height: ${sp}px"></div>\n\n${tbl(8, 0, 9)}\n\n**[END]** ${prose(4, 20)}\n` });
    }
    // the 35-page report (its p19 stranded a header before round 4) at three widths of the window
    cases.push({ name: 'report-35', text: readFileSync('tests/fixtures/report-35.paged.md', 'utf8') });
    const { results, errors, stats } = await check(cases);
    expect(Object.keys(results).length).toBe(cases.length);
    expect(failures(results)).toEqual({});
    expect(errors).toEqual([]);
    // the sweep reaches the round-4 rule: some fragments would have kept only the header and moved whole instead
    expect(stats.tableMovedWhole).toBeGreaterThan(0);
    expect(stats.tablePulled).toBeGreaterThan(0); // and a flush row pulled onward
  }, 900_000);
});
