#!/usr/bin/env node
// Compose .devcontainer/devcontainer.json from a layer selection — the
// mechanical half of the containerise-dev pipeline. The model chooses; this
// script merges. Encodes the fixes proven in the first real trial
// (openjam-trial-main, 2026-07-17):
//   - fresh named volumes are root-owned → chown before installing
//   - runtimes used by the suite but absent from image/manager (e.g. bun)
//     are installed in postCreateCommand
//   - `features` from multiple layers union by key (never clobber)
//   - dependency volumes are keyed by ${devcontainerId} (mochi's pattern):
//     cached across rebuilds, isolated across parallel copies
//
// Usage: node generate.mjs < selection.json > .devcontainer/devcontainer.json
// Input JSON: { project, base: {image}, layers: {claude, volumes, shell},
//   remoteUser?, detection: {packageManager, dependencyDirs, commands},
//   shellEnv?: {shell, frameworks} }
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INSTALL_DEPS = {
  npm: 'npm ci',
  pnpm: 'pnpm install --frozen-lockfile',
  yarn: 'yarn install --frozen-lockfile',
  bun: 'bun install --frozen-lockfile',
};
// Runtimes a test suite may invoke that neither the package manager nor a
// typical base image provides, with their global install command.
const EXTRA_RUNTIMES = [
  [/\bbun\b/, 'bun', 'sudo npm install -g bun'],
];

export function generate(sel) {
  const { project, base, layers, remoteUser, detection, shellEnv } = sel;
  const config = { name: `${project} Dev`, image: base.image };
  const features = {};
  const postCreate = [];

  if (layers.volumes) {
    const dirs = detection.dependencyDirs ?? [];
    // ${devcontainerId} (expanded by the devcontainer CLI at `up` time, never
    // here) is stable across rebuilds of the same workspace but distinct per
    // workspace path — so the volume caches across rebuilds AND parallel
    // copies of the project (worktrees, codebay instances) stay isolated.
    // Verified 2026-07-18 (docs/plans/2026-07-18-devcontainerid-volumes-design.md).
    config.mounts = dirs.map(
      (dir) => `source=${dir}-\${devcontainerId},target=\${containerWorkspaceFolder}/${dir},type=volume`,
    );
    config.remoteUser = remoteUser;
    // A fresh named volume is root-owned; a non-root remoteUser can't write
    // into it until it's chowned (first-trial Gate 1 failure).
    for (const dir of dirs) postCreate.push(`sudo chown -R ${remoteUser}:${remoteUser} ${dir}`);
  }

  const testBody = detection.commands?.testBody ?? '';
  for (const [re, name, installCmd] of EXTRA_RUNTIMES) {
    if (re.test(testBody) && detection.packageManager !== name) postCreate.push(installCmd);
  }

  if (layers.claude) {
    features['ghcr.io/anthropics/devcontainer-features/claude-code:1.0'] = {};
    config.initializeCommand = 'node scripts/devcontainer-auth.mjs --stage';
    const installDeps = INSTALL_DEPS[detection.packageManager];
    if (installDeps) postCreate.push(installDeps);
    postCreate.push('node scripts/devcontainer-auth.mjs --install');
  }

  if (layers.shell && shellEnv?.shell === 'zsh') {
    features['ghcr.io/devcontainers/features/common-utils:2'] = {
      installZsh: true,
      configureZshAsDefaultShell: true,
      installOhMyZsh: (shellEnv.frameworks ?? []).includes('oh-my-zsh'),
      username: remoteUser ?? 'automatic',
    };
  }

  if (Object.keys(features).length) config.features = features;
  if (postCreate.length) config.postCreateCommand = postCreate.join(' && ');
  return config;
}

// Main-module guard that survives symlinked skill directories: argv[1] may be
// the symlinked path while import.meta.url is the real one (first-trial
// finding — the naive comparison made the CLI silently print nothing).
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const sel = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    console.log(JSON.stringify(generate(sel), null, 2));
  });
}
