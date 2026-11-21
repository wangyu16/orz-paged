/**
 * The hand-written browser types match the kit's FC-19 editor API (STATUS
 * D-143; orz-markdown 2.4.0–2.10.0): claim W.9 in notes/CLAIMS.md. A
 * sample app written against `browser/index.d.ts` — `hooks.saveStatus`,
 * `foldHeader`, `reveal`, `refreshSaveStatus`, `applyEdits`, `flash`,
 * `select` / `getSelection` / `setFocusRange`, `setWords` (with 2.10.0's
 * `status`), `siteNav` — typechecks under --strict, the kit's own editor
 * (`EditorShell`, what `mountEditor` returns) is assignable to the declared
 * `Editor`, and the declared hooks and words are assignable to the kit's.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DTS = resolve('browser/index.d.ts').replace(/\.d\.ts$/, '');

const SAMPLE = `
import type {
  Editor, EditorOptions, EditorHooks, EditorWords, EditorStatusWords, SaveStatus, SaveStatusState, SaveTone, RevealTarget,
  EditorEvents, OrzCarrierApi, SiteNav, TextRange,
} from '${DTS}';
import { mountEditor, assemble, extract } from '${DTS}';
import type { EditorShell, EditorHooks as KitHooks, EditorWords as KitWords, SaveStatus as KitSaveStatus } from 'orz-markdown/carrier/editor';

declare const el: HTMLElement;

// hooks.saveStatus (2.7.0): a string, { text, tone } or nothing
const hooks: EditorHooks = {
  save: async (_text: string) => undefined,
  saveStatus: ({ dirty, saving }: SaveStatusState) => (saving ? { text: 'Sending…', tone: 'pending' } : dirty ? 'Waiting to send' : null),
};
const options: EditorOptions = { text: '# Notes\\n', kind: '__KIND__', hooks, foldHeader: false, chrome: 'compact' };
const editor: Editor = mountEditor(el, options);
editor.refreshSaveStatus();

// reveal (2.7.0): a range, a heading's words or #id, { heading }
const targets: RevealTarget[] = [{ from: 0, to: 3 }, { from: 2 }, '#intro', 'Notes', { heading: 'Notes' }];
for (const t of targets) {
  const got: TextRange | null = editor.reveal(t, { select: true });
  if (got) { const n: number = got.from + got.to; void n; }
}

// the 2.4.0 tools
const changed: boolean = editor.applyEdits([{ from: 0, to: 1, insert: '#' }], { label: 'Retitle' });
editor.flash([{ from: 0, to: 1 }], { ms: 400 });
editor.select(0, 1, { scroll: false });
const sel: { from: number; to: number } | null = editor.getSelection();
editor.setFocusRange(0, 4, { mode: 'fold' });
editor.setFocusRange(null);
const off = editor.on('change', (e: EditorEvents['change']) => { const label: string | undefined = e.label; void label; });
off();

// setWords (2.9.0) and the save status's own words (2.10.0)
const status: EditorStatusWords = { clean: 'Copy downloaded', dirty: 'Not saved: download to keep' };
const words: EditorWords = { save: 'Download a copy', saved: '', notice: 'Your own copy.', status };
editor.setWords(words);
editor.setWords({ status: null, notice: null });
editor.setWords({ save: undefined });

// siteNav (2.10.0)
const nav: SiteNav = { title: 'Week 1', home: '../index.html', previous: { href: 'a.html', label: 'Intro' }, next: { href: 'https://example.org/c.html', label: 'Next' } };
const html: Promise<string> = assemble('# x\\n', { siteNav: nav });
const back: SiteNav | undefined = extract('<html></html>')?.siteNav;
const api: OrzCarrierApi['mountEditor'] = mountEditor;

// @ts-expect-error a tone outside the four
const badTone: SaveStatus = { text: 'x', tone: 'green' };
// @ts-expect-error status words are plain text
const badWords: EditorWords = { status: { clean: 1 } };
// @ts-expect-error reveal needs a target
editor.reveal();

// the declared Editor is what the kit's editor shell is (mountEditor returns it)
declare const shell: EditorShell;
const fromKit: Editor = shell;
// what an app passes reaches the kit unchanged
const kitHooks: KitHooks = { saveStatus: hooks.saveStatus };
const kitWords: KitWords = words;
const kitTone: SaveTone | undefined = ({} as KitSaveStatus).tone;

export { changed, sel, html, back, api, badTone, badWords, fromKit, kitHooks, kitWords, kitTone };
`;

describe('browser/index.d.ts and the kit\'s FC-19 editor API (D-143)', () => {
  it('[W.9] a sample app using hooks.saveStatus, foldHeader, reveal, refreshSaveStatus, applyEdits, flash, select/getSelection/setFocusRange, setWords (status) and siteNav typechecks under --strict against browser/index.d.ts; the kit\'s EditorShell is assignable to the declared Editor and the declared hooks and words to the kit\'s; wrong tones, non-text words and a reveal without a target are errors', () => {
    mkdirSync('node_modules/.cache', { recursive: true });
    // inside the package, so 'orz-markdown/carrier/editor' resolves to the kit this carrier builds with
    const dir = mkdtempSync(join(resolve('node_modules/.cache'), 'orz-paged-types-'));
    try {
      const file = join(dir, 'sample.ts');
      writeFileSync(file, SAMPLE.replace('__KIND__', 'paged'));
      const tsc = join('node_modules', 'typescript', 'bin', 'tsc');
      let out = '';
      try {
        execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--lib', 'dom,es2022', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck', 'false', file], { encoding: 'utf8', stdio: 'pipe' });
      } catch (e) { out = String((e as { stdout?: string }).stdout ?? e); }
      expect(out).toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
});
