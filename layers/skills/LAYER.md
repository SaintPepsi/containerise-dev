# Layer: skills — the host's Claude setup in the container

Two modes (selection: `layers.skills: 'home' | 'skills' | false`; `true` is a
back-compat alias for `'skills'`):

- **`home`** — read-write bind of the host's whole `~/.claude` onto the
  container user's `~/.claude`: skills, session history, settings, memory.
  Sessions started in the container land on the host, so they survive
  rebuilds and container removal by construction. For personal machines and
  trusted repos.
- **`skills`** — read-only bind of `~/.claude/skills` only. For shared or
  cautious setups (`references/pitfalls.md` §5 for the ownership trap this
  mode defuses).

## Generate

Everything comes from `generate.mjs`. Requires a non-root `remoteUser`, same
rule as the volumes layer. No manual steps.

- `home`: one rw bind, no parent fix (the bind owns `~/.claude`). **Say the
  §6 caveat out loud before building** when the claude layer is also on: the
  credential install writes `~/.claude/.credentials.json` *through the bind
  onto the host* — on macOS (keychain-only hosts) that file is new host
  state. The user must have accepted that trade.
- `skills`: ro bind plus the `.claude` parent chown, ordered before the
  claude layer's credential install (that ordering is the §5 fix).

## Gate

**`home` mode** — write-through both ways, then session persistence:

```
npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'ls ~/.claude/skills | wc -l; touch ~/.claude/.oj-probe'
ls ~/.claude/.oj-probe && rm ~/.claude/.oj-probe   # host — probe must exist here
```

Pass: container skills count equals the host's `ls ~/.claude/skills | wc -l`,
AND the container-created probe appears on the host (that write-through is
what makes sessions survive). Paste both.

**`skills` mode** — count parity, then the read-only guarantee:

```
ls ~/.claude/skills | wc -l   # host
npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'ls ~/.claude/skills | wc -l; touch ~/.claude/skills/.probe 2>&1'
```

Pass: counts equal AND the touch fails with `Read-only file system` — paste
both. A count of 0 with skills present on the host means the bind resolved to
nothing (see report notes); the touch *succeeding* means the mount silently
fell back to a writable dir — fail, investigate.

## Report notes

- `home` mode: the container can modify everything under the host's
  `~/.claude` — that is the point, and the risk. Session history from
  container work appears in the host's `~/.claude/projects/` under the
  container workspace path (`/workspaces/…`), separate from host sessions of
  the same repo.
- `home` + claude layer: credentials land on the host as a mode-600 file
  (pitfalls §6) — keychain-only macOS hosts gain a plaintext credentials
  file they didn't have.
- `${localEnv:HOME}` resolves where `devcontainer up` runs. Under a
  Docker-outside-of-Docker manager (e.g. codebay's published image) that is
  the manager's container, so the bind arrives empty — not an error, just
  absent. Running the manager from source on this host resolves normally.
- Skill directories that are symlinks on the host resolve on the *host* side
  of the bind; targets outside the bound tree won't exist in-container.
