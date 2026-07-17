# Layer: volumes — dependency volumes + non-root user

Prevents container installs from corrupting the host's dependency directories
through the bind mount, and unblocks unattended Claude use
(`references/pitfalls.md` §1 and §2).

## Generate

1. Merge `./template.jsonc`: one named volume mount per detection
   `dependencyDirs` entry, volume name `«project»-«dir»`.
2. Pick a non-root `remoteUser` and **verify it exists in the base image
   before writing it**: `docker run --rm «image» id «user»` (e.g. `pwuser` in
   Playwright images, `node` in node images).

## Gate

`npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'mount | grep «dir»; id -un'`
Pass: each dependency dir shows a volume mount (not the host bind), and the
user is the non-root `remoteUser`. Paste both lines.
Disconfirming check after the suite gate has run: `git -C «target» status
--porcelain «dir»` on the **host** stays empty and host-native binaries still
load — container installs must not have leaked through.

## Report notes

- First container start repopulates dependencies into the volume; expect one
  slow install.
