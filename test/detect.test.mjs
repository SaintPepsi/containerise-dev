import { describe, expect, test } from 'bun:test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRepo } from '../scripts/detect.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('detectRepo', () => {
  test('npm repo: package manager, commands, dependency dirs', () => {
    const r = detectRepo(join(fixtures, 'npm-playwright'));
    expect(r.packageManager).toBe('npm');
    expect(r.commands.test).toBe('npm test');
    expect(r.commands.testBody).toBe('playwright test');
    expect(r.commands.build).toBe('npm run build');
    expect(r.dependencyDirs).toEqual(['node_modules']);
    expect(r.existingDevcontainer).toBe(false);
  });

  test('finds images the repo already trusts, with source attribution', () => {
    const r = detectRepo(join(fixtures, 'npm-playwright'));
    expect(r.trustedImages).toEqual([
      { image: 'mcr.microsoft.com/playwright:v1.60.0-jammy', source: 'package.json script "test:snapshots"' },
    ]);
  });

  test('disconfirming: bare repo detects nothing', () => {
    const r = detectRepo(join(fixtures, 'bare'));
    expect(r.packageManager).toBe(null);
    expect(r.commands).toEqual({});
    expect(r.trustedImages).toEqual([]);
    expect(r.dependencyDirs).toEqual([]);
  });
});
