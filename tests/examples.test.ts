/**
 * The committed examples never go stale (claim D.1; orz-mdhtml 1.0's
 * tests/examples.test.ts for the paged kind): every `examples/*.paged.html` is
 * exactly a fresh assembly of its text twin `examples/*.paged.md` with this
 * release (its delivery and includes kept), and every text twin has its file.
 * Regenerate with `npm run build && npm run examples`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { twinName } from 'orz-markdown/carrier';
import { assemble, extract, inspect, VERSION } from '../src/lib.js';

const DIR = 'examples';
const texts = readdirSync(DIR).filter((f) => f.endsWith('.paged.md')).sort();
const files = readdirSync(DIR).filter((f) => f.endsWith('.paged.html')).sort();

describe('examples', () => {
  it('[D.1] every committed example is a fresh assembly of its text twin (run `npm run examples` when this fails)', () => {
    expect(texts.length).toBeGreaterThanOrEqual(3);
    expect(files).toEqual(texts.map((t) => twinName(t)));
    const deliveries = new Set<string>();
    const templates = new Set<string>();
    for (const name of texts) {
      const text = readFileSync(`${DIR}/${name}`, 'utf8');
      const html = readFileSync(`${DIR}/${twinName(name)}`, 'utf8');
      const ex = extract(html);
      expect(ex, name).not.toBeNull();
      expect(ex!.text === text, `${name}: the file's text is not its twin`).toBe(true);
      expect(ex!.shell, `${name}: made by another version`).toBe(VERSION);
      expect(ex!.kind, name).toBe('paged');
      deliveries.add(ex!.delivery);
      const fresh = assemble(text, { delivery: ex!.delivery as 'inline' | 'cdn', ...(ex!.includes ? { includes: ex!.includes } : {}) });
      expect(fresh === html, `${twinName(name)} is stale: run \`npm run build && npm run examples\``).toBe(true);
      const r = inspect(text, { filename: name });
      expect(r.lint.filter((l) => l.level === 'error'), name).toEqual([]);
      expect(r.uid, name).not.toBeNull();
      if (r.template) templates.add(r.template);
    }
    // several templates; inline examples (the default) and one for the web
    expect(templates.size).toBeGreaterThanOrEqual(3);
    expect([...deliveries].sort()).toEqual(['cdn', 'inline']);
  });
});

describe('docs say what is true', () => {
  const read = (f: string): string => readFileSync(f, 'utf8');
  const section = (text: string, heading: string): string => {
    const at = text.indexOf(heading);
    expect(at, heading).toBeGreaterThanOrEqual(0);
    const next = text.slice(at + heading.length).search(/\n#{2,3} /);
    return next < 0 ? text.slice(at) : text.slice(at, at + heading.length + next);
  };

  it('[D.2] README and CHANGELOG: the release state (1.0.0 released; it needs orz-markdown at the range package.json declares, published first); "Migrating" shows `new` with `--title` (gone are only the 0.x forms)', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const range = pkg.dependencies['orz-markdown']!;
    const readme = read('README.md');
    const versions = section(readme, '## Versions');
    expect(versions).toMatch(/1\.0\.0 is the first release of the rebuild/);
    expect(versions).not.toMatch(/not published yet|prepared on the branch/);
    expect(versions).toContain(`\`orz-markdown ${range}\`, which must be published first`);
    expect(read('CHANGELOG.md')).toContain(`Requires \`orz-markdown ${range}\``);
    const migrating = section(readme, '## Migrating from 0.x');
    expect(migrating).toMatch(/orz-paged@1 new \S+\.paged\.md --template \S+ --title "/);
    expect(migrating).not.toMatch(/`--list-templates` and `--title` are gone/);
    expect(read('CHANGELOG.md')).not.toMatch(/`--list-templates` and `--title` \(refused/);
  });

  it('[D.3] the skill and the README describe the table and furniture behaviour, and the skill says a `placement: page` table of contents numbers the body only with `front_matter: clean`', () => {
    const skill = read('orz-paged-skills/SKILL.md');
    const toc = section(skill, '### `toc` & `placement`');
    expect(toc).toMatch(/With `placement: page`, also set `front_matter: clean`/);
    expect(toc).toMatch(/TOC's page numbers are those body numbers/);
    expect(skill).toMatch(/repeats its header row \(`thead`\)/);
    expect(skill).toMatch(/`repeat_table_header`: a table that runs onto the next page repeats its header row/);
    expect(skill).toMatch(/take the theme's body\s+font and its muted text colour/);
    const readme = read('README.md');
    expect(readme).toMatch(/in the theme's body font and muted colour/);
    expect(readme).toMatch(/header row repeated on each page/);
  });
});
