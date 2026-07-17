import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isValid, install } from '../scripts/devcontainer-auth.mjs';

describe('isValid', () => {
  test('accepts real credential shape', () => {
    expect(isValid(JSON.stringify({ claudeAiOauth: { accessToken: 'tok' } }))).toBe(true);
  });
  test('disconfirming: rejects junk, empty token, and non-JSON', () => {
    expect(isValid('not json')).toBe(false);
    expect(isValid(JSON.stringify({ claudeAiOauth: {} }))).toBe(false);
    expect(isValid(JSON.stringify({}))).toBe(false);
  });
});

describe('install', () => {
  test('moves staged creds into CLAUDE_CONFIG_DIR with 600 and onboarding flag, deletes staged file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cdev-'));
    const staged = join(tmp, 'staged.json');
    const configDir = join(tmp, 'claude-config');
    writeFileSync(staged, JSON.stringify({ claudeAiOauth: { accessToken: 'tok' } }));
    process.env.CONTAINERISE_STAGED_FILE = staged;
    process.env.CLAUDE_CONFIG_DIR = configDir;
    expect(install()).toBe(0);
    const credFile = join(configDir, '.credentials.json');
    expect(existsSync(credFile)).toBe(true);
    expect(statSync(credFile).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(join(configDir, '.claude.json'), 'utf8'))).toEqual({ hasCompletedOnboarding: true });
    expect(existsSync(staged)).toBe(false);
    delete process.env.CONTAINERISE_STAGED_FILE;
    delete process.env.CLAUDE_CONFIG_DIR;
  });
  test('disconfirming: no staged file → exit 0, nothing written', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cdev-'));
    process.env.CONTAINERISE_STAGED_FILE = join(tmp, 'absent.json');
    process.env.CLAUDE_CONFIG_DIR = join(tmp, 'claude-config');
    expect(install()).toBe(0);
    expect(existsSync(join(tmp, 'claude-config'))).toBe(false);
    delete process.env.CONTAINERISE_STAGED_FILE;
    delete process.env.CLAUDE_CONFIG_DIR;
  });
});
