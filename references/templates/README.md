# Templates — layers as data

The generated `.devcontainer/devcontainer.json` is `base.jsonc` plus one file per
selected layer, merged by the model:

- **Shallow key merge**: a layer's top-level keys are added to base; arrays
  (`mounts`) concatenate.
- **`postCreateCommand` segments join with `&&`** in layer order.
- **`«placeholders»`** are substituted from detection output + confirmed choices,
  never left in the generated file.

Adding a future layer (firewall, worktree parallelism) = adding a
`layer-<name>.jsonc` here plus its gate in `../../PIPELINE.md`. The mode files and
router never change (data drives behavior).
