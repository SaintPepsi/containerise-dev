# Mode: detect and propose

Scan first, propose a complete config, confirm once.

1. Run `node «this skill's directory»/scripts/detect.mjs «target repo path»` and
   read the JSON.
2. If `host.docker` is false: stop — point the user at Docker installation
   before anything is generated.
3. Build a proposal:
   - **Base image:** prefer a `trustedImages` entry (state the source — "your
     `test:snapshots` script already runs this image"). None found → propose the
     official image for the detected toolchain and say it's a fallback, not a
     repo signal.
   - **Claude layer:** default ON iff `host.claudeCredentials` is not `none`.
   - **Volumes layer:** default ON iff `dependencyDirs` is non-empty.
4. Present the whole proposal as ONE AskUserQuestion round: accept as-is /
   toggle layers / change base image (multiSelect where it helps). Include the
   test command you'll use for Gate 2 so the user can correct it now.
5. Produce the layer selection contract
   (`{ base: { image, source }, layers: { claude, volumes } }`).

Hand the layer selection to `../PIPELINE.md` and follow it.
