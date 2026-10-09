#!/usr/bin/env node
/**
 * `prepublishOnly` of orz-paged-browser: refuse to publish a package whose
 * files do not match its manifest — release.json must name this package's
 * version (and orz-paged's, the two are released in lockstep), kind `paged`,
 * the bundle path, and the SHA-384 of the bundle's exact bytes (the quiet
 * update of every file checks it); the bundle and the ES module build must
 * exist and obey the bundle rule (no `<script` / `</script`, no CR, ASCII).
 * Run `npm run build` in the orz-paged repository first.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => (existsSync(join(DIR, f)) ? readFileSync(join(DIR, f)) : (problems.push(`${f} is missing (run \`npm run build\`)`), null));
const pkg = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8'));
const releaseBytes = read('release.json');
const bundle = read('orz-paged.browser.js');
const esm = read('esm/orz-paged.browser.mjs');
const guide = read('docs/embedding.md');
const source = join(DIR, '..', 'docs', 'embedding.md');
if (guide && existsSync(source) && !readFileSync(source).equals(guide)) problems.push('docs/embedding.md is not the repository\'s docs/embedding.md (run `npm run build`)');
if (releaseBytes && bundle) {
  const release = JSON.parse(releaseBytes.toString('utf8'));
  const integrity = `sha384-${createHash('sha384').update(bundle).digest('base64')}`;
  if (release.version !== pkg.version) problems.push(`release.json says version ${release.version}, the package is ${pkg.version}`);
  if (release.kind !== 'paged') problems.push(`release.json kind ${JSON.stringify(release.kind)}, not "paged"`);
  if (release.bundle?.path !== 'orz-paged.browser.js') problems.push(`release.json bundle.path ${JSON.stringify(release.bundle?.path)}`);
  if (release.bundle?.integrity !== integrity) problems.push('release.json\'s integrity is not the SHA-384 of orz-paged.browser.js (stale build?)');
}
const parent = join(DIR, '..', 'package.json');
if (existsSync(parent)) {
  const cli = JSON.parse(readFileSync(parent, 'utf8'));
  if (cli.name === 'orz-paged' && cli.version !== pkg.version) problems.push(`orz-paged is ${cli.version}, orz-paged-browser ${pkg.version}: the two are released with the same version`);
}
for (const [name, bytes] of [['orz-paged.browser.js', bundle], ['esm/orz-paged.browser.mjs', esm]]) {
  if (!bytes) continue;
  const code = bytes.toString('latin1');
  if (/<\\*\/?script/i.test(code)) problems.push(`${name} holds <script or </script (the bundle rule)`);
  if (code.includes('\r')) problems.push(`${name} holds a CR`);
  if (/[^\x00-\x7f]/.test(code)) problems.push(`${name} is not ASCII`);
}
if (problems.length) {
  process.stderr.write(`orz-paged-browser ${pkg.version} cannot be published:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`orz-paged-browser ${pkg.version}: release.json matches the files\n`);
