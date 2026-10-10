/**
 * Regenerate examples/*.paged.html from their text twins (examples/*.paged.md)
 * with the built library (`npm run build` first): each file keeps its delivery
 * (`letter` is cdn, the others inline) and its includes. tests/examples.test.ts
 * fails when a committed example is not a fresh assembly of its text (the
 * shape of orz-mdhtml 1.0's scripts/examples.ts).
 *
 *   npm run examples
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { twinName } from 'orz-markdown/carrier';
import { assemble, extract } from '../src/lib.js';

const DIR = 'examples';
/** The examples assembled for the web (cdn delivery); everything else is inline. */
const CDN_EXAMPLES = new Set(['letter.paged.md']);

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.paged.md')).sort()) {
  const text = readFileSync(join(DIR, name), 'utf8');
  const out = join(DIR, twinName(name)!);
  const includes = existsSync(out) ? extract(readFileSync(out, 'utf8'))?.includes : undefined;
  const html = assemble(text, { delivery: CDN_EXAMPLES.has(name) ? 'cdn' : 'inline', ...(includes ? { includes } : {}) });
  writeFileSync(out, html, 'utf8');
  console.log(`${out}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB`);
}
