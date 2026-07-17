# containerise-dev Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use ExecutingPlans to implement this plan task-by-task.

**Goal:** Build the public, installable `containerise-dev` Claude skill (router + mode sub-skills + shared pipeline + scripts) distilled from the OpenJam devcontainer spike.

**Architecture:** Thin SKILL.md router asks the mode question; `detect-first/` and `wizard/` sub-skills only collect a layer selection; `PIPELINE.md` owns generate → gates → report → retro. Mechanical work lives in two node scripts (`detect.mjs` pure repo scan, `devcontainer-auth.mjs` credential transport ported from OpenJam). Templates and pitfalls are reference data.

**Tech Stack:** Plain node `.mjs` (no dependencies), `bun test` for units, markdown skill files per the standard skill format.

**Design doc:** `docs/plans/2026-07-17-containerise-dev-skill-design.md` (approved). Honor its Principles-applied section: pure functions for mechanics, layers as data, one pipeline.

---

### Task 1: Repo scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE` (MIT, Ian Hogers)

**Step 1:** `package.json`:

```json
{
  "name": "containerise-dev",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Claude skill: turn any repo into a containerised dev environment (devcontainer + optional Claude Code pass-through), with the known bind-mount/auth pitfalls fixed by default.",
  "scripts": {
    "test": "bun test test/"
  },
  "license": "MIT"
}
```

**Step 2:** `.gitignore`:

```
node_modules/
test/tmp/
```

**Step 3:** Run `bun test test/` — expected: exits reporting no test files found (harness works, nothing to run).

**Step 4:** Commit: `chore: scaffold skill repo`.

### Task 2: `scripts/detect.mjs` — pure repo scan (TDD)

**Files:**
- Create: `scripts/detect.mjs`
- Create: `test/detect.test.mjs`
- Create: `test/fixtures/npm-playwright/package.json`, `test/fixtures/bare/README.md`

**Step 1: Fixtures.** `test/fixtures/npm-playwright/package.json`:

```json
{
  "name": "fixture-npm-playwright",
  "scripts": {
    "test": "playwright test",
    "build": "node build.mjs",
    "test:snapshots": "docker run --rm -v \"$PWD\":/work mcr.microsoft.com/playwright:v1.60.0-jammy bash -lc 'npm test'"
  }
}
```

Also create an empty `test/fixtures/npm-playwright/package-lock.json` (`{}`) and a `test/fixtures/bare/README.md` (any text, no manifest).

**Step 2: Write the failing tests** (`test/detect.test.mjs`):

```js
import { describe, expect, test } from 'bun:test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRepo } from '../scripts/detect.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('detectRepo', () => {
  test('npm repo: package manager, commands, dependency dirs', () => {
    const r = detectRepo(join(fixtures, 'npm-playwright'));
    expect(r.packageManager).toBe('npm');
    expect(r.commands.test).toBe('playwright test');
    expect(r.commands.build).toBe('node build.mjs');
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
```

**Step 3:** Run `bun test test/` — expected: FAIL, `detectRepo` not found.

**Step 4: Implement `scripts/detect.mjs`.** Pure given a directory; host probing is a separate thin impure function. Lockfile → manager and manager → dependency dirs are data maps (Data Drives Behavior). Image scan: regex for `registry/path:tag` strings over manifest scripts and CI/compose files.

```js
#!/usr/bin/env node
// Repo scan for the containerise-dev skill. Emits JSON facts; interpretation
// (e.g. which trusted image to use as the base) stays with the model.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
const CI_GLOBS = ['.github/workflows', '.gitlab-ci.yml', 'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile'];

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function scanForImages(text, source, seen, out) {
  for (const m of text.matchAll(IMAGE_RE)) {
    const image = m[1];
    if (image.includes('/') && !seen.has(image)) {
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
  for (const entry of CI_GLOBS) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    const files = entry === '.github/workflows'
      ? readdirSync(path).map((f) => join(path, f))
      : [path];
    for (const file of files) {
      try { scanForImages(readFileSync(file, 'utf8'), file.slice(root.length + 1), seen, trustedImages); } catch { /* unreadable: skip */ }
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

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || process.cwd();
  console.log(JSON.stringify({ ...detectRepo(root), host: detectHost() }, null, 2));
}
```

**Step 5:** Run `bun test test/` — expected: 3 pass.

**Step 6:** Sanity run against a real repo: `node scripts/detect.mjs ~/projects/openjam` — expected JSON includes `"packageManager": "npm"`, the Playwright image under `trustedImages` sourced from `package.json script "test:snapshots"`, and `"existingDevcontainer": true`.

**Step 7:** Commit: `feat: detect.mjs repo scan with fixture tests`.

### Task 3: `scripts/devcontainer-auth.mjs` — port from OpenJam, importable (TDD)

**Files:**
- Create: `scripts/devcontainer-auth.mjs` (port of `~/projects/openjam/scripts/devcontainer-auth.mjs`)
- Create: `test/auth.test.mjs`

**Step 1:** Copy the OpenJam script, then modify:
1. Add a vendored-copy header comment: `// Vendored from https://github.com/SaintPepsi/containerise-dev — the skill repo is the canonical source.` (adjust URL to the final repo name).
2. Export the helpers (`isValid`, `locateHostCredentials`, `install`) and guard main execution with the same `pathToFileURL(process.argv[1])` check as detect.mjs, so the file is both a CLI and importable for tests.
3. In `install()`, resolve the staged file from `process.env.CONTAINERISE_STAGED_FILE ?? stagedFile` so tests can point it at a temp dir (the env var is test-only; document it in the header).

**Step 2: Write the failing tests** (`test/auth.test.mjs`):

```js
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
```

**Step 3:** Run `bun test test/` — expected: auth tests FAIL (exports missing) until the port lands, then all pass.

**Step 4:** Commit: `feat: credential transport script, ported from openjam trial`.

### Task 4: `references/pitfalls.md`

**Files:**
- Create: `references/pitfalls.md`

**Step 1:** Write the four traps, each as: symptom → cause → fix → template knob that applies it. Content from the OpenJam spike (`docs/dev-containers/01-container-environment.md` trial-evidence section + `02-parallel-isolation.md` cross-cutting section):

1. Bind-mount dependency corruption (`npm ci` in container rewrites host `node_modules` with Linux binaries) → volume over each `dependencyDirs` entry.
2. Root `remoteUser` blocks Claude Code unattended mode → non-root user, noting many tool images default to root.
3. Rebuild wipes `~/.claude` sign-in → auth hooks (this skill's transport) and/or `~/.claude` named volume.
4. Gitignored personal files ride bind mounts into containers (e.g. `.claude/settings.local.json` with absolute host paths) → note in generated README section; worktree-based parallelism (planned layer) avoids it by construction.

**Step 2:** Commit: `docs: pitfalls reference from openjam spike`.

### Task 5: `references/templates/` — layers as data

**Files:**
- Create: `references/templates/base.jsonc`, `references/templates/layer-claude.jsonc`, `references/templates/layer-volumes.jsonc`, `references/templates/README.md`

**Step 1:** `base.jsonc` (placeholders in `«»`, model substitutes from detection + confirmation):

```jsonc
{
  "name": "«project» Dev",
  "image": "«base image — prefer a detected trustedImage»",
  "containerEnv": { "CI": "1" }
}
```

`layer-claude.jsonc` (merged into base when the Claude layer is on):

```jsonc
{
  "features": { "ghcr.io/anthropics/devcontainer-features/claude-code:1.0": {} },
  "initializeCommand": "node scripts/devcontainer-auth.mjs --stage",
  "postCreateCommand": "«install deps command» && node scripts/devcontainer-auth.mjs --install"
}
```

`layer-volumes.jsonc`:

```jsonc
{
  "mounts": [
    "source=«project»-«dir»,target=${containerWorkspaceFolder}/«dir»,type=volume"
    // one per detected dependencyDir
  ],
  "remoteUser": "«non-root user available in the base image»"
}
```

`README.md` in templates: how layers merge (shallow key merge; `postCreateCommand` segments join with `&&`), and that adding a future layer (firewall, worktrees) = adding a file here, not editing the pipeline.

**Step 2:** Commit: `feat: devcontainer templates as composable layer data`.

### Task 6: `PIPELINE.md` — shared generate → gates → report → retro

**Files:**
- Create: `PIPELINE.md`

**Step 1:** Write the pipeline both modes hand into. Structure:

1. **Inputs:** the layer selection contract from the design doc (`{ base: {image, source}, layers: {claude, volumes} }`) plus `detect.mjs` JSON.
2. **Generate:** compose `.devcontainer/devcontainer.json` from templates per selected layers; if Claude layer: vendor `scripts/devcontainer-auth.mjs` into the target and append the staged-creds path to the target's `.gitignore`. Never overwrite an existing `.devcontainer/` — offer an extension diff instead (design doc, Error Handling).
3. **Gate 1 — build:** `npx --yes @devcontainers/cli up --workspace-folder .` succeeds. Paste the final JSON outcome line.
4. **Gate 2 — suite:** run the detected test command via `devcontainer exec`; paste the summary. No test command → run the build/run command and mark the report **UNVERIFIED** explicitly.
5. **Gate 3 — Claude (only if layer chosen):** `devcontainer exec … claude -p "reply with exactly: authorized"` answers without a login prompt; paste the reply.
6. **Report:** what was generated, gate evidence, and the pitfalls that apply to this repo (from `references/pitfalls.md`).
7. **Retro (required, not skippable):** answer from this run's concrete friction: "What would you **add / update / remove** in containerise-dev?" Present the answer to the user with a prefilled `gh issue create --repo «skill repo» --title … --body …` command, and offer to run it. Rules: cite the friction (command + output or file), never file without user approval.

**Step 2:** Commit: `feat: shared pipeline with evidence gates and retro step`.

### Task 7: Mode sub-skills

**Files:**
- Create: `detect-first/SKILL.md`, `wizard/SKILL.md`

**Step 1:** `detect-first/SKILL.md`: run `node «skill dir»/scripts/detect.mjs «repo»`, interpret (pick base image from `trustedImages` with the reasoning stated; default layers: claude on iff `host.claudeCredentials != none`, volumes on iff `dependencyDirs` non-empty), present the full proposed config + layer selection as ONE confirmation question (AskUserQuestion, options: accept / toggle layers / change base image), then hand the selection to `PIPELINE.md`.

**Step 2:** `wizard/SKILL.md`: same detection run first (as context, not as a proposal), then one question per decision — base image (options from `trustedImages` + toolchain default), Claude layer (mention what the transport does and the rebuild-wipe problem it solves), volumes layer (mention the bind-mount corruption trap) — then hand the identical selection contract to `PIPELINE.md`.

**Step 3:** Both files end with the same line: "Hand the layer selection to `../PIPELINE.md` and follow it." Neither file contains generation or gate instructions (Single Source of Truth).

**Step 4:** Commit: `feat: detect-first and wizard mode sub-skills`.

### Task 8: Router `SKILL.md` + `README.md`

**Files:**
- Create: `SKILL.md`, `README.md`

**Step 1:** `SKILL.md` with frontmatter:

```markdown
---
name: containerise-dev
description: Turn any repo into a containerised dev environment (devcontainer + optional Claude Code pass-through) with known pitfalls fixed by default. USE WHEN containerise, devcontainer, dev container, containerised development, run claude in a container, isolate dev environment.
---

# containerise-dev

> ⚠️ EXPERIMENTAL skill under active improvement — please lodge friction as issues:
> https://github.com/«owner»/containerise-dev/issues

1. State the experimental notice above (one line, with the link).
2. Ask (AskUserQuestion, header "Approach"): "How would you like to containerise?"
   1. **Detect and propose** — I scan the repo, propose a full config, you confirm once.
   2. **Full wizard** — a question per decision, with detection as context.
3. Read `./detect-first/SKILL.md` or `./wizard/SKILL.md` and follow it.
4. The mode file hands off to `./PIPELINE.md`; follow it to the end, including the retro step.
```

**Step 2:** `README.md`: what it is (2 sentences), EXPERIMENTAL banner, install (`git clone` into `~/.claude/skills/containerise-dev` or a project's `.claude/skills/`), what it generates, the gates it enforces, known unknowns (Linux credential path untested, JetBrains/other-IDE flows untested — Jason's point), feedback link, provenance line (distilled from the OpenJam spike, link to issue #38).

**Step 3:** Commit: `feat: router skill and README`.

### Task 9: End-to-end verification

**Step 1:** `bun test test/` — all tests pass; paste summary.

**Step 2:** `node scripts/detect.mjs ~/projects/openjam` — paste JSON; confirm the Playwright image is found with correct source attribution (real-repo disconfirmation of the fixture-only risk).

**Step 3:** Skill-format lint: frontmatter parses, every relative path referenced in SKILL.md/PIPELINE.md/mode files exists (`grep -o '\./[A-Za-z/.-]*' SKILL.md …` and check each).

**Step 4:** Install locally: `ln -s ~/projects/containerise-dev ~/.claude/skills/containerise-dev` (symlink so edits propagate while experimental).

**Step 5:** Commit: `chore: e2e verification evidence` (put pasted outputs in the commit body or a `docs/verification.md`).

### Task 10: Publish (Ian's call — do not run without approval in the moment)

**Step 1:** `gh repo create` public under Ian's account, push `main`.
**Step 2:** Replace `«owner»` placeholders in SKILL.md/README/vendor header with the real repo URL; commit and push.
**Step 3:** Send Cam the link (Ian does this in Slack).
