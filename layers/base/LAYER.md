# Layer: base (always included)

## Generate

Composition is mechanical and lives in `scripts/generate.mjs` — do not
hand-merge. Build the selection JSON and pipe it through:

```bash
node «skill dir»/scripts/generate.mjs <<'EOF' > .devcontainer/devcontainer.json
{ "project": "«workspace folder basename»",
  "base": { "image": "«chosen image»", "source": "«detection source»" },
  "layers": { "claude": …, "volumes": …, "shell": … },
  "remoteUser": "«required when volumes or shell on»",
  "detection": «detect.mjs output»,
  "shellEnv": «shell-env.mjs output, when shell layer on» }
EOF
```

- Input contract: `detection` is the **entire** `detect.mjs` JSON object
  nested under that key (same for `shellEnv` from `shell-env.mjs`), and
  `remoteUser` is **required** whenever the volumes or shell layer is on.
  `scripts/generate.mjs`'s header comment is the authoritative spec.
- **`project` is the workspace folder basename, never the package name** — it
  names docker volumes, and package-derived names collide across worktrees of
  the same package.
- Base image: prefer a detection `trustedImages` entry and state its source in
  the report; a toolchain-official image is the fallback, named as such.
- **Never overwrite an existing `.devcontainer/`** — show a diff-style
  proposal of what you'd add and stop for the user's call.

## Gates

**Build.** `npx --yes @devcontainers/cli up --workspace-folder .`
Pass: final JSON outcome line contains `"outcome":"success"` — paste it.
Fail: stop and fix; nothing else runs on a broken build.

**Suite.** Use the RUNNER form from detection (`commands.test`, e.g.
`npm test`) — never the raw script body, which loses `node_modules/.bin` from
PATH:
`npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'export CI=1; «commands.test»'`
(`export CI=1;` so it covers every segment of a compound command; never set CI
in `containerEnv` — it strips colors from every terminal in the container.)
Pass: each suite segment's own summary line pasted (a compound command like
`build && bun test && playwright test` produces one per runner, e.g.
`90 pass` and `37 passed` — paste them all).
No test command detected: run the build/run command instead and mark the final
report **UNVERIFIED** — that word, prominently.

## Report notes

Always include: the workspace is a bind mount, so gitignored personal files
(e.g. `.claude/settings.local.json`) ride into the container — see
`../../references/pitfalls.md` §4.
