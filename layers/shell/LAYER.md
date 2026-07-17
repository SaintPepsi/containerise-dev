# Layer: shell — the user's preferred shell

Makes the container terminal feel like home: installs the user's shell and
makes it the default. Personal dotfiles stay at the user level, never in
project config.

## Generate

1. Run `node «this skill's directory»/scripts/shell-env.mjs` and read the JSON
   (`{ shell, rcFiles, frameworks, dotfilesRepo }`).
2. Merge `./template.jsonc`, substituting from that JSON (zsh install +
   default-shell flags, oh-my-zsh iff detected). Use the same `remoteUser` as
   the volumes layer when both are selected.
3. Dotfiles guidance for the report (do NOT write into project config — it's
   personal, teammates get their own):
   - `dotfilesRepo` found → tell the user to set
     `"dotfiles.repository": "«repo»"` in user-level VS Code settings, or pass
     `--dotfiles-repository «repo»` to `devcontainer up`.
   - none found → mention that a dotfiles repo is the durable fix for "my
     shell feels foreign in every container".

## Gate

`npx --yes @devcontainers/cli exec --workspace-folder . bash -c 'getent passwd $(id -un) | cut -d: -f7 && «shell» --version'`
Pass: default-shell line ends in `«shell»` and the version prints. Paste both.
Disconfirming: if the layer was declined, the container default stays the
image's own shell — do not install anything.
