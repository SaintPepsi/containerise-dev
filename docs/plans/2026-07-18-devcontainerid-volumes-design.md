# devcontainerId-keyed dependency volumes — Design

**Date:** 2026-07-18

## Problem

The volumes layer names dependency volumes `«project»-«dir»` (e.g.
`openjam-node_modules`), keyed on the workspace folder basename. That is
collision-safe across worktrees (different basenames) but collides when a
devcontainer manager such as [codebay](https://github.com/khromov/codebay)
spins up **parallel copies of the same project**: every copy is named
`openjam`, so every container mounts the *same* named volume and their
dependency installs race and cross-contaminate.

The openjam spike (2026-07-17) worked around it with an anonymous volume
(dropping `source=`), which isolates copies but loses the dependency cache on
every container recreation — each rebuild reinstalls from scratch.

## Constraints

- One generated config must work standalone **and** under codebay — no
  per-target variants, no flag the user must get right.
- `scripts/generate.mjs` stays the only place that composes devcontainer.json
  (skill rule: "do not hand-merge").
- No behavior change to the claude, shell, or base layers.
- openjam's own `.devcontainer/` is out of scope (stays as the spike left it).

## Approaches Considered

1. **`codebay` layer flag driving the composer** — selection gains
   `layers.codebay`; when set, the volumes branch emits anonymous volumes and
   the claude branch skips the credential transport. Keeps one composer
   (Single Source of Truth) and drives the delta from data (Data Drives
   Behavior), but the layer is a cross-cutting modifier of output it doesn't
   own, testing becomes a codebay × volumes × claude matrix, and the user must
   know their target upfront. Anonymous volumes also forfeit rebuild caching.
2. **Self-contained mutually-exclusive codebay layer** — a peer layer that
   replaces volumes+claude with its own mounts and feature. Best fit to the
   JIT layer architecture on paper, worst in practice: dependency-dir mount
   logic and the claude feature exist in two branches and drift silently.
3. **Post-process transform** (`codebay.mjs`, config in → config out) — the
   codebay delta as a pure, separately-testable function; uniquely able to
   adapt configs the skill didn't generate. But it must parse the composer's
   output shapes (mount strings, `&&`-joined postCreate), a second place that
   knows the composition format.
4. **`${devcontainerId}`-keyed volume names by default** (chosen) — mochi's
   pattern (`.devcontainer` in khromov/mochi): suffix the volume name with the
   devcontainer spec variable `${devcontainerId}`, which is stable across
   rebuilds of the same workspace and distinct per workspace path. Every
   config becomes parallel-safe by construction with **no flag, no layer, no
   caching trade-off**. Approaches 1–3 all encode "codebay-ness" somewhere;
   this dissolves the question.

## Chosen Approach

Approach 4. The volumes layer emits, per dependency dir:

```json
"source=«dir»-${devcontainerId},target=${containerWorkspaceFolder}/«dir»,type=volume"
```

`${devcontainerId}` is expanded by the devcontainer CLI at `up` time, never by
`generate.mjs` — generation stays mechanical. The project-name prefix is
dropped from volume names: `devcontainerId` already encodes the workspace
identity, and the `«dir»-` prefix keeps `docker volume ls` readable.
`project` remains in the selection contract for the display name
(`"name": "«project» Dev"`).

Verified 2026-07-18 against a minimal fixture
(`mcr.microsoft.com/playwright:v1.60.0-jammy`):

| Claim | Evidence |
|---|---|
| Recreate in place → cache survives | volume `node_modules-1a178q70bb45l52l7u0renv0mvghan217n8h4qsrso0oo3tdmmlj` identical before and after `up --remove-existing-container` |
| Copied workspace (codebay's copy model) → isolated | copy got distinct volume `node_modules-03cbacriq422u05ocs8cqlauk9uhi98nbaqh13vvjglgmq61sv39` |

## Architecture

Three changes:

1. **`scripts/generate.mjs`** — volumes branch mount template becomes
   `source=${dir}-\${devcontainerId},…` (one line). The volume-ownership
   `chown` in postCreate is unaffected (it targets the container path, not the
   volume name).
2. **`layers/base/LAYER.md`** — relax "`project` is the workspace folder
   basename, never the package name": the collision rationale is gone; the
   rule survives only as "names the config for humans".
3. **`layers/volumes/LAYER.md`** — gate gains the volume-name check (mount
   line must show a `«dir»-<devcontainerId>` volume); report notes gain a
   "Using with codebay" note: keep the claude-code feature (codebay installs
   creds but not the binary for BYO configs); the credential transport is a
   harmless no-op under codebay (`--stage` exits 0 when it finds nothing);
   `${localEnv:HOME}` bind mounts resolve only when the manager runs from
   source on the same host, not from its Docker-outside-of-Docker image.

README gets the same codebay note, one paragraph.

## Data Model

Selection contract unchanged:
`{ project, base: {image, source}, layers: {claude, volumes, shell}, remoteUser?, detection, shellEnv? }`.
No new fields — the whole point.

## Error Handling

- Older devcontainer CLI without `${devcontainerId}` support would pass the
  literal string through as a volume name; the volumes gate (mount check)
  catches it because the volume name would contain `$`. No special handling —
  the existing gate discipline covers it.
- Existing users of `«project»-«dir»` volumes: first `up` after regeneration
  creates a fresh volume → one slow reinstall, already the documented
  first-start behavior. The old named volume is orphaned; report notes tell
  the user they can `docker volume rm` it.

## Testing Strategy

- **Unit (`test/generate.test.mjs`)** — `generate()` is pure: assert the
  volumes branch emits the `«dir»-${devcontainerId}` form; assert claude/shell
  output is byte-identical to before (the regression pin moves only where the
  design moves it).
- **Integration (manual gate, evidence pasted)** — the two-claim fixture test
  above: up → recreate → same volume name; copy dir → up → different volume
  name. Already run and passing; re-run on the implementation branch.

## Principles Applied

- **Single Source of Truth** — `generate.mjs` remains the only composer;
  "codebay-ness" never becomes a second place that knows the mount format.
  ("When truth is scattered, changes require finding all copies.")
- **Data Drives Behavior** — considered honestly: approach 1 was the
  data-driven variant, and we rejected the flag entirely. A default that needs
  no configuration beats behavior configured by data. No new branches, no new
  data.
- **Pure Functions for Testability** — `generate()` stays a pure
  selection-in / config-out function; the change is covered by input/output
  assertions with no Docker in the loop. The Docker-dependent claims are
  isolated at the I/O boundary as a manual gate with pasted evidence.
- **Deviations** — none.

## Open Questions

- Does codebay want this upstream as its *generated-default* config too (it
  currently generates configs only for projects without a devcontainer)?
  Raise in the SanCoca/Stanislav thread alongside the skill PR.
- mochi's `init-firewall.sh` is a working network-egress layer — the missing
  piece the claude LAYER's report notes allude to. Separate design.
