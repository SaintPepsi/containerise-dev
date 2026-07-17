# Pipeline — generate → gates → report → retro

Both modes hand in here with the same inputs. Follow every section in order; the
retro is part of the pipeline, not optional.

## Inputs

- **Layer selection** from the mode file:
  `{ base: { image, source }, layers: { claude: bool, volumes: bool } }`
- **Detection JSON** from `scripts/detect.mjs` (already run by the mode).

## 1. Generate

1. Compose `.devcontainer/devcontainer.json` from `references/templates/` per the
   selected layers (merge rules in `references/templates/README.md`). Substitute
   every `«placeholder»`; none may survive into the generated file.
2. **Existing `.devcontainer/` → never overwrite.** Show the user a diff-style
   proposal of what you'd add to their config and stop for their call.
3. If `layers.claude`: copy `scripts/devcontainer-auth.mjs` from this skill into
   the target repo's `scripts/`, and append to the target's `.gitignore`:
   `.devcontainer/.claude-creds.json`.
4. If `layers.volumes`: confirm the chosen `remoteUser` actually exists in the
   base image (`docker run --rm «image» id «user»`) before writing it.

## 2. Gates

Evidence means pasted command output, not assertion. Each gate names its
disconfirming condition.

**Gate 1 — build.** `npx --yes @devcontainers/cli up --workspace-folder .`
Pass: final line is a JSON outcome with `"outcome":"success"`. Paste it.
Fail: stop, fix, re-run — do not proceed on a broken build.

**Gate 2 — suite.** Run the detected test command via
`npx --yes @devcontainers/cli exec --workspace-folder . «test command»`.
Pass: the suite's own summary line pasted (e.g. `37 passed`).
No test command detected: run the build/run command instead and mark the final
report **UNVERIFIED** — say exactly that word, prominently.

**Gate 3 — Claude (only if `layers.claude`).**
`npx --yes @devcontainers/cli exec --workspace-folder . claude -p "reply with exactly: authorized" --model haiku`
Pass: it replies `authorized` with no login prompt. Paste the reply.
Fail (login prompt appeared): the transport didn't run — check the staged file
was created on the host and `postCreateCommand` ran; re-run `--stage` then
`node scripts/devcontainer-auth.mjs` (one-shot mode) as a fallback.

## 3. Report

Tell the user, in this order:

1. What was generated (files, layers chosen, base image **and why** — cite the
   detection source, e.g. "your CI already runs this image").
2. Gate evidence (the pasted outputs).
3. Which pitfalls from `references/pitfalls.md` apply to their repo, one line
   each (always include pitfall 4 — personal files ride bind mounts).
4. Anything UNVERIFIED, stated plainly.

## 4. Retro (required)

From this run's **concrete friction only** (a command that failed, a question
the flow didn't cover, a repo shape detection missed — cite it), answer:

> What would you **add / update / remove** in containerise-dev?

Present your answer to the user, then offer to lodge it:

```
gh issue create --repo «skill repo» \
  --title "retro(«target repo name»): «one-line change»" \
  --body "«the friction, with the command/output that showed it, and the proposed add/update/remove»"
```

Rules: never file without the user's explicit yes in the moment; if there was
genuinely no friction, say so and skip the issue — do not invent one.
