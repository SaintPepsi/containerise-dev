# Layer: base (always included)

## Generate

Merge `./template.jsonc` as the foundation. Substitute `«project»` and
`«base image»` — prefer a detection `trustedImages` entry and state its source in
the report ("your CI already runs this image"); a toolchain-official image is the
fallback, named as such.

Merge rules for layers stacking on this one: shallow key merge; arrays
(`mounts`) concatenate; `postCreateCommand` segments join with `&&` in layer
order; no `«placeholder»` may survive into the generated file.

**Never overwrite an existing `.devcontainer/`** — show a diff-style proposal of
what you'd add and stop for the user's call.

## Gates

**Build.** `npx --yes @devcontainers/cli up --workspace-folder .`
Pass: final JSON outcome line contains `"outcome":"success"` — paste it.
Fail: stop and fix; nothing else runs on a broken build.

**Suite.** `npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'CI=1 «test command»'`
Pass: the suite's own summary line pasted (e.g. `37 passed`).
No test command detected: run the build/run command instead and mark the final
report **UNVERIFIED** — that word, prominently.
(`CI=1` goes on this command only, never in `containerEnv` — a global `CI` strips
colors and interactivity from every terminal in the container.)

## Report notes

Always include: the workspace is a bind mount, so gitignored personal files
(e.g. `.claude/settings.local.json`) ride into the container — see
`../../references/pitfalls.md` §4.
