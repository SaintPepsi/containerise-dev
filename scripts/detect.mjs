#!/usr/bin/env node
// Repo scan for the containerise-dev skill. Emits JSON facts; interpretation
// (e.g. which trusted image to use as the base) stays with the model.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCKFILES = [
  ['bun.lock', 'bun'], ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm'],
  ['Cargo.lock', 'cargo'], ['uv.lock', 'uv'], ['poetry.lock', 'poetry'],
  ['requirements.txt', 'pip'], ['go.sum', 'go'],
];
const DEPENDENCY_DIRS = {
  bun: ['node_modules'], pnpm: ['node_modules'], yarn: ['node_modules'], npm: ['node_modules'],
  cargo: ['target'], uv: ['.venv'], poetry: ['.venv'], pip: ['.venv'], go: [],
};
// registry/path:tag — requires a slash and a tag so plain words don't match.
const IMAGE_RE = /\b([a-z0-9.-]+(?:\/[a-z0-9._-]+)+:[a-zA-Z0-9._-]+)\b/g;
const CI_SOURCES = ['.github/workflows', '.gitlab-ci.yml', 'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile'];

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function scanForImages(text, source, seen, out) {
  for (const m of text.matchAll(IMAGE_RE)) {
    const image = m[1];
    if (!seen.has(image)) {
      seen.add(image);
      out.push({ image, source });
    }
  }
}

export function detectRepo(root) {
  const pkg = readJson(join(root, 'package.json'));
  let packageManager = null;
  for (const [file, manager] of LOCKFILES) {
    if (existsSync(join(root, file))) { packageManager = manager; break; }
  }
  if (!packageManager && pkg) packageManager = 'npm';

  const commands = {};
  if (pkg?.scripts?.test) commands.test = pkg.scripts.test;
  if (pkg?.scripts?.build) commands.build = pkg.scripts.build;

  const trustedImages = [];
  const seen = new Set();
  for (const [name, script] of Object.entries(pkg?.scripts ?? {})) {
    scanForImages(script, `package.json script "${name}"`, seen, trustedImages);
  }
  for (const entry of CI_SOURCES) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    const files = entry === '.github/workflows'
      ? readdirSync(path).map((f) => join(path, f))
      : [path];
    for (const file of files) {
      try {
        scanForImages(readFileSync(file, 'utf8'), file.slice(root.length + 1), seen, trustedImages);
      } catch {
        // unreadable file: skip, detection stays best-effort
      }
    }
  }

  return {
    packageManager,
    commands,
    trustedImages,
    existingDevcontainer: existsSync(join(root, '.devcontainer')),
    dependencyDirs: DEPENDENCY_DIRS[packageManager] ?? [],
  };
}

// Impure host probe, kept separate from the pure repo scan.
export function detectHost() {
  let claudeCredentials = 'none';
  if (process.platform === 'darwin') {
    const out = spawnSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf8' });
    if (out.status === 0) claudeCredentials = 'keychain';
  }
  if (claudeCredentials === 'none' && existsSync(join(homedir(), '.claude', '.credentials.json'))) {
    claudeCredentials = 'file';
  }
  return {
    platform: process.platform,
    docker: spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0,
    claudeCredentials,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || process.cwd();
  console.log(JSON.stringify({ ...detectRepo(root), host: detectHost() }, null, 2));
}
