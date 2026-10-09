/**
 * Shared test helpers: the golden corpus (from the orz-markdown package),
 * paged texts made from this repository's templates, hazard texts, an engine
 * stand-in, the legacy fixtures, and real Chrome.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The carrier golden corpus shipped in the orz-markdown package (preferred over the sibling checkout). */
export const CORPUS = ['node_modules/orz-markdown/tests/carrier-corpus', '../orz-markdown/tests/carrier-corpus'].find((p) => existsSync(join(p, 'manifest.json')))!;

export interface CorpusEntry {
  path: string;
  kind: 'md' | 'slides' | 'paged';
  hasHeader: boolean;
  legacyHeader: boolean;
  byteSensitive: boolean;
  header: { title: string | null; uid: string | null; theme: string | null; author: string | null; license: string | null };
  keys: string[];
  derivedTitle: string;
  elementKinds?: string[];
  includes?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8')) as { files: CorpusEntry[] };

/** Every corpus entry of a kind, with its exact text (read as UTF-8, BOM kept). */
export function corpus(kind: CorpusEntry['kind'] = 'paged'): Array<CorpusEntry & { text: string }> {
  return manifest.files
    .filter((f) => f.kind === kind)
    .map((f) => ({ ...f, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(join(CORPUS, f.path))) }));
}

/** This repository's 12 template skeletons (assets/templates), by stem. */
export const TEMPLATE_TEXTS: Readonly<Record<string, string>> = Object.fromEntries(
  readdirSync('assets/templates')
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => [f.slice(0, -3), readFileSync(join('assets/templates', f), 'utf8')]),
);

/** Hazard texts (FC-18 §11): consistent line endings, no NUL or lone surrogate, so law 1 applies. */
export const HAZARDS: Readonly<Record<string, string>> = {
  empty: '',
  'crlf-header': '{{nyml\r\nkind: document\r\ncarrier: paged\r\ntitle: CR LF\r\nuid: doc-hazard0crlf01\r\ntemplate: note\r\n}}\r\n\r\n# CR LF\r\n\r\ntrailing spaces  \r\n',
  cr: '{{nyml\rkind: document\rtitle: Classic Mac\rpage_size: A5\r}}\r\rclassic line ends\r',
  bom: '﻿# BOM first\n\ntext\n',
  'bom-only': '﻿',
  'bom-crlf': '﻿{{nyml\r\nkind: document\r\ntitle: BOM and CR LF\r\n}}\r\n\r\nbody\r\n',
  astral: '# 𝒳 and 👩‍🔬\n\n𠀀 𝔸𝔹ℂ — 漢字 — עברית‏ — é\n',
  'script-close': '# </script><script>alert(1)</script> <SCRIPT src=x> </ScRiPt > <\\/script> <\\\\script>\n\n```html\n</script>\n```\n\n<!-- a comment --> --> <!-- <!--\n',
  'header-script-close': '{{nyml\nkind: document\ntitle: a </script> title\ndescription: <script>x</script>\nheader_left: </script>\ncustom_css: |\n  .a::after { content: "</style></script>"; }\n}}\n\nbody </script\n',
  'element-hazards': '{{nyml\nkind: document\ntemplate: article-section\n}}\n\n{{nyml\nkind: article-title\ntitle: A </script> <b>title</b>\nauthors: |\n  A & B | 1 | a@b.c\n}}\n\n```\n{{nyml\nkind: document\npage_size: A3\n}}\n```\n',
  'css-braces-safe': '{{nyml\nkind: document\ncustom_css: |\n  @media print { .a { color: red; } }\n  .b { x: y }\n}}\n\n# Safe braces\n',
  'dynamic-choices': '{{nyml\nkind: document\ndynamic_choices: |\n  answer-key: show\n  audience: student\n}}\n\n<div data-show-when="answer-key=show">key</div>\n',
  'no-final-newline': '# Title\n\nno final newline',
  whitespace: '\t\n   \n\t# indented\n  \n\n\n',
  'long-line': `${'word '.repeat(20_000)}\n`,
  'reserved-ids': '<div id="orz-src">a fake island</div>\n<script id="orz-shell">{"kind":"md"}</script>\n',
  'legacy-island-escape': 'already escaped the 0.x way: <\\/script> and <\\script>\n',
};

/** A script-safe engine stand-in for inline assembly (the real bundle comes with the engine step). */
export const ENGINE = 'window.__orzEngineStandIn=(window.__orzEngineStandIn||0)+1;';

/** Legacy 0.x files: generated with the 0.7.3 CLI (`--cdn`) and library (`buildPagedHtml`, `metadata`) before the rebuild changed it. */
export const LEGACY_FILES: Readonly<Record<string, string>> = {
  sample: 'tests/fixtures/legacy/sample.paged.html',
  metadata: 'tests/fixtures/legacy/metadata.paged.html',
  'lib-metadata': 'tests/fixtures/legacy/lib-metadata.paged.html',
  'exam-page': 'tests/fixtures/legacy/exam-page.paged.html',
  letter: 'tests/fixtures/legacy/letter.paged.html',
};

export const read = (path: string): string => readFileSync(path, 'utf8');

const OPEN = '<script type="text/markdown" id="orz-src">';

/**
 * The legacy source, read independently of src/legacy.ts: the island's
 * content (the 0.x writer always wrote this exact start tag), `<\/script`
 * unescaped, the writer's `\n…\n` wrapper removed.
 */
export function legacySourceOf(html: string): string {
  const at = html.indexOf(OPEN);
  if (at < 0) throw new Error('no 0.x island');
  const start = at + OPEN.length;
  const end = html.replace(/[A-Z]/g, (c) => c.toLowerCase()).indexOf('</script', start);
  return html.slice(start, end).replace(/<\\\/(script)/gi, '</$1').replace(/^\n/, '').replace(/\n$/, '');
}

/** Replace the island of a real 0.x file with `source`, written the 0.x way. */
export function withLegacySource(html: string, source: string): string {
  const at = html.indexOf(OPEN);
  const start = at + OPEN.length;
  const end = html.replace(/[A-Z]/g, (c) => c.toLowerCase()).indexOf('</script', start);
  return html.slice(0, start) + '\n' + source.replace(/<\/(script)/gi, '<\\/$1') + '\n' + html.slice(end);
}

type Browser = import('playwright-core').Browser;

/** Real Chrome through playwright-core, or null when Chrome is not installed (the test then skips). */
export async function launchChrome(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return null;
  }
}
