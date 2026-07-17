import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectShellEnv, extractDotfilesRepo } from '../scripts/shell-env.mjs';

function fakeHome() {
  return mkdtempSync(join(tmpdir(), 'cdev-home-'));
}

describe('extractDotfilesRepo', () => {
  test('reads dotfiles.repository from VS Code settings text (comments tolerated)', () => {
    const settings = `{
  // personal settings
  "editor.fontSize": 13,
  "dotfiles.repository": "SaintPepsi/dotfiles"
}`;
    expect(extractDotfilesRepo(settings)).toBe('SaintPepsi/dotfiles');
  });
  test('disconfirming: absent key returns null', () => {
    expect(extractDotfilesRepo('{"editor.fontSize": 13}')).toBe(null);
  });
});

describe('detectShellEnv', () => {
  test('zsh user with oh-my-zsh and rc files', () => {
    const home = fakeHome();
    writeFileSync(join(home, '.zshrc'), '# rc');
    mkdirSync(join(home, '.oh-my-zsh'));
    const r = detectShellEnv(home, { SHELL: '/bin/zsh' }, 'linux');
    expect(r.shell).toBe('zsh');
    expect(r.rcFiles).toEqual(['.zshrc']);
    expect(r.frameworks).toEqual(['oh-my-zsh']);
    expect(r.dotfilesRepo).toBe(null);
  });

  test('finds dotfiles repo from VS Code user settings', () => {
    const home = fakeHome();
    const vscodeDir = join(home, '.config', 'Code', 'User');
    mkdirSync(vscodeDir, { recursive: true });
    writeFileSync(join(vscodeDir, 'settings.json'), '{"dotfiles.repository": "someone/dots"}');
    const r = detectShellEnv(home, { SHELL: '/bin/zsh' }, 'linux');
    expect(r.dotfilesRepo).toBe('someone/dots');
  });

  test('disconfirming: bare bash user detects nothing extra', () => {
    const home = fakeHome();
    const r = detectShellEnv(home, { SHELL: '/bin/bash' }, 'linux');
    expect(r.shell).toBe('bash');
    expect(r.rcFiles).toEqual([]);
    expect(r.frameworks).toEqual([]);
    expect(r.dotfilesRepo).toBe(null);
  });
});
