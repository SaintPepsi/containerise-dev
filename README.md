# containerise-dev

A [Claude Code skill](https://code.claude.com/docs/en/skills) that turns any repo
into a containerised dev environment: it scans your project, proposes a
`.devcontainer/` (base image your repo already trusts, optional Claude Code
pass-through, volume fixes), and won't call it done until your own test suite
passes **inside** the container.

> ⚠️ **EXPERIMENTAL.** This skill is young and improves through use — every run
> ends with a retro asking what to add/update/remove. Hit friction? Please
> [open an issue](https://github.com/SaintPepsi/containerise-dev/issues).

## Install

```bash
# available in every project:
git clone https://github.com/SaintPepsi/containerise-dev ~/.claude/skills/containerise-dev

# or just one project:
git clone https://github.com/SaintPepsi/containerise-dev <project>/.claude/skills/containerise-dev
```

Requirements: Docker running, Node ≥ 20 on the host. Then in Claude Code, in the
repo you want to containerise:

```
/containerise-dev
```

It asks how you'd like to work (detect-and-propose, or a full wizard), then
generates and verifies.

## What it generates

- `.devcontainer/devcontainer.json` — base image picked from signals your repo
  already trusts (CI images, docker-run scripts), `CI=1`, and per selected layer:
  - **Claude pass-through**: the official
    [claude-code feature](https://github.com/anthropics/devcontainer-features)
    plus credential transport — your host sign-in (macOS Keychain or
    `~/.claude/.credentials.json`) is staged by `initializeCommand` and installed
    by `postCreateCommand`, so `claude` works in the container terminal
    immediately and **survives rebuilds**. The staged file is gitignored and
    deleted after install.
  - **Volume + user fixes**: `${devcontainerId}`-keyed volumes over dependency
    dirs (so container installs can't corrupt your host `node_modules`) and a
    non-root user. Id-keyed names cache across rebuilds but stay distinct per
    workspace path, so parallel copies of a project — git worktrees,
    [codebay](https://github.com/khromov/codebay) instances — never share a
    dependency volume. The result runs unchanged under codebay: keep the
    Claude layer (codebay copies credentials but doesn't install the binary
    for projects shipping their own devcontainer).
  - **Preferred shell**: detects your host shell (zsh, oh-my-zsh, starship,
    dotfiles repo) and installs it as the container default; personal dotfiles
    are guided to the user-level `dotfiles.repository` setting, never baked
    into project config.
- `scripts/devcontainer-auth.mjs` — vendored transport script (only with the
  Claude layer).

Internally the skill is a router over self-contained layers
(`layers/*/LAYER.md` holds each layer's generation steps and verification
gate; `scripts/generate.mjs` does the mechanical config composition); only the
layers you select get loaded, and the final gate checklist is assembled from
your selection.

## The gates

It's not done when the container builds. Evidence required, in order:

1. `devcontainer up` succeeds
2. **your repo's own test suite passes in the container**
3. `claude -p` answers in-container without a login prompt (if that layer is on)

No test suite → it says **UNVERIFIED**, loudly, rather than pretending.

## Known unknowns

- Linux host credential path (`~/.claude/.credentials.json`) is implemented but
  untested — trial reports welcome.
- Only tested from VS Code + CLI flows; JetBrains devcontainer support untested.
- Windows hosts: untested entirely.

## Provenance

Distilled from containerising [OpenJam](https://github.com/SaintPepsi/openjam)
by hand ([spike #38](https://github.com/SaintPepsi/openjam/issues/38)): the
pitfall list in `references/pitfalls.md` is things that actually broke, not
things that might.

MIT.
