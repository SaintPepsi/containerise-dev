import { describe, expect, test } from 'bun:test';
import { generate } from '../scripts/generate.mjs';

const fullSelection = {
  project: 'openjam-trial-main',
  base: { image: 'mcr.microsoft.com/playwright:v1.60.0-jammy', source: 'package.json script "test:snapshots"' },
  layers: { claude: true, volumes: true, shell: true },
  remoteUser: 'pwuser',
  detection: {
    packageManager: 'npm',
    dependencyDirs: ['node_modules'],
    commands: { test: 'npm test', testBody: 'npm run build && bun test test/ && playwright test' },
  },
  shellEnv: { shell: 'zsh', frameworks: ['oh-my-zsh'], dotfilesRepo: null },
};

describe('generate', () => {
  test('full selection composes all layers with the trial-proven fixes', () => {
    const c = generate(fullSelection);
    expect(c.name).toBe('openjam-trial-main Dev');
    expect(c.image).toBe('mcr.microsoft.com/playwright:v1.60.0-jammy');
    expect(c.remoteUser).toBe('pwuser');
    // features from two layers coexist (deep merge, not clobber)
    expect(Object.keys(c.features)).toEqual([
      'ghcr.io/anthropics/devcontainer-features/claude-code:1.0',
      'ghcr.io/devcontainers/features/common-utils:2',
    ]);
    expect(c.features['ghcr.io/devcontainers/features/common-utils:2']).toEqual({
      installZsh: true,
      configureZshAsDefaultShell: true,
      installOhMyZsh: true,
      username: 'pwuser',
    });
    // volume per dependency dir, named by project (folder), not package
    expect(c.mounts).toEqual([
      'source=openjam-trial-main-node_modules,target=${containerWorkspaceFolder}/node_modules,type=volume',
    ]);
    // postCreate order: chown volumes first, then missing runtimes, then deps, then auth install
    expect(c.postCreateCommand).toBe(
      'sudo chown -R pwuser:pwuser node_modules && sudo npm install -g bun && npm ci && node scripts/devcontainer-auth.mjs --install',
    );
    expect(c.initializeCommand).toBe('node scripts/devcontainer-auth.mjs --stage');
    // no leftover placeholders anywhere
    expect(JSON.stringify(c)).not.toContain('«');
  });

  test('bun runtime not injected when the suite does not use it', () => {
    const c = generate({
      ...fullSelection,
      detection: { ...fullSelection.detection, commands: { test: 'npm test', testBody: 'playwright test' } },
    });
    expect(c.postCreateCommand).not.toContain('install -g bun');
  });

  test('disconfirming: base-only selection is minimal', () => {
    const c = generate({
      project: 'plain',
      base: { image: 'node:20', source: 'toolchain fallback' },
      layers: { claude: false, volumes: false, shell: false },
      detection: { packageManager: 'npm', dependencyDirs: ['node_modules'], commands: {} },
    });
    expect(c).toEqual({ name: 'plain Dev', image: 'node:20' });
  });

  test('volumes without root-capable helper still chowns via sudo and says so', () => {
    const c = generate({
      ...fullSelection,
      layers: { claude: false, volumes: true, shell: false },
    });
    expect(c.postCreateCommand.startsWith('sudo chown -R pwuser:pwuser node_modules')).toBe(true);
    expect(c.features).toBeUndefined();
  });
});
