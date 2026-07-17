# containerise-dev skill — Design

**Date:** 2026-07-17

## Problem

Setting up a devcontainer for an arbitrary project is easy to get 80% right and
annoying to get 100% right. The last 20% is a set of known traps we hit personally
while containerising OpenJam (spike:
[SaintPepsi/openjam#38](https://github.com/SaintPepsi/openjam/issues/38)):

1. `npm ci` through the bind mount rewrote the host's `node_modules` with Linux
   binaries — the fix is a named volume over dependency directories.
2. The base image ran as root, which Claude Code's unattended mode refuses — the fix
   is a non-root `remoteUser`.
3. Container rebuilds discard the writable layer, wiping Claude Code's sign-in — the
   fix is credential transport via lifecycle hooks (and/or a `~/.claude` volume).
4. Gitignored personal files (e.g. `.claude/settings.local.json` with absolute host
   paths) ride bind mounts into containers.

`containerise-dev` is a Claude skill that turns any repo into a containerised dev
environment with these lessons baked in, offering the user options (Claude Code
pass-through, volume fixes) instead of a one-size scaffold. First external trial
user: Cam (macOS/Linux, unknown repos) — which forces portability and honesty about
maturity.

## Constraints

- **Public and installable**: standalone GitHub repo, standard skill format, no PAI
  dependencies. Install = copy into `~/.claude/skills/` or a project's
  `.claude/skills/`.
- **Experimental, loudly**: README and SKILL.md banner state this is an experimental
  skill under active improvement, with a link to the repo's issues for feedback.
- **v1 layers**: base + Claude pass-through + volume/user fixes. Firewall and
  worktree parallelism are documented as planned, not generated.
- **Self-contained targets**: anything the skill vendors into a target repo (the
  credential transport script) must work standalone there.

## Approaches Considered

1. **Prose-only SKILL.md** — instructions only; the model re-derives detection and
   credential transport every run. Violates Pure Functions in spirit: the mechanical
   parts (Keychain access, staged-file transport took three iterations to get right)
   get re-improvised each run, which is where runs diverge and break.
2. **SKILL.md + scripts + references (chosen)** — thin orchestrator; deterministic
   mechanics live in scripts, judgment lives with the model, pitfalls and templates
   are reference data.
3. **Full generator CLI** — one scaffold script does everything; the model relays
   questions. A framework built before writing it twice: repos are too varied
   (picking OpenJam's base image required reading meaning out of an existing npm
   script), and rigid generation fails exactly on the weird repos where a skill adds
   value.

## Chosen Approach

Approach 2, structured as a router with mode sub-skills (the same shape as
/Brainstorming): modes differ **only in how choices are collected**; everything
downstream is one shared pipeline.

## Architecture

```
containerise-dev/
├── SKILL.md              # router: banner → mode question → read mode file → PIPELINE.md
├── detect-first/SKILL.md # mode A: run detect.mjs → propose full config → one confirm round
├── wizard/SKILL.md       # mode B: question per layer, detection output as context
├── PIPELINE.md           # shared: generate → build → gates → report → retro
├── scripts/
│   ├── detect.mjs        # repo scan → JSON on stdout
│   └── devcontainer-auth.mjs  # credential transport; vendored into target repo when Claude layer chosen
├── references/
│   ├── pitfalls.md       # the four traps + fixes, with sources
│   └── templates/        # devcontainer.json variants as data, keyed by layer combo
└── README.md             # EXPERIMENTAL banner, install steps, feedback/issues link
```

**Flow.** SKILL.md shows the experimental notice, then asks (/Algorithm-style):
"How would you like to containerise? 1. Detect and propose, confirm after / 2. Full
wizard." Both modes produce the same artifact — a **layer selection** (base always;
Claude pass-through and volume/user fixes toggleable) — then hand to PIPELINE.md.

**Layer output contract.** A mode returns `{ base: {image, source}, layers:
{claude: bool, volumes: bool} }`. PIPELINE.md consumes only this; modes never
generate config themselves.

## Data Model

`detect.mjs` JSON contract (mechanical facts only; interpretation is the model's
job):

```json
{
  "packageManager": "npm|pnpm|yarn|bun|cargo|pip|…|null",
  "commands": { "test": "npm test", "build": "…" },
  "trustedImages": [{ "image": "mcr.microsoft.com/playwright:v1.60.0-jammy", "source": "package.json test:snapshots" }],
  "existingDevcontainer": false,
  "dependencyDirs": ["node_modules"],
  "host": { "platform": "darwin", "claudeCredentials": "keychain|file|none", "docker": true }
}
```

`trustedImages` generalizes the OpenJam trick: scan CI configs, compose files, and
manifest scripts for images the repo already runs — the strongest base-image signal
available.

`devcontainer-auth.mjs` (proven in the OpenJam trial): `--stage` on host via
`initializeCommand` (macOS Keychain → fallback `~/.claude/.credentials.json`;
missing credentials exits 0 with a notice so builds never break), `--install` in
container via `postCreateCommand` (writes credentials mode 600 +
`hasCompletedOnboarding` flag, deletes staged file), no-flag one-shot injection into
a running container. Staged file is added to the target's `.gitignore` by the
pipeline.

## Error Handling

- No Docker on host → stop with install pointer before generating anything.
- No test command found → gate 2 downgrades to build/run command and the final
  report explicitly marks the container **unverified**; never silently pass.
- Detection can't find a trusted image → model proposes from the toolchain (e.g.
  official language image) and says so; the confirm round exists for exactly this.
- Existing `.devcontainer/` → never overwrite; offer to extend, diff-style.
- Credential transport absent/failed → container still builds; report says Claude
  needs manual sign-in (matches script's exit-0 design).

## Testing Strategy

- **Scripts**: unit-testable by construction — `detect.mjs` is pure
  (repo files in, JSON out; fixtures = tiny fake repos), transport script's
  locate/validate helpers likewise. Run with the repo's own harness (bun test).
- **Skill end-to-end**: the skill's own gates are the test — trial on a real repo
  (OpenJam replay as the known-good case; Cam's repos as unknown-repo trials).
- **Gates** (each with pasted evidence, each with a disconfirming side):
  1. Build — `devcontainer up` succeeds.
  2. Suite — the repo's own test command passes in-container.
  3. Claude — only if that layer was chosen: `claude -p` answers without a login
     prompt.

## The Retro Step (skill self-improvement)

Final PIPELINE.md step after the report: an introspective question in the run
itself — "From this run: what would you **add / update / remove** in
containerise-dev?" — answered by the model from concrete friction it hit, then
offered to the user with a prefilled `gh issue create` against the skill's repo.
This institutionalizes the loop that created the skill (build one by hand, distill
the pitfalls) so every run on a new repo feeds the next version.

## Principles Applied

- **Pure Functions for Testability** — mechanical, deterministic work (repo
  scanning, credential transport) lives in scripts testable in isolation; the model
  keeps only judgment (image choice, template adaptation). SKILL.md orchestrates, it
  doesn't compute.
- **Data Drives Behavior** — layers and their templates are data keyed by layer
  combo; the planned firewall and worktree layers are added entries, not new
  branches in the flow.
- **Single Source of Truth** — one PIPELINE.md both modes converge on; mode files
  collect choices and nothing else, so they cannot drift. The transport script
  exists once in the skill repo.
- **Separation of Concerns** — router (routing) / modes (choice collection) /
  pipeline (generation + verification) / scripts (mechanics) / references (teaching
  material loaded just-in-time).
- **Deviations** — vendoring `devcontainer-auth.mjs` into target repos duplicates
  the file across repos. Accepted deliberately: a generated `.devcontainer/` must be
  self-contained for people who never installed the skill; the skill repo remains
  the canonical source and vendored copies carry a header saying so.

## Open Questions

- Repo name: `containerise-dev` (matches the skill name) vs a `-skill` suffix.
- Linux credential path (`~/.claude/.credentials.json`) is designed-in but untested
  until a Linux trial — flagged in README as a known unknown.
- Whether the retro step should also self-file the issue when the user approves, or
  always leave filing to the user.
