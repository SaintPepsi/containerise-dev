# Layer: claude — Claude Code pass-through

Installs the official claude-code feature and transports the host's existing
sign-in into the container, surviving rebuilds (`references/pitfalls.md` §3).

## Generate

Config (feature, lifecycle hooks, deps install) comes from `generate.mjs` —
this layer's remaining manual steps:

1. Vendor `scripts/devcontainer-auth.mjs` from this skill into the target
   repo's `scripts/`.
2. Append to the target's `.gitignore`: `.devcontainer/.claude-creds.json`.

## Gate

`npx --yes @devcontainers/cli exec --workspace-folder . claude -p "reply with exactly: authorized" --model haiku`
Pass: replies `authorized` with no login prompt — paste the reply.
Fail (login prompt appeared): the transport didn't run. Check the staged file
was created on the host and `postCreateCommand` ran; fallback:
`node scripts/devcontainer-auth.mjs --stage` then
`node scripts/devcontainer-auth.mjs` (one-shot inject into the running
container).

## Report notes

- macOS may prompt once to allow Keychain access (the `security` call — expected).
- The user's Claude OAuth token now lives inside this container; fine for
  trusted repos, and the reason unattended `--dangerously-skip-permissions` use
  should wait for a network-egress layer.
