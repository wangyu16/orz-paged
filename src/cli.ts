#!/usr/bin/env node
/**
 * The orz-paged CLI (FC-10; REBUILD §3b, the shape of orz-mdhtml 1.0's): text
 * twins (`x.paged.md`) and their self-editing, print-ready files
 * (`x.paged.html`, FC-18 text format 1, kind `paged`).
 *
 *   orz-paged new [file.paged.md] [--template id] [--title T] [--theme id] [--html] [--cdn | --inline]
 *   orz-paged assemble <file.paged.md> [-o out] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces sha256]   (also: orz-paged <file.paged.md>)
 *   orz-paged extract <file.paged.html> [-o out] [--replaces sha256]
 *   orz-paged upgrade <old.paged.html> [-o out] [--text out.paged.md | --no-text] [--cdn | --inline]
 *   orz-paged inspect <file> [--json]
 *   orz-paged themes | templates
 *
 * Inline delivery is the default (FD-02); `--cdn` loads the engine from
 * jsDelivr (web publishing). Content — title, theme, template, page settings,
 * metadata — comes only from the text's header: `assemble` has no content
 * options. Every command takes `--json` (one JSON object on stdout, for
 * agents; a failure has a stable `reason` code and, where useful, `next`),
 * `--help`; exit status 0 = done, 1 = refused or failed, 2 = usage.
 * Files are never overwritten when that could lose work (see `--force`).
 *
 * A plain Markdown text `x.md` (the 0.x habit, `orz-paged notes.md`) assembles
 * to `x.paged.html` as well; its twin by name is `x.paged.md`.
 *
 * The rules every carrier's CLI shares — the overwrite guards, the known
 * states (git and the pair records under `$XDG_CACHE_HOME/orz-paged`), the
 * backups, atomic writes, includes, the reason codes and `next` — are
 * orz-markdown's CLI core (`orz-markdown/carrier/node`, 2.3.0) bound to this
 * tool; this file holds the commands, their wording and the paged extras
 * (templates, the 0.x forms).
 */
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { kindFromFilename, looksHtml, twinName, type Lint } from 'orz-markdown/carrier';
import {
  assembleArgs, backup, carrierNode, CliError, emit, includePlan, mtime, readMaybe, readText, replacesToken, reportFailure, sh, sha256, writeOut,
  EXIT_OK, EXIT_USAGE, type AssembleCall, type Io, type KnownState, type Next, type Risk,
} from 'orz-markdown/carrier/node';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { letterDate, storedText } from './assemble.js';
import { presentationOf } from './presentation.js';
import { assemble, extract, inspect, newDocument, readDocument, readLegacy, upgrade, DEFAULT_TEMPLATE, DEFAULT_THEME, ORZ_MARKDOWN_VERSION, TEMPLATES, THEME_INFO, VERSION, type InspectReport } from './lib.js';

export type { Reason } from 'orz-markdown/carrier/node';

/** The kit's CLI core, bound to this tool (its name, kind, cache folder `orz-paged`, text twins `.paged.md`, its 0.x reader). */
const NODE = carrierNode({ name: 'orz-paged', kind: 'paged', readLegacy, storedText });

// ── help ────────────────────────────────────────────────────────────────────

const USAGE = `orz-paged ${VERSION} — Markdown that edits itself, laid out as print-ready pages.
A document is its text twin (x.paged.md); its self-editing file (x.paged.html) is assembled from it.

Usage:
  orz-paged new [file.paged.md] [--template id] [--title T] [--theme id] [--html] [--cdn | --inline]
  orz-paged assemble <file.paged.md> [-o out.paged.html] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces sha256]
  orz-paged <file.paged.md> [-o out.paged.html] [--cdn | --inline]   same as assemble
  orz-paged extract <file.paged.html> [-o out.paged.md] [--replaces sha256]
  orz-paged upgrade <old.paged.html> [-o out.paged.html] [--text out.paged.md | --no-text] [--cdn | --inline]
  orz-paged inspect <file> [--json]
  orz-paged themes
  orz-paged templates

Commands:
  new        write a new text twin from a template (header with a fresh uid); --html also
             assembles it; without a file the text goes to stdout
  assemble   write the .paged.html of a text twin (x.paged.md -> x.paged.html); inline by default;
             keeps the includes the existing file holds
  extract    write the exact text twin of a .paged.html (x.paged.html -> x.paged.md)
  upgrade    turn an old file (0.x, or an older 1.x shell) into a file of this version,
             in place by default, and write its text twin (x.paged.md) unless --no-text
  inspect    diagnose a text or a file: kind, format, shell, delivery, uid, lint, advice
  themes     list the theme ids a header may name
  templates  list the document templates (new --template; the header's template key)

Options:
  -o, --out <path>  output path ("-" = stdout for assemble and extract)
  --cdn             load the engine from jsDelivr (small files, for the web); default: inline
  --inline          the default delivery: the engine inside the file (no engine download)
  --force           overwrite even when that could lose work (see below); the replaced
                    file is kept as <file>~ (or <file>~1, ~2, ... — a backup is never replaced)
  --replaces <sha>  (assemble, extract) replace an existing, different output only if its
                    text has this SHA-256 (the "sha256" inspect, extract, assemble and
                    upgrade print) — works with no cache, no git, in a shallow clone
  --json            print one JSON object (the result, or {"ok": false, "error", "reason",
                    "next"}) for agents
  -h, --help        help (also: orz-paged <command> --help)
  -v, --version     the version

Content (title, theme, template, page settings, metadata) comes only from the text's
{{nyml}} header; assemble has no content options (0.x --title, --template, --new and
--list-templates: see \`orz-paged new --help\` and \`orz-paged templates\`).
Without --force nothing is overwritten that could hold other work: an output that is
not an orz file, a .paged.html (or -o output) that holds a different text than the one
assembled, an x.paged.md that differs from the text extracted (unless the text replaced
is a known state: what orz-paged itself last wrote or read for the pair, a committed,
staged or recent version of the twin in git, or the text whose SHA-256 --replaces
gives; an x.paged.md is replaced as a known state only when it and the file's text
carry the same uid), a file made by a newer orz-paged, another document (upgrade -o),
or (new) any existing file. The robust way: pass the sha256 the last command printed
as --replaces.
Before editing x.paged.md, \`orz-paged inspect x.paged.md\` says whether x.paged.html
holds other work (saved in the browser); \`orz-paged extract x.paged.html -o
x.browser.paged.md\` brings it out for a merge.
Exit status: 0 done, 1 refused or failed, 2 usage error.`;

const HELP: Record<string, string> = {
  new: `orz-paged new [file.paged.md] [--template id] [--title T] [--theme id] [--html] [--cdn | --inline] [--force] [--json]

Writes a new text twin from a template's starter text: its header (kind:
document, carrier: paged, a fresh uid, the template's title and settings, the given
title/theme), then the template's starter body. Without a file the text is printed to
stdout. --html also writes its assembled file (file.paged.html; --cdn for a small web
file). Refuses to overwrite an existing file unless --force, which keeps each replaced
file as <file>~. A text twin's name ends in .paged.md.
Templates (default ${DEFAULT_TEMPLATE}; \`orz-paged templates\` describes them): ${TEMPLATES.map((t) => t.id).join(', ')}.
Themes (default ${DEFAULT_THEME}): ${THEME_INFO.map((t) => t.id).join(', ')}.
(0.x: \`orz-paged --new <template>\` is now \`orz-paged new x.paged.md --template <template>\`;
\`orz-paged --template <template>\` is now \`orz-paged new x.paged.md --template <template> --html\`.)`,
  assemble: `orz-paged assemble <file.paged.md> [-o out.paged.html] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces <sha256>] [--force] [--json]
orz-paged <file.paged.md> [-o out.paged.html] [--cdn | --inline] [--force] [--json]

Writes the self-editing file of a text twin: x.paged.md -> x.paged.html, the text
stored exactly (line endings, BOM); -o writes it elsewhere (missing folders are created).
Delivery: --inline (this release's engine inside the file) or --cdn (loads it from
jsDelivr); without either, an existing output keeps its delivery, a new one is inline.
Everything about the document — title, theme, template, page size, margins, page numbers,
versions, metadata — comes from the text's header; there are no content options. A plain
Markdown text (x.md) assembles to x.paged.html too.

Includes ({{md part.md}}, {{md https://…}}): a file shows an include only from the
record it holds (#orz-includes). The record of the existing output is kept (for the
directives the text still has); --no-includes drops it. --resolve-includes reads the
file includes from the text's folder (never outside it) and records them; a recorded file
include whose file has changed since is a warning (--json: "stale"). A directive left
unresolved shows an "Included file not available" note in the file; each one is reported
once, as a warning, with why (--json: "unresolved": [{ target, kind, reason }]).

Replacing the output (x.paged.html, or the -o path; no --force needed) when it holds:
  - the same text, or
  - the text orz-paged itself last wrote into it or read out of it for this pair
    (assemble, extract, new --html, upgrade; recorded by hash in
    $XDG_CACHE_HOME/orz-paged or ~/.cache/orz-paged), or
  - (x.paged.html only) an earlier state of x.paged.md in git: its last commit, its staged
    version or one of its 20 most recent commits (git log -- x.paged.md), when x.paged.md is
    tracked. A full clone works; a shallow checkout (CI's default --depth 1) knows only
    the last commit: use --replaces there. A text equal to one of the twin's last 20
    commits counts as a known earlier state, so a deliberate revert of x.paged.html to
    such a text is replaced — commit the revert first, or
  - with --replaces <sha256>: exactly the text with that SHA-256 — the "sha256" that
    inspect, extract, assemble and upgrade print (works with no cache, no git, in a
    shallow clone). With --replaces, any other text is refused.
So the normal loop — edit x.paged.md, assemble, edit, assemble — needs no --force, with or
without -o. Refuses (unless --force) to replace an output that is not an orz file
(not-orz); a 0.x file (\`orz-paged upgrade x.paged.html --text x.browser.paged.md\`, merge,
then assemble with the sha256 upgrade printed as --replaces); a file made by a newer
orz-paged (use \`npx orz-paged@latest\`); or an output holding any other text — it
may hold work saved in the browser (twin-differs; for -o: output-differs, another text or
another document): \`orz-paged extract x.paged.html -o x.browser.paged.md\`, merge that into
x.paged.md, then the assemble command the refusal names (your arguments and --replaces). When
only the file changed (x.paged.md is what orz-paged last synced) and both texts carry the same
uid, the refusal names plain \`orz-paged extract x.paged.html\` — only while x.paged.md's pair is
the last orz-paged synced the file with (after \`assemble b.paged.md -o x.paged.html\` it is not).
Without a shared uid the file may hold another document's text (copied over it), so the
refusal names \`extract x.paged.html -o x.browser.paged.md\` instead (compare, merge). An output holding another
document (another uid) is refused with no next: choose another -o path. When x.paged.md has
everything, --force replaces it and keeps the old file as x.paged.html~ (or ~1, ~2, ...).`,
  extract: `orz-paged extract <file.paged.html> [-o out.paged.md] [--replaces <sha256>] [--force] [--json]

Writes the exact text twin of an assembled file: x.paged.html -> x.paged.md, byte for byte the
text that was assembled (CR LF and BOM kept). A 0.x file (made before 1.0) is
refused: use \`orz-paged upgrade <file>\`, which writes its text twin. Warns
when the file was cut off (the text may be incomplete).

Replaces an existing x.paged.md (or -o output) that holds a different text (no --force
needed) only when it is a known state AND x.paged.md and the file's text carry the same uid
(the same document: without one, the file may be another document's, copied over it) —
so no edit made to it is lost, whichever file is newer:
  - exactly the text orz-paged last wrote or read for this pair (unchanged since, line
    endings included), while this pair is the last orz-paged synced the file with, or
  - (x.paged.md, the file's own twin, only) its last commit, its staged version or one of its
    20 most recent commits in git (a full clone; in a shallow checkout use --replaces).
    A text equal to one of them counts as known, so a deliberate revert of x.paged.md to such
    a text is replaced — commit the revert first, or
  - with --replaces <sha256>: exactly the x.paged.md with that SHA-256 (\`sha256sum x.paged.md\`,
    the "sha256" the last command printed, or of \`orz-paged inspect x.paged.md --json\`);
    with --replaces, nothing else counts.
Never (without --force) when x.paged.md holds another document (another uid): output-differs.
Otherwise it refuses (x.paged.md may hold edits the file lacks): extract to another name,
\`orz-paged extract x.paged.html -o x.browser.paged.md\`, and merge the two into x.paged.md.
--force replaces it anyway and keeps the old text as x.paged.md~ (or ~1, ~2, ...). An empty
file is reported as empty (damaged), not extracted.`,
  upgrade: `orz-paged upgrade <old.paged.html> [-o out.paged.html] [--text out.paged.md | --no-text] [--cdn | --inline] [--force] [--json]

Turns an orz-paged file into a file of this version. A 0.x file: its source is kept
exactly; its settings block ({{nyml kind: document}}, wherever it was) and a kind: meta
block become one header at the top (with carrier: paged and a uid), and the
0.x file's metadata (#orz-meta) and title move into it. A 1.x file: re-assembled with this version, text and includes unchanged.
Writes the file in place (or to -o) and its text twin (twin of the output, or --text;
--no-text skips it). Keeps the old file's delivery (--cdn / --inline to choose). Also
repairs a damaged shell or engine (the text must be intact).
Refuses (unless --force) a file whose shell is newer than this tool (a downgrade), a
file cut off inside its text (#orz-src not closed: the text may be incomplete), -o onto
another document, and an existing text twin that differs (unless it is a known state,
as for extract): for a 0.x file next to its own text, \`--text x.browser.paged.md\` and merge.
--force keeps each replaced file as <file>~. A 0.x file upgraded in place is kept as
<file>~ (or <file>~1, ~2, ...).`,
  inspect: `orz-paged inspect <file> [--json]

Diagnoses a text twin, an assembled file, a 0.x file or any HTML: kind, text format,
shell version and how it compares to this tool, delivery, uid, title, theme, header
keys, the paged settings, includes, header lint, the file's structure (island, end, engine), the SHA-256
of the text it holds (the --replaces token), whether its sibling twin (x.paged.md <->
x.paged.html) holds the same text (and that text's SHA-256) and which is newer, and advice
(the commands to run). Human-readable by default; --json prints the report object.`,
  themes: `orz-paged themes [--json]

Lists the print theme ids a header's \`theme\` key may name (the default is marked).`,
  templates: `orz-paged templates [--json]

Lists the document templates: the ids \`orz-paged new --template\` and a header's
\`template\` key take (the header's template sets layout defaults only), by group.`,
};

// ── arguments ───────────────────────────────────────────────────────────────

type Spec = Record<string, 'value' | 'flag'>;

interface Parsed {
  positional: string[];
  values: Record<string, string>;
  flags: Set<string>;
}

const COMMON: Spec = { '--json': 'flag', '--help': 'flag', '-h': 'flag', '--force': 'flag' };
const ALIASES: Record<string, string> = { '-o': '--out', '-h': '--help' };
const SPECS: Record<string, Spec> = {
  new: { ...COMMON, '--template': 'value', '--title': 'value', '--theme': 'value', '--html': 'flag', '--cdn': 'flag', '--inline': 'flag' },
  assemble: { ...COMMON, '--out': 'value', '-o': 'value', '--cdn': 'flag', '--inline': 'flag', '--resolve-includes': 'flag', '--no-includes': 'flag', '--replaces': 'value' },
  extract: { ...COMMON, '--out': 'value', '-o': 'value', '--replaces': 'value' },
  upgrade: { ...COMMON, '--out': 'value', '-o': 'value', '--text': 'value', '--no-text': 'flag', '--cdn': 'flag', '--inline': 'flag' },
  inspect: { ...COMMON },
  themes: { ...COMMON },
  templates: { ...COMMON },
};
/** Options of 0.x `orz-paged <file.md>` that set content: removed, the header holds it. */
const CONTENT_OPTIONS = ['--theme', '--title', '--author', '--uid', '--page-size', '--lang'];

/** The text twin name for a 0.x `-o` value or a template id (`notes.md` → `notes.paged.md`, `exam-page` → `exam-page.paged.md`). */
const pagedTextName = (name: string): string => (/\.paged\.md$/i.test(name) ? name : `${name.replace(/\.(md|markdown)$/i, '')}.paged.md`);

/**
 * The 0.x forms of the default command (`orz-paged --template <t>`,
 * `--new <t>`, `--list-templates`): refused with the 1.0 command that does
 * the same (`next`), exit 2. Null when `argv` uses none of them.
 */
function legacyForm(argv: string[]): CliError | null {
  const at = (flag: string): number => argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  const valueOf = (flag: string): string | undefined => {
    const i = at(flag);
    if (i < 0) return undefined;
    return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
  };
  if (at('--list-templates') >= 0) {
    return new CliError('--list-templates is gone since 1.0: `orz-paged templates` lists the templates', EXIT_USAGE, { command: 'templates', args: [] });
  }
  const out = valueOf('-o') ?? valueOf('--out');
  const newT = valueOf('--new');
  if (at('--new') >= 0) {
    if (newT === undefined || newT.startsWith('-')) return new CliError('--new needs a template id; since 1.0 the command is `orz-paged new <file.paged.md> --template <id>` (`orz-paged templates` lists them)', EXIT_USAGE);
    const file = pagedTextName(out ?? newT);
    return new CliError(`--new is gone since 1.0: \`orz-paged new ${sh(file)} --template ${sh(newT)}\` writes the starter text of a template (with a fresh document id); edit it, then \`orz-paged assemble ${sh(file)}\``, EXIT_USAGE, { command: 'new', args: [file, '--template', newT] });
  }
  const tpl = valueOf('--template');
  if (at('--template') >= 0) {
    if (tpl === undefined || tpl.startsWith('-')) return new CliError('--template needs a template id; since 1.0 a template starts a new text: `orz-paged new <file.paged.md> --template <id>` (`orz-paged templates` lists them)', EXIT_USAGE);
    const skip = new Set<number>();
    for (const f of ['--template', '-o', '--out']) { const i = at(f); if (i >= 0) { skip.add(i); if (!argv[i].includes('=')) skip.add(i + 1); } }
    const input = argv.find((a, i) => !skip.has(i) && !a.startsWith('-'));
    if (input !== undefined) {
      return new CliError(`--template is not an assemble option since 1.0: a text names its template in its header. Put \`template: ${tpl}\` in the {{nyml}} header at the top of ${input} (it sets layout defaults only), then \`orz-paged assemble ${sh(input)}\`; a NEW text from a template: \`orz-paged new <file.paged.md> --template ${sh(tpl)}\``, EXIT_USAGE);
    }
    const file = pagedTextName(out ? out.replace(/\.paged\.html?$/i, '').replace(/\.html?$/i, '') : tpl);
    const delivery = argv.includes('--cdn') ? ['--cdn'] : [];
    return new CliError(`--template is gone since 1.0: \`orz-paged new ${sh(file)} --template ${sh(tpl)} --html${delivery.length ? ' --cdn' : ''}\` writes the template's starter text (${file}) and its file`, EXIT_USAGE, { command: 'new', args: [file, '--template', tpl, '--html', ...delivery] });
  }
  return null;
}

function parse(command: string, argv: string[]): Parsed {
  const spec = SPECS[command];
  const out: Parsed = { positional: [], values: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === '--') { out.positional.push(...argv.slice(i + 1)); break; }
    if (!raw.startsWith('-') || raw === '-') { out.positional.push(raw); continue; }
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const name = eq > 0 ? raw.slice(0, eq) : raw;
    const kind = spec[name];
    const key = ALIASES[name] ?? name;
    if (!kind) {
      if (command === 'assemble' && CONTENT_OPTIONS.includes(name)) {
        const what = name.slice(2);
        throw new CliError(
          `${name} is not an assemble option: since 1.0 the ${what} comes from the text itself. `
          + `Put \`${what}: …\` in the {{nyml}} header at the top of the text (or create the text with \`orz-paged new ${name} …\`), then assemble again.`,
          EXIT_USAGE,
        );
      }
      throw new CliError(`unknown option ${name} for \`orz-paged ${command}\` (see \`orz-paged ${command} --help\`)`, EXIT_USAGE);
    }
    if (kind === 'flag') {
      if (eq > 0) throw new CliError(`${name} takes no value`, EXIT_USAGE);
      out.flags.add(key);
    } else {
      const value = eq > 0 ? raw.slice(eq + 1) : argv[++i];
      if (value === undefined || (eq < 0 && value.startsWith('-') && value !== '-')) throw new CliError(`${name} needs a value`, EXIT_USAGE);
      out.values[key] = value;
    }
  }
  if (out.flags.has('--cdn') && out.flags.has('--inline')) throw new CliError('--cdn and --inline exclude each other', EXIT_USAGE);
  return out;
}

const one = (p: Parsed, what: string, command: string): string => {
  if (p.positional.length === 0) throw new CliError(`\`orz-paged ${command}\` needs ${what} (see \`orz-paged ${command} --help\`)`, EXIT_USAGE);
  if (p.positional.length > 1) throw new CliError(`\`orz-paged ${command}\` takes one ${what}, got ${p.positional.length}: ${p.positional.join(' ')}`, EXIT_USAGE);
  return p.positional[0];
};

// ── files ───────────────────────────────────────────────────────────────────

/**
 * The file a text assembles to by default: the twin of `x.paged.md`
 * (`x.paged.html`, FC-18 §3), and for a plain Markdown text `x.md` (the 0.x
 * habit) `x.paged.html` too; null for any other name (`-o` names it).
 */
function outputOf(name: string): string | null {
  if (/\.paged\.md$/i.test(name)) return twinName(name);
  if (/\.md$/i.test(name) && kindFromFilename(name) === 'md') return name.replace(/\.md$/i, '.paged.html');
  return null;
}

/** The user's own `assemble` options (output, delivery, includes), repeated by every suggested command. */
const callOf = (p: Parsed): AssembleCall => ({
  ...(p.values['--out'] !== undefined ? { out: p.values['--out'] } : {}),
  ...(p.flags.has('--cdn') ? { delivery: 'cdn' as const } : p.flags.has('--inline') ? { delivery: 'inline' as const } : {}),
  resolveIncludes: p.flags.has('--resolve-includes'),
  noIncludes: p.flags.has('--no-includes'),
});

/** `orz-paged <command> <args…>` for a message (the same words as `next`). */
const commandLine = (n: Next): string => NODE.commandLine(n);

const errors = (lint: Lint[]): string[] => lint.filter((l) => l.level === 'error').map((l) => `header: ${l.message} (${l.code}${l.line ? `, line ${l.line}` : ''})`);
const warnings = (lint: Lint[]): string[] => lint.filter((l) => l.level === 'warning').map((l) => `header: ${l.message} (${l.code}${l.line ? `, line ${l.line}` : ''})`);

const delivery = (p: Parsed, fallback: 'inline' | 'cdn' = 'inline'): 'inline' | 'cdn' => (p.flags.has('--cdn') ? 'cdn' : p.flags.has('--inline') ? 'inline' : fallback);


// ── commands ────────────────────────────────────────────────────────────────

function cmdNew(p: Parsed, o: Io): void {
  if (p.positional.length > 1) throw new CliError(`\`orz-paged new\` takes at most one file, got ${p.positional.length}`, EXIT_USAGE);
  const file = p.positional[0];
  const force = p.flags.has('--force');
  let text: string;
  try {
    text = newDocument({
      ...(p.values['--template'] !== undefined ? { template: p.values['--template'] } : {}),
      ...(p.values['--title'] !== undefined ? { title: p.values['--title'] } : {}),
      ...(p.values['--theme'] !== undefined ? { theme: p.values['--theme'] } : {}),
      date: letterDate(new Date()), // a letter starts dated today (D-97)
    });
  } catch (e) {
    const m = (e as Error).message;
    throw new CliError(`${m.replace(/^orz-paged: /, '').replace(/ \([^)]*\)$/, /unknown template/.test(m) ? '' : '$&')}${/unknown theme/.test(m) ? ` (themes: ${THEME_INFO.map((t) => t.id).join(', ')})` : /unknown template/.test(m) ? ` (templates: ${TEMPLATES.map((t) => t.id).join(', ')}; \`orz-paged templates\` describes them)` : ''}`, EXIT_USAGE);
  }
  const info = readDocument(text, { kind: 'paged' });
  const facts = { kind: 'paged', format: info.format, uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, themeEffective: presentationOf(text).theme, template: info.header?.fields['template'] ?? null, sha256: sha256(text) };
  if (!file) {
    if (p.flags.has('--html')) throw new CliError('--html needs a file name (orz-paged new notes.paged.md --html)', EXIT_USAGE);
    if (o.json) emit(o, { command: 'new', file: null, html: null, ...facts, text });
    else process.stdout.write(text);
    return;
  }
  const path = resolve(file);
  const k = kindFromFilename(path);
  if (k !== 'paged' || !/\.paged\.md$/i.test(path)) {
    throw new CliError(k === 'slides' ? `${file} names an orz slides document: use orz-slides` : `${file}: a paged text twin's name ends in .paged.md (e.g. ${pagedTextName(basename(file).replace(/\.html?$/i, '').replace(/\.paged$/i, ''))})`, EXIT_USAGE);
  }
  const htmlPath = p.flags.has('--html') ? twinName(path)! : null;
  const present = [path, htmlPath].filter((f): f is string => f !== null && existsSync(f));
  if (!force && present.length > 0) throw new CliError(`${present[0]} already exists; not overwritten (pass --force to replace it; the old file is kept as ${present[0]}~)`, 'exists');
  const html = htmlPath ? assemble(text, { delivery: delivery(p) }) : null;
  // --force: every file replaced is kept as <file>~ first (nothing is written if a copy fails)
  const backups = present.map((f) => backup(f, o));
  writeOut(path, text);
  o.say(`Wrote ${path}`);
  if (htmlPath && html !== null) {
    writeOut(htmlPath, html);
    NODE.rememberPair(path, htmlPath, storedText(text), text, o, { command: 'assemble', sha: sha256(storedText(text)) });
    o.say(`Wrote ${htmlPath} (${delivery(p)})`);
  }
  emit(o, { command: 'new', file: path, html: htmlPath, ...facts, ...(htmlPath ? { delivery: delivery(p), shell: VERSION } : {}), backups });
}

/**
 * Whether `text` is the document text a 0.x file holds (D-120, D-90 as in
 * orz-mdhtml): its source as `upgrade` reads it, or its raw island as the
 * kit's reader gives it (they differ only in the 0.x escapes and the final
 * line break). The title, metadata and settings such a file keeps outside
 * the text are not in it.
 */
function holdsLegacySource(text: string, html: string, legacy: { text: string }): boolean {
  const t = storedText(text);
  return t === storedText(legacy.text) || t === NODE.documentTextOf(html);
}

function cmdAssemble(p: Parsed, o: Io): void {
  const file = one(p, 'a text file (file.paged.md)', 'assemble');
  const input = resolve(file);
  const kind = kindFromFilename(input);
  if (kind === 'slides') throw new CliError(`${file} is an orz slides text: use orz-slides`, 'other-kind');
  const resolveFlag = p.flags.has('--resolve-includes');
  if (resolveFlag && p.flags.has('--no-includes')) throw new CliError('--resolve-includes and --no-includes exclude each other', EXIT_USAGE);
  const token = replacesToken(p.values['--replaces']);
  const text = readText(input);
  if (looksHtml(text) && NODE.documentTextOf(text) !== null) {
    throw new CliError(`${file} is an assembled file, not a text: \`orz-paged extract ${sh(file)}\` gives its text; \`orz-paged upgrade ${sh(file)}\` re-assembles it with this version`, 'assembled-input', { command: 'extract', args: [file] });
  }
  const outArg = p.values['--out'];
  const toStdout = outArg === '-';
  if (toStdout && o.json) throw new CliError('-o - (stdout) and --json exclude each other', EXIT_USAGE);
  const out = toStdout ? null : outArg !== undefined ? resolve(outArg) : outputOf(input);
  if (!toStdout && out === null) throw new CliError(`cannot name the output of ${file} (a text twin's name ends in .paged.md, or a Markdown text's in .md): pass -o out.paged.html`, EXIT_USAGE);
  if (out === input) throw new CliError('the output would overwrite the input', EXIT_USAGE);
  // the kind: a .paged.md name says paged; any other name: the header's carrier, else paged
  const info = readDocument(text, kind === 'paged' ? { kind: 'paged' } : {});
  if (info.kind !== 'paged') throw new CliError(`${file}: the header says carrier: ${info.kind}; use ${info.kind === 'md' ? 'orz-mdhtml' : `orz-${info.kind}`}`, 'other-kind');
  if (info.format > 1) throw new CliError(`${file} was written for a newer orz-paged (its header says format: ${info.format}; this version reads format 1); use a newer orz-paged (\`npx ${commandLine({ command: 'assemble', args: assembleArgs(callOf(p), file) }).replace(/^orz-paged /, 'orz-paged@latest ')}\`)`, 'newer-format');
  const force = p.flags.has('--force');

  // the existing output: may it be replaced, and which includes and delivery does it hold?
  const exists = out !== null && existsSync(out);
  const existing = exists ? readMaybe(out!) : null;
  const names = { input: NODE.shown(input, file), out: out === null ? '-' : NODE.shown(out, outArg ?? outputOf(file) ?? undefined), twin: out !== null && out === outputOf(input) };
  const prior = existing !== null && looksHtml(existing) ? extract(existing) : null;
  const legacyFile = existing !== null && looksHtml(existing) ? readLegacy(existing) : null;
  const priorLegacy = prior === null ? legacyFile : null;
  // a 0.x file holding this very text (D-120): assemble would drop the title, metadata and settings it keeps outside
  // the text; upgrade moves them into the text's header (the text below it is kept)
  const legacySame = legacyFile !== null && token === null && holdsLegacySource(text, existing!, legacyFile);
  const legacyRisk: Risk | null = !legacySame ? null : (() => {
    const up: Next = { command: 'upgrade', args: names.twin ? [names.out] : [names.out, '--text', names.input] };
    return {
      message: `${names.out} is an orz-paged 0.x file (made before 1.0) holding this very text: assembling would drop the title, metadata and settings it keeps outside the text; not replaced. \`${commandLine(up)}\` adds them to ${names.input} as a header at the top (the text below it is kept) and re-assembles ${names.out} from it (or pass --force to assemble anyway: the old file is kept as ${names.out}~)`,
      reason: 'legacy-file',
      next: up,
    };
  })();
  const check = legacyRisk !== null ? { risk: legacyRisk, earlier: null } : exists ? NODE.assembledOutputCheck({ input, out: out!, text, names, token, call: callOf(p) }, existing) : { risk: null, earlier: null };
  // the delivery: as asked (--cdn / --inline), else the existing file's (as upgrade and browser saves keep it), else inline
  const d = delivery(p, prior?.delivery === 'cdn' || priorLegacy?.delivery === 'cdn' ? 'cdn' : 'inline');
  // a file made by a newer orz-paged: re-assembling here would downgrade its shell (as upgrade refuses)
  const newerShell = prior && prior.kind === 'paged' && prior.shell && compareSemver(prior.shell, VERSION) === 1 ? prior.shell : null;
  const shellRisk: Risk | null = newerShell === null ? null : {
    message: `${names.out} was made by a newer orz-paged (${newerShell}) than this tool (${VERSION}): assembling here would replace its shell with an older one; not replaced. Use \`npx ${commandLine({ command: 'assemble', args: assembleArgs(callOf(p), names.input) }).replace(/^orz-paged /, 'orz-paged@latest ')}\` (or pass --force: the old file is kept as ${names.out}~)`,
    reason: 'newer-shell',
  };
  if (!force) for (const r of [check.risk, shellRisk]) if (r !== null) throw new CliError(r.message, r.reason, r.next);

  // includes (FC-18 §8.3): the existing file's record kept for the directives the text still has; --resolve-includes
  // reads file includes from the text's folder; stale records and unresolved directives are named (the kit's plan)
  const plan = includePlan(text, {
    folder: dirname(input),
    held: prior?.includes ?? null,
    keep: !p.flags.has('--no-includes'),
    resolve: resolveFlag,
    outName: names.out,
    resolveCommand: commandLine({ command: 'assemble', args: assembleArgs(callOf(p), names.input, ['--resolve-includes']) }),
  });
  for (const w of plan.warnings) o.warn(w);
  const { includes, resolved, unresolved, stale } = plan;

  let html: string;
  // the existing file's twin-link naming (#orz-shell "links", FC-18 §8.2; a host's page names): kept, as browser saves keep it
  const twinLinks = prior !== null && prior.kind === 'paged' ? prior.twinLinks : undefined;
  try { html = assemble(text, { delivery: d, ...(Object.keys(includes).length ? { includes } : {}), ...(twinLinks ? { twinLinks } : {}) }); } catch (e) {
    const message = (e as Error).message.replace(/^orz-paged: /, '');
    throw new CliError(`${file}: ${message}`, NODE.libReason(message));
  }
  for (const w of errors(info.lint)) o.warn(w);
  for (const w of warnings(info.lint)) o.warn(w);
  if (toStdout) { process.stdout.write(html); return; }
  const backedUp = check.risk !== null || shellRisk !== null ? backup(out!, o) : null;
  if (shellRisk !== null) o.warn(`${names.out} had a newer shell (orz-paged ${newerShell}); --force re-assembled it with this older one (${VERSION})`);
  writeOut(out!, html);
  const stored = storedText(text);
  const hash = sha256(stored);
  NODE.rememberPair(input, out!, stored, text, o, { command: 'assemble', sha: hash });
  const n = Object.keys(includes).length;
  o.say(`Wrote ${out} (${d}${!p.flags.has('--cdn') && !p.flags.has('--inline') && prior !== null ? ' as before' : ''}, orz-paged ${VERSION}${n ? `, ${n} include${n === 1 ? '' : 's'}` : ''})`);
  if (check.earlier !== null) o.say(`  (it held ${check.earlier === 'token' ? 'the text you named with --replaces' : `an earlier text of ${basename(input)}: ${NODE.earlierSource[check.earlier]}`})`);
  o.say(`  sha256 ${hash} (pass it as --replaces to update this file later without --force)`);
  emit(o, { command: 'assemble', input, output: out, kind: 'paged', format: info.format, shell: VERSION, delivery: d, uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, themeEffective: presentationOf(text).theme, template: info.header?.fields['template'] ?? null, includes: n, resolved, unresolved, stale, backup: backedUp, replaced: check.earlier, sha256: hash, bytes: Buffer.byteLength(html, 'utf8') });
}

function cmdExtract(p: Parsed, o: Io): void {
  const file = one(p, 'an assembled file (file.paged.html)', 'extract');
  const input = resolve(file);
  const token = replacesToken(p.values['--replaces']);
  const html = readText(input);
  const outArg = p.values['--out'];
  const legacy = readLegacy(html);
  const ex = legacy ? null : extract(html);
  if (legacy) {
    // upgrade writes the text twin of the file unless --text: next to an existing text, to another name (then merge)
    const textTarget = outArg !== undefined && outArg !== '-' ? outArg : twinName(file) ?? undefined;
    const taken = textTarget !== undefined && existsSync(resolve(textTarget));
    const textArgs = textTarget === undefined ? [] : taken ? ['--text', NODE.otherName(textTarget)] : outArg !== undefined && outArg !== '-' ? ['--text', outArg] : [];
    const next: Next = { command: 'upgrade', args: [file, ...textArgs] };
    throw new CliError(`${file} was made by orz-paged ${legacy.version ?? '0.x'}, before 1.0: run \`${commandLine(next)}\` — it writes the document's text${taken ? ` to ${textArgs[1]} (${textTarget} exists: compare and merge the two)` : ' twin'} (the source exactly, its settings and metadata moved into the header at the top) and makes the file one of this version`, 'legacy-file', next);
  }
  if (!ex) {
    if (html.trim() === '') throw new CliError(`${file} is empty (${statSync(input).size} bytes): a damaged or unfinished file, it holds no text to extract — look for its text twin or a backup (${file}~)`, 'not-orz');
    throw new CliError(`${file} holds no orz document (no #orz-src island); \`orz-paged inspect ${sh(file)}\` says what it is`, 'not-orz', { command: 'inspect', args: [file] });
  }
  if (ex.shell === '') o.warn(`${file} has an #orz-src island but no #orz-shell: an unknown writer; the island was read as format 1 would be — check the text`);
  else if (inspect(html).checks?.island === 'unclosed') o.warn(`${file} was cut off: its #orz-src island is not closed, so the text may be incomplete — compare it with a backup before relying on it`);
  const toStdout = outArg === '-';
  if (toStdout && o.json) throw new CliError('-o - (stdout) and --json exclude each other', EXIT_USAGE);
  if (toStdout) { process.stdout.write(ex.text); return; }
  const out = outArg !== undefined ? resolve(outArg) : twinName(input);
  if (out === null) throw new CliError(`cannot name the text twin of ${file} (an assembled file's name ends in .paged.html): pass -o out.paged.md`, EXIT_USAGE);
  if (out === input) throw new CliError('the output would overwrite the input', EXIT_USAGE);
  const names = { out: NODE.shown(out, outArg ?? twinName(file) ?? undefined), file };
  const other = NODE.otherName(names.out);
  const outArgs = outArg !== undefined ? ['-o', outArg] : [];
  const check = NODE.textOutputCheck({ out, text: ex.text, file: input, names, token, uid: NODE.uidOf(ex.text), advice: (h) => {
    const pull: Next = { command: 'extract', args: [file, '-o', other] };
    return {
      message: `If ${names.out} has edits of its own, extract to another name and merge the two: \`${commandLine(pull)}\`.${h ? ` When ${names.out} holds no edit you want to keep, \`${commandLine({ command: 'extract', args: [file, ...outArgs, '--replaces', h] })}\` replaces it while it still holds that text;` : ''} --force replaces it anyway (the old text is kept as ${names.out}~)`,
      next: pull,
    };
  } });
  const backedUp = NODE.guard(out, check.risk, p.flags.has('--force'), o);
  writeOut(out, ex.text);
  const hash = sha256(ex.text);
  NODE.rememberPair(out, input, ex.text, ex.text, o, { command: 'extract', sha: hash });
  const info = readDocument(ex.text, { kind: ex.kind });
  o.say(`Wrote ${out} (${ex.kind}, text format ${ex.format}, from orz-${ex.kind === 'md' ? 'mdhtml' : ex.kind} ${ex.shell || 'unknown'})`);
  if (check.earlier !== null) o.say(`  (${names.out} held ${check.earlier === 'token' ? 'the text you named with --replaces' : `a known state: ${NODE.earlierSource[check.earlier]}`})`);
  o.say(`  sha256 ${hash} (pass it as --replaces to overwrite this text later without --force)`);
  emit(o, { command: 'extract', input, output: out, kind: ex.kind, format: ex.format, shell: ex.shell || null, delivery: ex.delivery || null, uid: info.meta.uid ?? null, title: info.title, includes: ex.includes ? Object.keys(ex.includes).length : 0, backup: backedUp, replaced: check.earlier, sha256: hash, bytes: Buffer.byteLength(ex.text, 'utf8') });
}

function cmdUpgrade(p: Parsed, o: Io): void {
  const file = one(p, 'a file (old.paged.html)', 'upgrade');
  const input = resolve(file);
  const html = readText(input);
  const legacy = readLegacy(html);
  const ex = legacy ? null : extract(html);
  const oldDelivery: 'inline' | 'cdn' = legacy ? (legacy.delivery ?? 'inline') : ex?.delivery === 'cdn' ? 'cdn' : 'inline';
  const d = delivery(p, oldDelivery);
  const force = p.flags.has('--force');
  const out = p.values['--out'] !== undefined ? resolve(p.values['--out']) : input;
  const outName = NODE.shown(out, p.values['--out'] ?? file);
  // a newer shell (a downgrade) and a file cut off inside its text: refused unless --force
  const newerShell = ex && ex.kind === 'paged' && ex.shell && compareSemver(ex.shell, VERSION) === 1 ? ex.shell : null;
  if (newerShell !== null && !force) {
    throw new CliError(`${file}: the file's shell (orz-paged ${newerShell}) is newer than this tool (${VERSION}); upgrading would downgrade it. Use \`npx orz-paged@latest upgrade ${file}\`, or pass --force to re-assemble it with this older shell anyway (the old file is kept as ${outName}~)`, 'newer-shell');
  }
  const cut = ex !== null && ex.kind === 'paged' && ex.shell !== '' && inspect(html).checks?.island === 'unclosed';
  const recovered = `${file.replace(/\.paged\.html$/i, '').replace(/\.html?$/i, '')}.recovered.paged.md`;
  if (cut && !force) {
    throw new CliError(`${file} was cut off inside its text (#orz-src is not closed): the text may be incomplete, and upgrading would make that the file's whole text; not upgraded. Recover what you can: \`orz-paged extract ${file} -o ${recovered}\`, compare it with the text twin or a backup; --force upgrades it anyway (the old file is kept as ${outName}~)`, 'unclosed-island', { command: 'extract', args: [file, '-o', recovered] });
  }
  let r: ReturnType<typeof upgrade>;
  try { r = upgrade(html, { delivery: d, ...(force ? { downgrade: true } : {}) }); } catch (e) {
    const message = (e as Error).message.replace(/^orz-paged( upgrade)?: /, '');
    throw new CliError(`${file}: ${message}`, NODE.libReason(message));
  }
  if (p.flags.has('--no-text') && p.values['--text'] !== undefined) throw new CliError('--text and --no-text exclude each other', EXIT_USAGE);
  const textOut = p.flags.has('--no-text') ? null : p.values['--text'] !== undefined ? resolve(p.values['--text']) : twinName(out);
  if (!p.flags.has('--no-text') && textOut === null) throw new CliError(`cannot name the text twin of ${out}: pass --text out.paged.md (or --no-text)`, EXIT_USAGE);
  if (textOut === out || textOut === input) throw new CliError('the text twin would overwrite the file', EXIT_USAGE);
  // check every output before writing any
  let outRisk: Risk | null = null;
  if (out !== input && existsSync(out)) {
    const existing = readMaybe(out);
    const held = existing !== null && looksHtml(existing) ? NODE.documentTextOf(existing) : null;
    if (held === null) outRisk = { message: `${outName} exists and is not an orz file; not overwritten (pass --force, or -o another path)`, reason: 'not-orz' };
    else if (held !== r.text) outRisk = { message: `${outName} exists and holds another text; not overwritten (pass --force, or -o another path)`, reason: 'output-differs' };
  }
  const textName = textOut === null ? '' : NODE.shown(textOut, p.values['--text'] ?? twinName(outName) ?? undefined);
  const otherText = NODE.otherName(textName);
  // the upgraded text's uid — unless upgrade minted it for a 0.x file without one (then it says nothing about identity)
  const newUid = NODE.uidOf(r.text);
  const ownUids = legacy ? [NODE.uidOf(legacy.text), legacy.meta?.uid].map((u) => (typeof u === 'string' ? u.trim() : null)) : [newUid];
  // a 0.x file next to its own source (the same text): the twin gets the header, its text is kept — nothing to
  // merge, so it is replaced as upgrade's own state (D-90, D-120; as orz-mdhtml)
  const twinNow = legacy && textOut !== null && existsSync(textOut) ? readMaybe(textOut) : null;
  const twinIsSource = twinNow !== null && !looksHtml(twinNow) && holdsLegacySource(twinNow, html, legacy!);
  const textCheck = twinIsSource ? { risk: null, earlier: null } : textOut ? NODE.textOutputCheck({ out: textOut, text: r.text, file: out, names: { out: textName, file: outName }, token: null, uid: newUid !== null && ownUids.includes(newUid) ? newUid : null, advice: () => ({
    message: legacy
      ? `Upgrade to another name instead: \`${commandLine({ command: 'upgrade', args: [file, ...(p.values['--out'] !== undefined ? ['-o', outName] : []), ...(p.flags.has('--cdn') ? ['--cdn'] : p.flags.has('--inline') ? ['--inline'] : []), '--text', otherText] })}\`, then compare ${otherText} with ${textName}, merge what you keep into ${textName} (keep the new header), and \`${commandLine({ command: 'assemble', args: [textName, ...(twinName(textName) === outName ? [] : ['-o', outName])] })} --replaces <sha256>\` with the sha256 that upgrade prints (the text ${outName} then holds); or --no-text, or --force (the old text is kept as ${textName}~)`
      : `Pass --text ${otherText} (then merge), --no-text, or --force to replace it (the old text is kept as ${textName}~)`,
    next: { command: 'upgrade', args: [file, ...(p.values['--out'] !== undefined ? ['-o', outName] : []), ...(p.flags.has('--cdn') ? ['--cdn'] : p.flags.has('--inline') ? ['--inline'] : []), '--text', otherText] },
  }) }) : { risk: null, earlier: null };
  if (!force) for (const risk of [outRisk, textCheck.risk]) if (risk !== null) throw new CliError(risk.message, risk.reason, risk.next);
  const backups: string[] = [];
  // replaced in place: a newer shell, a cut file, or a 0.x file (its text was converted) is kept as ~ (D-92, as orz-slides)
  if (out === input && (newerShell !== null || cut)) backups.push(backup(input, o));
  else if (out === input && legacy !== null) backups.push(backup(input, { warn: () => undefined }));
  const ob = NODE.guard(out, outRisk, force, o);
  if (ob) backups.push(ob);
  if (textOut) { const tb = NODE.guard(textOut, textCheck.risk, force, o); if (tb) backups.push(tb); }
  if (newerShell !== null) o.warn(`${file} had a newer shell (orz-paged ${newerShell}); --force re-assembled it with this older one (${VERSION})`);
  if (cut) o.warn(`${file} was cut off inside its text; --force upgraded it with the text it holds, which may be incomplete`);
  writeOut(out, r.html);
  const held = extract(r.html)?.text ?? r.text;
  if (textOut) { writeOut(textOut, r.text); NODE.rememberPair(textOut, out, held, r.text, o, { command: 'assemble', sha: sha256(held) }); }
  // what needs a look is a warning; the normal steps of a 0.x conversion are notes (D-108)
  for (const n of r.warnings) o.warn(n);
  const info = readDocument(r.text);
  o.say(`Upgraded ${input}${out !== input ? ` -> ${out}` : ''} (from ${r.from === 'legacy' ? `orz-paged ${legacy?.version ?? '0.x'}` : `orz-paged ${ex?.shell ?? '?'}`} to ${VERSION}, ${d})`);
  if (textOut) o.say(`Wrote ${textOut} (the text twin${twinIsSource ? '; it held this file\'s source, which it keeps, now with a header at the top' : ''})`);
  const moved = Object.keys(r.moved);
  if (moved.length > 0) o.say(`Moved into the header: ${moved.join(', ')}`);
  for (const n of r.notes) if (!r.warnings.includes(n)) o.say(`  note: ${n}`);
  if (out === input && legacy !== null && backups[0]) o.say(`Kept the 0.x file as ${backups[0]}`);
  o.say(`  sha256 ${sha256(held)} (pass it as --replaces to update this file later without --force)`);
  emit(o, { command: 'upgrade', input, output: out, text: textOut, from: r.from, previous: r.from === 'legacy' ? legacy?.version ?? null : ex?.shell ?? null, shell: VERSION, delivery: d, uid: info.meta.uid ?? null, title: info.title, moved: r.moved, notes: r.notes, backups, sha256: sha256(held) });
}

function humanInspect(file: string, r: InspectReport): string {
  const rows: Array<[string, string]> = [['file', file]];
  const inputs: Record<InspectReport['input'], string> = { text: 'a text (twin or plain Markdown)', assembled: 'an assembled file (orz-paged 1.0 or later)', legacy: 'an orz-paged 0.x file (made before 1.0)', html: 'HTML that is not an orz document' };
  rows.push(['input', inputs[r.input]]);
  if (r.kind) rows.push(['kind', `${r.kind}${r.format !== null ? `, text format ${r.format}` : ''}`]);
  if (r.shell) rows.push(['shell', `orz-paged ${r.shell.version} (${r.shell.relation === 'same' ? 'this version' : r.shell.relation === 'older' ? `older than this tool, ${VERSION}` : r.shell.relation === 'newer' ? `newer than this tool, ${VERSION}` : 'unknown'}), ${r.shell.delivery} delivery`]);
  if (r.legacy) {
    const where = { header: 'at the top', body: 'in the body (upgrade moves it to the top)', none: 'none' };
    rows.push(['legacy', `orz-paged ${r.legacy.version ?? '0.x'}, ${r.legacy.delivery ?? 'unknown'} delivery${r.legacy.metaKeys.length ? `, #orz-meta: ${r.legacy.metaKeys.join(', ')}` : ''}; settings block ${where[r.legacy.settings]}, kind: meta block ${where[r.legacy.meta]}`]);
  }
  if (r.kind) {
    rows.push(['uid', r.uid ?? '(none)']);
    rows.push(['title', r.title ?? '']);
    rows.push(['theme', r.theme ?? `(default: ${DEFAULT_THEME})`]);
    if (r.kind === 'paged') rows.push(['template', r.template ?? '(none)']);
    const settings = Object.entries(r.settings).filter(([k]) => k !== 'theme' && k !== 'template');
    if (settings.length) rows.push(['settings', settings.map(([k, v]) => `${k}: ${v}`).join('; ')]);
    if (r.header) rows.push(['header', r.header.present ? `${r.header.keys.join(', ')}${r.header.legacy ? ` (legacy ${r.header.legacy} block)` : ''}` : '(none)']);
    if (r.input === 'assembled') rows.push(['includes', String(r.includes)]);
    if (r.checks) {
      const engine = { same: 'this release\'s engine', different: 'an engine that is not its release\'s', unverified: 'engine not verified', cdn: 'engine from jsDelivr', missing: 'no engine' }[r.checks.engine];
      const whole = r.checks.island === 'closed' && r.checks.end === 'closed';
      rows.push(['structure', `${whole ? 'complete' : r.checks.island === 'unclosed' ? 'cut off inside the text (#orz-src not closed)' : 'cut off after the text (no </html>)'}, ${engine}`]);
    }
    if (r.sha256) rows.push(['sha256', `${r.sha256} (pass it as --replaces to replace this text without --force)`]);
    if (r.twin) {
      const when = { input: 'this one is newer', twin: 'the twin is newer', 'same-time': 'same modification time', unknown: '' }[r.twin.newer];
      const earlier = r.twin.earlier ? `, an earlier text of the text twin (${NODE.earlierSource[r.twin.earlier]})` : '';
      rows.push(['twin', `${r.twin.name}: ${r.twin.holds === 'same' ? 'the same text' : r.twin.holds === 'different' ? `a different text${when ? ` (${when})` : ''}${earlier}` : 'not an orz text'}`]);
      if (r.twin.sha256 && r.twin.holds === 'different') rows.push(['twin sha256', r.twin.sha256]);
    }
    rows.push(['writable', r.writable ? 'yes' : 'no']);
    rows.push(['lint', r.lint.length === 0 ? 'clean' : r.lint.map((l) => `${l.level} ${l.code}${l.line ? ` (line ${l.line})` : ''}`).join('; ')]);
  }
  const w = Math.max(...rows.map(([k]) => k.length));
  const lines = rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`);
  if (r.advice.length) lines.push('', 'advice:', ...r.advice.map((a) => `  - ${a}`));
  if (r.notes.length) lines.push('', 'notes:', ...r.notes.map((n) => `  - ${n}`));
  return lines.join('\n');
}

function cmdInspect(p: Parsed, o: Io): void {
  const file = one(p, 'a file', 'inspect');
  const path = resolve(file);
  const content = readText(path);
  // the sibling twin (x.paged.md <-> x.paged.html; a plain x.md -> x.paged.html): does it hold the same text, and which is newer?
  const sibling = /\.paged\.html$/i.test(path) ? twinName(path) : outputOf(path);
  let twin: { name: string; content: string; newer: 'input' | 'twin' | 'same-time'; earlier?: Exclude<KnownState, 'token'> | null } | undefined;
  if (sibling && sibling !== path && existsSync(sibling)) {
    const c = readMaybe(sibling);
    if (c !== null) {
      const a = mtime(path);
      const b = mtime(sibling);
      twin = { name: (/\.paged\.html$/i.test(file) ? twinName(file) : outputOf(file)) ?? basename(sibling), content: c, newer: a > b ? 'input' : b > a ? 'twin' : 'same-time' };
      // does the .paged.html hold a known earlier state of the text twin (assemble then needs no --force, T.11)?
      const [textPath, textContent, htmlPath, htmlContent] = path.endsWith('.paged.html') ? [sibling, c, path, content] : [path, content, sibling, c];
      const held = looksHtml(htmlContent) ? NODE.documentTextOf(htmlContent) : null;
      if (held !== null && !looksHtml(textContent) && readLegacy(htmlContent) === null && held !== storedText(textContent)) twin.earlier = NODE.earlierStateOf(textPath, htmlPath, held);
    }
  }
  // the name as given: advice names runnable paths (inspect sub/x.paged.md → assemble sub/x.paged.md)
  const r = inspect(content, { filename: file, ...(twin ? { twin } : {}) });
  if (o.json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else process.stdout.write(`${humanInspect(file, r)}\n`);
}

function cmdThemes(p: Parsed, o: Io): void {
  if (p.positional.length) throw new CliError('`orz-paged themes` takes no arguments', EXIT_USAGE);
  // `name` is the picker name, as in orz-mdhtml and orz-slides (D-106); `label`, its old key, is kept for one release
  if (o.json) { emit(o, { command: 'themes', themes: THEME_INFO.map((t) => ({ id: t.id, name: t.label, label: t.label, source: t.source, default: t.id === DEFAULT_THEME })) }); return; }
  const w = Math.max(...THEME_INFO.map((t) => t.id.length));
  for (const t of THEME_INFO) o.say(`${t.id.padEnd(w)}  ${t.label}${t.source ? '' : ' (no decoration)'}${t.id === DEFAULT_THEME ? '  [default]' : ''}`);
}

function cmdTemplates(p: Parsed, o: Io): void {
  if (p.positional.length) throw new CliError('`orz-paged templates` takes no arguments', EXIT_USAGE);
  if (o.json) { emit(o, { command: 'templates', templates: TEMPLATES.map((t) => ({ ...t, default: t.id === DEFAULT_TEMPLATE })) }); return; }
  const w = Math.max(...TEMPLATES.map((t) => t.id.length));
  let group = '';
  for (const t of TEMPLATES) {
    if (t.group !== group) { group = t.group; o.say(`${group}:`); }
    o.say(`  ${t.id.padEnd(w)}  ${t.description}${t.id === DEFAULT_TEMPLATE ? '  [default]' : ''}`);
  }
}

const COMMANDS: Record<string, (p: Parsed, o: Io) => void> = { new: cmdNew, assemble: cmdAssemble, extract: cmdExtract, upgrade: cmdUpgrade, inspect: cmdInspect, themes: cmdThemes, templates: cmdTemplates };

// ── main ────────────────────────────────────────────────────────────────────

export function main(argv: string[]): number {
  const json = argv.includes('--json');
  let command = 'assemble';
  try {
    const first = argv[0];
    if (first === undefined) { process.stderr.write(`${USAGE}\n`); return EXIT_USAGE; }
    if (first === '-h' || first === '--help' || first === 'help') {
      const topic = first === 'help' ? argv[1] : undefined;
      process.stdout.write(`${topic && HELP[topic] ? HELP[topic] : USAGE}\n`);
      return EXIT_OK;
    }
    if (first === '-v' || first === '--version' || first === 'version') {
      if (json) process.stdout.write(`${JSON.stringify({ name: 'orz-paged', version: VERSION, orzMarkdown: ORZ_MARKDOWN_VERSION, formats: [1] }, null, 2)}\n`);
      else process.stdout.write(`orz-paged ${VERSION} (orz-markdown ${ORZ_MARKDOWN_VERSION}, text format 1)\n`);
      return EXIT_OK;
    }
    let rest = argv;
    if (COMMANDS[first]) { command = first; rest = argv.slice(1); }
    else if (first.startsWith('-') && first !== '-') {
      // `orz-paged --cdn x.paged.md`: options before the file, the assemble shorthand
      command = 'assemble';
    }
    if (rest.includes('--help') || rest.includes('-h')) { process.stdout.write(`${HELP[command]}\n`); return EXIT_OK; }
    if (command === 'assemble') { const old = legacyForm(rest); if (old) throw old; }
    const parsed = parse(command, rest);
    COMMANDS[command](parsed, NODE.io(json));
    return EXIT_OK;
  } catch (e) {
    return reportFailure('orz-paged', command, e, json);
  }
}

/**
 * A reader that stops early (`orz-paged assemble x.paged.md -o - | head -c 10`)
 * closes the pipe: the rest of the output has nowhere to go, which is what the
 * reader asked for — exit quietly, never with a stack (D-77). Any other
 * stdout error is still reported.
 */
function quietOnClosedPipe(stream: NodeJS.WriteStream, exit: (code: number) => void = (c) => process.exit(c)): void {
  stream.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') exit(typeof process.exitCode === 'number' ? process.exitCode : 0);
    else throw e;
  });
}

quietOnClosedPipe(process.stdout);
process.exitCode = main(process.argv.slice(2));
