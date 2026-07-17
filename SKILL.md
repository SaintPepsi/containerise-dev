---
name: containerise-dev
description: Turn any repo into a containerised dev environment (devcontainer + optional Claude Code pass-through) with known pitfalls fixed by default. USE WHEN containerise, devcontainer, dev container, containerised development, run claude in a container, isolate dev environment, parallel dev environments.
---

# containerise-dev

> ⚠️ **EXPERIMENTAL** — this skill is under active improvement. Please lodge any
> friction as issues: https://github.com/SaintPepsi/containerise-dev/issues

1. State the experimental notice above to the user (one line, with the link).
2. Ask (AskUserQuestion, header "Approach"): **"How would you like to
   containerise?"**
   1. **Detect and propose** — I scan the repo, propose a full config, you
      confirm once.
   2. **Full wizard** — a question per decision, with detection as context.
3. Read the chosen mode file and follow it:
   - `./detect-first/SKILL.md`
   - `./wizard/SKILL.md`
4. The mode file hands off to `./PIPELINE.md`. Follow it to the end — the gates
   want pasted evidence, and the retro step is part of the run, not optional.

Reference material (load just-in-time, not upfront): `./references/pitfalls.md`
for why the config looks the way it does, `./references/templates/` for the
layer data and merge rules.
