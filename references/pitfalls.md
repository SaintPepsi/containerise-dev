# Known pitfalls — why the generated config looks the way it does

Each trap below was hit for real while containerising OpenJam
([SaintPepsi/openjam#38](https://github.com/SaintPepsi/openjam/issues/38)).
Symptom → cause → fix → the template knob that applies it.

## 1. Bind-mount dependency corruption

**Symptom:** after running the container once, the *host* build breaks (native
binaries fail to load).
**Cause:** the workspace is a bind mount; `npm ci` (or any install) inside the
container rewrote the host's `node_modules` with Linux binaries.
**Fix:** a named volume mounted over each dependency directory, so container
installs land in the volume and never touch the host's copy.
**Knob:** `layer-volumes.jsonc` — one mount per detected `dependencyDirs` entry.

## 2. Root user blocks unattended Claude

**Symptom:** `claude --dangerously-skip-permissions` refuses to start in the
container.
**Cause:** many tool images (e.g. Playwright's) default to root, and the CLI
rejects that flag as root by design.
**Fix:** set a non-root `remoteUser` that exists in the base image.
**Knob:** `layer-volumes.jsonc` `remoteUser`. Interactive `claude` works as root;
this only bites unattended use — still set it, it costs nothing.

## 3. Rebuild wipes Claude sign-in

**Symptom:** after "Rebuild Container", `claude` demands a fresh login.
**Cause:** credentials live in the container's writable layer, which a rebuild
discards (stop/start is fine; rebuild is not).
**Fix:** re-inject on every create: `initializeCommand` stages credentials on the
host, `postCreateCommand` installs them in the container. `postCreateCommand`
runs on every rebuild, so auth reappears on its own.
**Knob:** `layer-claude.jsonc` hooks + the vendored `scripts/devcontainer-auth.mjs`.

## 4. Personal files ride the bind mount

**Symptom:** personal, gitignored files (e.g. `.claude/settings.local.json` with
absolute host paths) are visible inside the container.
**Cause:** bind mounts carry the whole directory, gitignored or not. Usually
harmless, but it leaks host usernames/paths to anything running inside.
**Fix (awareness, not config):** keep secrets out of the workspace directory; a
planned worktree-based parallelism layer avoids it by construction (fresh
worktrees contain only tracked files).
**Knob:** none yet — mentioned in the generated report so users know.

## 5. Bind mount auto-creates a root-owned parent

**Symptom:** with a skills mount at `~/.claude/skills`, the claude layer's
credential install dies: `EACCES: permission denied, open
'/home/«user»/.claude/.credentials.json'`.
**Cause:** Docker creates every missing directory on the bind target's path as
root — mounting `~/.claude/skills` creates `~/.claude` root-owned, and the
non-root user can't write beside the mount.
**Fix:** `postCreateCommand` chowns the parent (`sudo mkdir -p ~/.claude &&
sudo chown «user» ~/.claude`) — non-recursive, so the read-only mount itself
is never touched — ordered **before** `devcontainer-auth.mjs --install`.
**Knob:** the skills layer emits both the mount and the ordered chown
(`layers/skills/LAYER.md`).

## 6. Whole-home bind writes credentials onto the host

**Symptom:** after using skills mode `home` with the claude layer, the host
gains `~/.claude/.credentials.json` — surprising on macOS, where credentials
previously lived only in the Keychain.
**Cause:** the credential install writes `$CLAUDE_CONFIG_DIR/.credentials.json`
inside the container; with `~/.claude` bound read-write, that write lands on
the host.
**Fix (awareness, not config):** the file is mode 600 and holds the same OAuth
token the Keychain already holds. If a plaintext credentials file on the host
is unacceptable, use skills mode `skills` (read-only, creds stay
container-local) instead.
**Knob:** none — the layer's Generate step requires saying this before
building in `home` mode.
