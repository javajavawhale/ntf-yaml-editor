# NTF YAML Editor Test Cases

## Automated Coverage

Run with:

```sh
npm test
```

### Unit Tests

Covered by `npm run test:unit`:

- Block classification for `LIST_MAP`, `SETUP_TABLE`, `EXPECTED_TABLE`, `SETUP_VARIABLE`, and `EXPECTED_VARIABLE`.
- Parsing table rows and quoted special keys such as `"[no]"`.
- Serializing special keys with quotes so YAML does not reinterpret them.
- Preserving YAML null sentinel cells (`~`) used by empty table column definitions.
- Keeping empty strings (`""`) distinct from YAML null (`~`).
- Preserving empty table blocks with no rows.
- Preserving Japanese, long text, commas, quotes, and backslashes in table cells.
- Parsing and serializing RawRows blocks for `SETUP_VARIABLE` / `EXPECTED_VARIABLE`.
- Preserving unsupported fixed-length blocks as raw text.
- Loading `converted/ProjectActionRequestTest.yaml` and checking key editor targets.
- Loading a migrated web fixture with null sentinel rows.
- Analyzing common structural issues: missing required `testShots` columns, missing numbered references, ragged RawRows.
- CLI lint behavior: non-zero for errors, zero for warning-only diagnostics.

### E2E Tests

Covered by `npm run test:e2e` using `@vscode/test-electron`:

- Starts a real VS Code Extension Host with this extension loaded.
- Activates `local.ntf-yaml-editor`.
- Confirms `ntfYaml.openAsTable` is registered.
- Confirms the generated Webview HTML contains table-editor controls and RawRows rendering code.
- Opens a YAML file with the `ntfYaml.editor` custom editor.
- Opens the active text editor through `NTF YAML: Open as Table`.
- Round-trips `converted/ProjectActionRequestTest.yaml` through the extension save path and checks critical YAML shape.
- Round-trips a migrated web fixture and checks `~` null sentinel rows are preserved.

The E2E runner downloads a test VS Code build under `.vscode-test/`. In this environment, VS Code/Electron needs to run outside the filesystem/network sandbox.

## Manual Smoke Checklist

Use this after automated tests pass:

1. Open `converted/ProjectActionRequestTest.yaml` with `NTF YAML Table Editor`.
2. Select `confirmOfCreateNormal`.
3. Confirm `LIST_MAP=testShots` and `LIST_MAP=requestParams` render as tables.
4. Confirm the `"[no]"` column is shown as a normal editable column.
5. Select a sheet containing `EXPECTED_VARIABLE` and confirm it renders as a row/cell table.
6. Save without editing and confirm `npm test` still passes.
7. For final confidence, run the relevant Maven test in the sample repository after saving.
