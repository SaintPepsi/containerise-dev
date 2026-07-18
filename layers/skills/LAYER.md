# Layer: skills — global Claude skills in the container

Read-only bind of the host's `~/.claude/skills` into the container user's
`~/.claude/skills`, so globally installed skills work inside without copying
(`references/pitfalls.md` §5 for the ownership trap this layer defuses).

## Generate

Mount and the `.claude` parent-ownership fix both come from `generate.mjs`
(the parent chown is ordered before the claude layer's credential install —
that ordering is the §5 fix). Requires a non-root `remoteUser`, same rule as
the volumes layer. No manual steps.

## Gate

Host count vs container count, then the read-only guarantee:

```
ls ~/.claude/skills | wc -l   # host
npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'ls ~/.claude/skills | wc -l; touch ~/.claude/skills/.probe 2>&1'
```

Pass: counts equal AND the touch fails with `Read-only file system` — paste
both. A count of 0 with skills present on the host means the bind resolved to
nothing (see report notes); the touch *succeeding* means the mount silently
fell back to a writable dir — fail, investigate.

## Report notes

- The mount is read-only: skills are edited on the host, never in-container.
- `${localEnv:HOME}` resolves where `devcontainer up` runs. Under a
  Docker-outside-of-Docker manager (e.g. codebay's published image) that is
  the manager's container, so skills arrive empty — not an error, just
  absent. Running the manager from source on this host resolves normally.
- Skill directories that are symlinks on the host resolve on the *host* side
  of the bind; targets outside `~/.claude/skills` won't exist in-container.
