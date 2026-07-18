import { describe, expect, test } from 'bun:test';
import { generate } from '../scripts/generate.mjs';

const fullSelection = {
  project: 'openjam-trial-main',
  base: { image: 'mcr.microsoft.com/playwright:v1.60.0-jammy', source: 'package.json script "test:snapshots"' },
  layers: { claude: true, volumes: true, shell: true, skills: true },
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
    // volume per dependency dir, keyed by ${devcontainerId}: cached across
    // rebuilds, isolated across parallel copies (worktrees, codebay);
    // skills bind is read-only
    expect(c.mounts).toEqual([
      'source=node_modules-${devcontainerId},target=${containerWorkspaceFolder}/node_modules,type=volume',
      'source=${localEnv:HOME}/.claude/skills,target=/home/pwuser/.claude/skills,type=bind,readonly',
    ]);
    // postCreate order: chown volumes, then the .claude parent fix (must
    // precede auth --install — pitfalls §5), then runtimes, deps, auth
    expect(c.postCreateCommand).toBe(
      'sudo chown -R pwuser:pwuser node_modules && sudo mkdir -p /home/pwuser/.claude && sudo chown pwuser:pwuser /home/pwuser/.claude && sudo npm install -g bun && npm ci && node scripts/devcontainer-auth.mjs --install',
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

  test('claude on a non-node image adds the node feature before claude-code (#4)', () => {
    const c = generate({
      ...fullSelection,
      base: { image: 'oven/bun:1-debian', source: 'toolchain fallback' },
      detection: { ...fullSelection.detection, packageManager: 'bun' },
    });
    expect(Object.keys(c.features)).toEqual([
      'ghcr.io/devcontainers/features/node:1',
      'ghcr.io/anthropics/devcontainer-features/claude-code:1.0',
      'ghcr.io/devcontainers/features/common-utils:2',
    ]);
  });

  test('disconfirming: node-bearing image (playwright) gets no node feature', () => {
    const c = generate(fullSelection);
    expect(c.features['ghcr.io/devcontainers/features/node:1']).toBeUndefined();
  });

  test("skills: 'home' binds the whole ~/.claude read-write, no parent fix", () => {
    const c = generate({ ...fullSelection, layers: { ...fullSelection.layers, skills: 'home' } });
    expect(c.mounts).toEqual([
      'source=node_modules-${devcontainerId},target=${containerWorkspaceFolder}/node_modules,type=volume',
      'source=${localEnv:HOME}/.claude,target=/home/pwuser/.claude,type=bind',
    ]);
    // rw bind owns ~/.claude — the §5 parent chown must NOT appear
    expect(c.postCreateCommand).not.toContain('mkdir -p /home/pwuser/.claude');
    // and it must not be readonly — sessions write through it
    expect(c.mounts[1]).not.toContain('readonly');
  });

  test("skills: true stays an alias for the read-only 'skills' mode", () => {
    const t = generate({ ...fullSelection, layers: { ...fullSelection.layers, skills: true } });
    const s = generate({ ...fullSelection, layers: { ...fullSelection.layers, skills: 'skills' } });
    expect(t).toEqual(s);
  });

  test('disconfirming: skills off — no skills mount, no .claude parent fix', () => {
    const c = generate({ ...fullSelection, layers: { ...fullSelection.layers, skills: false } });
    expect(c.mounts).toHaveLength(1);
    expect(JSON.stringify(c)).not.toContain('.claude/skills');
    expect(c.postCreateCommand).not.toContain('mkdir -p /home/pwuser/.claude');
  });

  test('skills without volumes still mounts and fixes the parent', () => {
    const c = generate({
      ...fullSelection,
      layers: { claude: false, volumes: false, shell: false, skills: true },
    });
    expect(c.mounts).toEqual([
      'source=${localEnv:HOME}/.claude/skills,target=/home/pwuser/.claude/skills,type=bind,readonly',
    ]);
    expect(c.remoteUser).toBe('pwuser');
    // runtime injection (bun, from testBody) is layer-independent by design
    expect(c.postCreateCommand).toBe(
      'sudo mkdir -p /home/pwuser/.claude && sudo chown pwuser:pwuser /home/pwuser/.claude && sudo npm install -g bun',
    );
  });

  test('volume names carry no project identity — ${devcontainerId} is the discriminator', () => {
    // Two workspaces of the same repo (worktree, codebay copy) generate
    // identical mounts; isolation comes from the CLI expanding
    // ${devcontainerId} per workspace path, not from anything we compose.
    const a = generate(fullSelection);
    const b = generate({ ...fullSelection, project: 'openjam' });
    expect(a.mounts).toEqual(b.mounts);
    expect(a.mounts[0]).toContain('${devcontainerId}');
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
