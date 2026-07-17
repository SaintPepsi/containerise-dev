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
  - **Volume + user fixes**: named volumes over dependency dirs (so container
    installs can't corrupt your host `node_modules`) and a non-root user.
- `scripts/devcontainer-auth.mjs` — vendored transport script (only with the
  Claude layer).

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
