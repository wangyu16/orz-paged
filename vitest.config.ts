import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Test projects (the layout of orz-mdhtml's suite, plus a serial lane for real
 * Chrome): `main` (unit, corpus, CLI — files in parallel), then `chrome` (the
 * files that drive real Chrome, ONE FILE AT A TIME: under parallel load their
 * timings — layout, typing latency, boot — and 30 s budgets were unreliable;
 * closed loop round 1), then `conformance` — orz-markdown's carrier
 * conformance harness against the real carrier (tests/conformance.test.ts,
 * minutes of Chrome load), so its load never shares the machine with the
 * other suites' timing. `tests/global-setup.ts` stages the browser engine into
 * dist/ first. Real-Chrome tests (playwright-core, channel 'chrome') skip
 * themselves when Chrome is not installed; such a run does not verify the
 * claims marked "real" in notes/CLAIMS.md.
 */
const HEAVY = ['tests/conformance.test.ts'];
const CHROME = [
  'tests/standalone.test.ts',
  'tests/columns.test.ts',
  'tests/ruled-paper.test.ts',
  'tests/themes.test.ts',
  'tests/webapp.test.ts',
  'tests/typing.test.ts',
  'tests/read-view-net.test.ts',
  'tests/bundle.test.ts',
  'tests/assemble.test.ts',
];

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      { extends: true, test: { name: 'main', include: ['tests/**/*.test.ts'], exclude: [...configDefaults.exclude, ...HEAVY, ...CHROME], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'chrome', include: CHROME, fileParallelism: false, testTimeout: 60_000, sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: 'conformance', include: HEAVY, sequence: { groupOrder: 2 } } },
    ],
  },
});
