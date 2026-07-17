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
   4. **Test command** for Gate 2 — confirm `commands.test` or take a
      correction; "none" is a valid answer and flags the run UNVERIFIED.
3. Produce the layer selection contract
   (`{ base: { image, source }, layers: { claude, volumes } }`).

Hand the layer selection to `../PIPELINE.md` and follow it.
