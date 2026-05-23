# Cell Diff Scenario

Use this fixture to create a temporary SCM diff in VS Code Source Control.
The fixture is only an input for manual review. It is not a specification source.

```sh
tmp=/tmp/ntf-yaml-cell-diff-scenario
rm -rf "$tmp"
mkdir -p "$tmp"
cd "$tmp"
git init
git config user.email ntf-yaml@example.test
git config user.name "NTF YAML Test"
cat > scenario.ntf.yaml <<'YAML'
changedSheet:
  LIST_MAP=changedRows: #ListMap
    - name: "before cell for ref check"
      note: "same"
      1o: "1"
      "ｓｓ": ""

  SETUP_TABLE=DELETE_BLOCK: #ListMap
    - ID: "1"
      NAME: "before block row"
YAML
git add scenario.ntf.yaml
git commit -m base
cp /home/happy/nablarch/vscode-ntf-yaml-editor/test/fixtures/diff-scenarios/cell-diff-head.ntf.yaml "$tmp/scenario.ntf.yaml"
code "$tmp"
```

Then open the Extension Development Host and use Source Control > Changes > `scenario.ntf.yaml`.
The expected result is that copying `cell-diff-head.ntf.yaml` over the committed base creates a visible SCM diff.

Expected coverage:

- `changedSheet`: changed sheet, changed cells, added rows, changed blocks.
- `sasaki`: added sheet.
- SCM diff head pane can be edited as the working-tree side.
