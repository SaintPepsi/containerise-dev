# Mode: full wizard

One question per decision, detection as context rather than proposal.

1. Run `node «this skill's directory»/scripts/detect.mjs «target repo path»` and
   read the JSON. If `host.docker` is false: stop — point the user at Docker
   installation first.
2. Ask, one AskUserQuestion at a time:
   1. **Base image** — options: each `trustedImages` entry (with its source as
      the description), plus the official toolchain image as fallback.
   2. **Claude pass-through** — explain in one line what the transport does
      (host sign-in copied into the container via lifecycle hooks; survives
      rebuilds) and that `host.claudeCredentials` is `«value»`. On/off.
   3. **Volume + user fixes** — explain the bind-mount corruption trap in one
      line (container installs rewriting host `«dependencyDirs»`). On/off.
   4. **Preferred shell** — run
      `node «this skill's directory»/scripts/shell-env.mjs` first; offer to
      install their shell (`«shell»`, plus `«frameworks»` if any) as the
      container default. On/off.
   5. **Global skills** — mount `~/.claude/skills`
      (`host.claudeSkillsCount` is `«N»`) read-only into the container, so
      global skills work inside. On/off; skip the question when the count is 0.
   6. **Test command** for the suite gate — confirm `commands.test` or take a
      correction; "none" is a valid answer and flags the run UNVERIFIED.
3. Produce the layer selection contract
   (`{ base: { image, source }, layers: { claude, volumes, shell, skills }, testCommand }`).

Return the layer selection to the router (`../SKILL.md` step 4), which
assembles the run from the chosen layers.
