# Layer: volumes — dependency volumes + non-root user

Prevents container installs from corrupting the host's dependency directories
through the bind mount, and unblocks unattended Claude use
(`references/pitfalls.md` §1 and §2).

## Generate

Mounts, `remoteUser`, and the volume-ownership `chown` (a fresh named volume
is root-owned; without the chown the first install dies with EACCES) all come
from `generate.mjs`. This layer's remaining manual step:

1. Pick a non-root `remoteUser` and **verify it exists in the base image
   before writing it**: `docker run --rm «image» id «user»` (e.g. `pwuser` in
   Playwright images, `node` in node images). The chown uses `sudo` — if the
   base image lacks sudo and the shell layer (common-utils, which installs it)
   is off, flag that to the user before building.

## Gate

`npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'mount | grep «dir»; id -un'`
Pass: each dependency dir shows a volume mount (not the host bind), and the
user is the non-root `remoteUser`. Paste both lines.
Disconfirming check after the suite gate has run — **inspect the host dir
directly, never via `git status`** (dependency dirs are almost always
gitignored, so a git check passes vacuously whether or not a leak occurred):
record the host `«dir»`'s existence and entry count before the build, compare
after the suite (`ls «target»/«dir» 2>/dev/null | wc -l`). Unchanged = the
container's installs stayed in the volume. Distinguish outcomes honestly: a
host dir that was never installed into is *absent* (expected on a fresh
worktree), not *corrupted*; only report corruption if pre-existing host
content changed.

## Report notes

- First container start repopulates dependencies into the volume; expect one
  slow install.
