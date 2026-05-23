# NTF YAML Editor Test Policy

This document defines the current automated test types and expectation style for the NTF YAML Editor.
Manual UX scenarios are maintained separately in `docs/manual-test-plan.md`.

## Test Types

Use the test type that matches the behavior boundary being changed.

### Unit Tests

Command:

```sh
npm run test:unit
```

Runner:

- `node --test test/*.test.js`

Current files:

- `test/ntfYamlModel.test.js`
- `test/ntfYamlEditorWebview.test.js`
- `test/ntfYamlExtensionUtils.test.js`

`test:unit` contains several subtypes:

- Model tests for parse, serialize, canonical form, CLI lint analysis, and block classification.
- Cell Diff tests for `Diff Report` structure, row/cell status, Base/Head values, and Git ref text resolution.
- CLI tests for `lint`, `format`, `convert`, and `diff` argument/exit-code behavior.
- Webview DOM tests using jsdom for browser-side rendering, editing, messages, and diff highlighting.
- Extension utility tests for URI collection, Git URI query parsing, backing file path resolution, and diagnostic line lookup.

Unit tests should be the default place for new coverage. Prefer them whenever the behavior can be checked without launching VS Code or Chromium.

### UI Screenshot Tests

Command:

```sh
npm run test:ui
```

Runner:

- `node scripts/capture-ui-screenshots.js`

Scope:

- Generated editor HTML.
- SCM Diff base-pane HTML.
- Cell Diff Panel split layout.
- Cell Diff Panel unified layout.
- Standalone HTML Report controls/no-controls behavior.
- Raw Rows Cell Diff display.

These tests use Chromium and assert a UI contract through selectors and text checks:

- `visible`
- `hidden`
- `exists`
- `textPresent`
- `textAbsent`

They also write screenshots and generated HTML under `test-artifacts/ui-screenshots/`.
Treat them as layout and rendering smoke tests, not pixel-diff tests.

### E2E Tests

Command:

```sh
npm run test:e2e
```

Runner:

- `@vscode/test-electron`
- `test/e2e/runTest.js`
- `test/e2e/suite/ntfYamlEditor.e2e.js`

Scope:

- Extension activation.
- User-facing command registration.
- Custom editor opening through VS Code.
- Cell Diff Panel opening through VS Code command execution.
- No NTF YAML diagnostics are published from editor views.
- Extension save path round-trip for representative fixtures.
- Exported standalone Cell Diff HTML through extension-only E2E helper commands.

Use E2E tests only for VS Code integration behavior that cannot be proven well with unit or jsdom tests.
Do not put fine-grained model, diff, DOM, or CLI branching here.

### Full Automated Test

Command:

```sh
npm test
```

Current sequence:

```sh
npm run test:unit && npm run test:ui && npm run test:e2e
```

This is the full local regression gate for the extension.

### Performance Benchmark

Command:

```sh
npm run perf:diff
```

Runner:

- `node scripts/perf-diff-report.js`

Scope:

- Large `createDiffReport()` input sizes.
- Current benchmark scenarios include tail changes, middle deletion, and all-row changes.

This is not part of `npm test`.
Use it as a decision aid when changing Cell Diff internals or when there is a specific performance concern.
For the current PoC phase, 10,000 to 15,000 rows completing in the existing implementation is considered acceptable.

### Manual Tests

Document:

- `docs/manual-test-plan.md`

Scope:

- Visual UX checks that need human judgment.
- Real VS Code workflows that are expensive or brittle to automate.
- SCM interaction scenarios where manual observation is clearer than a narrow automated assertion.

Manual tests should not duplicate the full automated suite. They should focus on workflow confidence and visual sanity.

## Expectation Style

Choose the narrowest expectation that protects the behavior without making unrelated refactors painful.

### Exact Structure

Use `assert.deepEqual()` for stable internal contracts:

- Parsed `Model` shape when the exact structure matters.
- `Diff Report` sheets, blocks, rows, cells, `Diff Status`, and `headIndex`.
- CLI argument parse results.
- Lists of generated output filenames.

Use this for model-aware data, not for generated HTML strings.

### Single Values

Use `assert.equal()` for scalar facts:

- Exit codes.
- `baseRef`, `headRef`, `repositoryPath`, and file paths.
- Active sheet name.
- Boolean outcomes exposed as one value.
- DOM property values such as `readOnly` or input values.

### Important YAML Fragments

Use `assert.match()` or `assert.doesNotMatch()` for generated YAML when the test only cares about a meaningful fragment:

- A required block header remains present.
- A special key such as `"[no]"` is quoted.
- A `~` null sentinel is preserved.
- A renamed column appears and the old column does not.

Do not assert a whole YAML string unless the test is explicitly about canonical form or save-path round-trip.

### Canonical Form

For canonical YAML behavior, prefer these expectations:

- `serializeYaml(parseYaml(original))` produces a stable canonical string after one pass.
- `serializeYaml(parseYaml(canonical)) === canonical`.
- Representative fixtures keep required sheets, blocks, rows, and important cells.

Full string equality is appropriate when validating extension save path output against canonical serialization.

### CLI Lint Analysis

CLI lint analysis expectations should check behavior, not formatting noise:

- Severity when it is part of the contract.
- Message substring for the issue type.
- Path tokens when the diagnostic location matters.
- Exit code for CLI lint.

Editor views do not call NTF YAML Analysis and do not publish NTF YAML diagnostics.
VS Code diagnostic range lookup is legacy support and should not drive current view behavior.

### HTML And Webview Output

Do not compare full generated HTML.

Use targeted expectations:

- DOM selectors for controls and rendered regions.
- Important IDs such as `diff-base-ref`, `toggle-unified`, or `root`.
- Important classes such as `diff-cell-changed`, `diff-row-deleted`, or `rawrows-table`.
- Important text only when it is part of the user-visible contract.

For webview unit tests, prefer jsdom interactions over HTML string assertions.
For E2E helper commands that return HTML, assert only critical fragments.

### UI Screenshot Checks

The UI screenshot runner asserts semantic rendering, not pixel-perfect output.

Use:

- `visible` for elements that must be visible to the user.
- `hidden` for elements that must not be visible.
- `exists` for elements that may not be visible but must be present in the DOM.
- `textPresent` for required rendered text.
- `textAbsent` for controls or labels that must be stripped from exported HTML.

Avoid using screenshot tests for model logic or serializer behavior.

### E2E Expectations

E2E tests should assert coarse integration outcomes:

- Extension exists and activates.
- Commands are registered.
- A VS Code tab opens with the expected custom editor or panel label.
- NTF YAML diagnostics do not appear from editor views.
- A saved file equals canonical serialization.
- Exported files exist and contain key content.

Avoid asserting detailed DOM behavior in E2E when jsdom or UI screenshot tests can cover it faster and with clearer failures.

### Optional Dependencies

When a test depends on an optional local tool or module, it may skip explicitly.

Current example:

- Real `.xls` conversion is skipped when Python `xlwt` is unavailable.

The skip condition must be visible in the test definition and must not hide core behavior that can be tested with a dependency injection or mock.
