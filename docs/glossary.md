# NTF YAML Editor Glossary

This document is the terminology source of truth for the NTF YAML Editor codebase.
Use these names when discussing, refactoring, naming files, or naming code concepts.

## Functional Areas

| Term | Definition |
| --- | --- |
| NTF YAML Model | The core model layer that parses NTF YAML into the editor's internal structure and serializes it back to canonical YAML. |
| NTF YAML Analysis | The validation layer used by diagnostics and CLI lint. It detects structural issues such as duplicate sheets or blocks, missing required columns, empty blocks, and broken `testShots` references. |
| Table Editor | The VS Code custom editor experience for viewing and editing `.ntf.yaml` files as tables. |
| Webview UI | The browser-side UI that renders and edits sheets, blocks, rows, columns, and cells. |
| Cell Diff | The model-aware diff engine that compares YAML by sheet, block, row, and cell instead of raw text lines. |
| Git Diff Context | The layer that resolves VS Code `git://` URIs, working tree files, index files, and arbitrary Git refs into base/head YAML text for Cell Diff. |
| Cell Diff Panel | The extension-owned diff panel opened by `NTF YAML: Open Cell Diff`. It supports horizontal split, vertical split, unified view, ref editing, HTML export, and Export All. |
| SCM Diff | The VS Code diff editor integration where VS Code owns the two-pane frame and invokes the custom editor separately for the base and head panes. |
| Standalone HTML Report | A static HTML diff report that can be opened outside VS Code. |
| CLI | The `ntf-yaml` command line entry point for `convert`, `lint`, `format`, and `diff`. |
| Excel Convert | The CLI feature that delegates `.xlsx` and `.xls` conversion to the Python tools and outputs NTF YAML. |
| Test/Packaging | Unit tests, E2E tests, screenshot capture, and VSIX packaging support. |

## Domain Terms

| Term | Definition |
| --- | --- |
| NTF YAML | The YAML representation of Nablarch Testing Framework test data. This project targets this format, not generic YAML editing. |
| Canonical Form | The normalized YAML output shared by converter output, editor save, and CLI format. |
| Model | The internal data structure returned by `parseYaml()`, currently shaped as `{ sheets: [...] }`. |
| Sheet | A top-level YAML key. It corresponds to an NTF Excel sheet. |
| Block | A named data unit under a Sheet, such as `LIST_MAP=...`, `SETUP_TABLE[1]=...`, or `EXPECTED_VARIABLE[1]=...`. |
| Table Block | A block represented as rows with named columns. This includes `LIST_MAP`, `SETUP_TABLE`, `EXPECTED_TABLE`, and `EXPECTED_COMPLETE_TABLE`. |
| Raw Rows Block | A block represented as array rows without named columns. This includes `SETUP_VARIABLE` and `EXPECTED_VARIABLE`. |
| Raw Block | A block that the editor does not interpret as a table or raw rows. This includes `SETUP_FIXED`, `EXPECTED_FIXED`, `MESSAGE`, `EXPECTED_REQUEST_HEADER_MESSAGES`, `EXPECTED_REQUEST_BODY_MESSAGES`, `RESPONSE_HEADER_MESSAGES`, and `RESPONSE_BODY_MESSAGES`; the content is preserved and displayed as raw text where possible. |
| Row | One row inside a block. In a Table Block it is an object; in a Raw Rows Block it is an array. |
| Cell | A value at the intersection of a row and column. |
| Column Order | The preferred column order for a Table Block. It affects table rendering and serialization. |
| Diagnostic | A warning or error produced from NTF YAML Analysis. Diagnostics are surfaced in VS Code and by CLI lint. |
| Diff Report | The intermediate diff representation for base/head model comparison, grouped by file, sheet, block, row, and cell. |
| Diff Status | One of `added`, `deleted`, `changed`, or `unchanged`. |
| Base | The comparison source side of a diff. |
| Head | The comparison target side of a diff. |
| Working Tree | The current filesystem content of a file in a Git repository. |
| Index | The Git staging area. The implementation also accepts VS Code Git's `~` ref convention for the index. |

## View Terms

| Term | Definition |
| --- | --- |
| Normal Editor | Opening an NTF YAML file from Explorer as a single custom editor pane. |
| SCM Diff | Clicking a changed file in VS Code SCM, where VS Code creates the diff editor and the extension renders each side independently. |
| Cell Diff | Opening the extension-owned Cell Diff Panel with two panes or unified display inside one webview. |
| HTML Report | Exported static HTML rendered with the same Cell Diff concepts but without VS Code controls. |
