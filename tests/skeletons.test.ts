import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateList } from '../src/doc/templates.js';
import { assemble } from '../src/render-paged.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL_DIR = join(ROOT, 'assets', 'templates');

describe('template skeletons', () => {
  const list = templateList();

  it('there is one starter file per template', () => {
    expect(list).toHaveLength(12);
    for (const t of list) {
      expect(existsSync(join(TPL_DIR, t.skeleton + '.md')), `${t.skeleton}.md exists`).toBe(true);
    }
  });

  for (const t of list) {
    it(`"${t.id}" skeleton assembles into pages`, () => {
      const src = readFileSync(join(TPL_DIR, t.skeleton + '.md'), 'utf8');
      // every skeleton opens with a document settings block carrying its template
      expect(src).toContain('kind: document');
      const a = assemble(src);
      expect(a.bodyHtml.length).toBeGreaterThan(0);
      expect(a.css.length).toBeGreaterThan(0);
    });
  }
});
