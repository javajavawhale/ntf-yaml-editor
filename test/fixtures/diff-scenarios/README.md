# Cell Diff Scenario

Use this fixture to review A pattern coloring in VS Code Source Control.

```sh
tmp=/tmp/ntf-yaml-cell-diff-scenario
rm -rf "$tmp"
mkdir -p "$tmp"
cp test/fixtures/diff-scenarios/cell-diff-base.ntf.yaml "$tmp/scenario.ntf.yaml"
cd "$tmp"
git init
git config user.email ntf-yaml@example.test
git config user.name "NTF YAML Test"
git add scenario.ntf.yaml
git commit -m base
cp /home/happy/nablarch/vscode-ntf-yaml-editor/test/fixtures/diff-scenarios/cell-diff-head.ntf.yaml "$tmp/scenario.ntf.yaml"
code "$tmp"
```

Then open the Extension Development Host and use Source Control > Changes > `scenario.ntf.yaml`.

Expected coverage:

- `deletedSheet`: deleted sheet.
- `addedSheet`: added sheet.
- `changedSheet`: changed sheet, changed cells, added/deleted rows, added/deleted blocks.
- `blockOnlySheet`: changed block with a stable sheet.

