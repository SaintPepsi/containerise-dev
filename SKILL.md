---
name: containerise-dev
description: Turn any repo into a containerised dev environment (devcontainer + optional Claude Code pass-through) with known pitfalls fixed by default. USE WHEN containerise, devcontainer, dev container, containerised development, run claude in a container, isolate dev environment, parallel dev environments.
---

# containerise-dev

> ⚠️ **EXPERIMENTAL** — this skill is under active improvement. Please lodge any
> friction as issues: https://github.com/SaintPepsi/containerise-dev/issues

A router that assembles a run just-in-time: modes collect the user's choices,
and only the chosen layers' instructions get loaded. Do not read layer files
before their layer is selected.

1. State the experimental notice above to the user (one line, with the link).
2. Ask (AskUserQuestion, header "Approach"): **"How would you like to
   containerise?"**
   1. **Detect and propose** — I scan the repo, propose a full config, you
      confirm once.
   2. **Full wizard** — a question per decision, with detection as context.
3. Read the chosen mode file and follow it:
   - `./detect-first/SKILL.md`
   - `./wizard/SKILL.md`
   The mode returns a layer selection:
   `{ base: { image, source }, layers: { claude, volumes, shell, skills }, testCommand }`.
4. **Assemble the run.** For `base` plus each selected layer, read
   `./layers/«name»/LAYER.md`. Each carries its own Generate steps, Gate(s),
   and Report notes. Compose:
   - the generation plan — config composition is `./scripts/generate.mjs`
     (selection JSON in, devcontainer.json out; see `layers/base/LAYER.md`),
     plus each layer's remaining manual steps,
   - the **gate checklist** — base's build + suite gates first, then each
     selected layer's gate, in selection order.
5. Execute generation, then run every gate on the checklist. Evidence means
   pasted command output; a gate without its output is not passed.
6. **Report**: what was generated and why (base image source), the gate
   evidence, each included layer's Report notes, anything **UNVERIFIED**
   stated plainly.
7. **Retro (required).** From this run's concrete friction only (a command
   that failed, a question the flow didn't cover, a repo shape detection
   missed — cite it), answer: what would you **add / update / remove** in
   containerise-dev? Present it, then offer to lodge it:
   `gh issue create --repo SaintPepsi/containerise-dev --title "retro(«target»): «change»" --body "«friction + evidence + proposal»"`
   Never file without the user's explicit yes; no friction → say so, skip the
   issue, do not invent one.

Reference (load just-in-time): `./references/pitfalls.md` — why the layers
exist, with the real-world breakage behind each.
