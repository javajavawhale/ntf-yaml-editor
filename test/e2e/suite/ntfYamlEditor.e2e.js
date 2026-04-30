const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");

const extensionId = "local.ntf-yaml-editor";
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCustomEditorTab(uri, viewType) {
  const target = uri.toString();
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input && input.uri?.toString() === target && input.viewType === viewType) {
          return tab;
        }
      }
    }
    await delay(250);
  }
  assert.fail(`custom editor tab ${viewType} was not opened for ${target}`);
}

function makeTempYaml(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-editor-e2e-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return vscode.Uri.file(file);
}

const tests = [
  {
    name: "activates the extension and registers user-facing commands",
    run: async () => {
      const extension = vscode.extensions.getExtension(extensionId);
      assert.ok(extension, `${extensionId} should be installed in the Extension Host`);

      await extension.activate();

      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes("ntfYaml.openAsTable"));
    }
  },
  {
    name: "renders webview HTML with table editor controls for representative YAML",
    run: async () => {
      const extension = vscode.extensions.getExtension(extensionId);
      await extension.activate();

      const html = await vscode.commands.executeCommand("ntfYaml.e2e.renderHtml", [
        "case1:",
        "  LIST_MAP=requestParams: #ListMap",
        "    - \"[no]\": \"1\"",
        "      form.projectName: \"プロジェクト００１\"",
        "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
        "    - [ \"001\", \"東京,港区\", ~ ]",
        ""
      ].join("\n"));

      assert.match(html, /Save YAML/);
      assert.match(html, /Add Row/);
      assert.match(html, /Add Column/);
      assert.match(html, /renderRawRowsTable/);
      assert.match(html, /NTF YAML/);
    }
  },
  {
    name: "opens a YAML file with the custom table editor",
    run: async () => {
      const uri = makeTempYaml("sample.yaml", [
        "case1:",
        "  LIST_MAP=testShots: #ListMap",
        "    - no: \"1\"",
        "      expectedStatusCode: \"200\"",
        ""
      ].join("\n"));

      await vscode.commands.executeCommand("vscode.openWith", uri, "ntfYaml.editor");

      const tab = await waitForCustomEditorTab(uri, "ntfYaml.editor");
      assert.equal(tab.label, "sample.yaml");
    }
  },
  {
    name: "opens the active text editor through NTF YAML: Open as Table",
    run: async () => {
      const uri = makeTempYaml("command-open.yaml", [
        "case1:",
        "  LIST_MAP=requestParams: #ListMap",
        "    - \"[no]\": \"1\"",
        ""
      ].join("\n"));

      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("ntfYaml.openAsTable");

      await waitForCustomEditorTab(uri, "ntfYaml.editor");
    }
  },
  {
    name: "publishes NTF YAML diagnostics for invalid testShots blocks",
    run: async () => {
      const uri = makeTempYaml("diagnostics.yaml", [
        "case1:",
        "  LIST_MAP=testShots: #ListMap",
        "    - no: \"1\"",
        "      setUpTable: \"1\"",
        ""
      ].join("\n"));

      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);

      for (let attempt = 0; attempt < 20; attempt++) {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        if (diagnostics.length > 0) {
          assert.ok(diagnostics.some(item => item.message.includes("missing required column")));
          assert.ok(diagnostics.some(item => item.message.includes("SETUP_TABLE[1]")));
          return;
        }
        await delay(250);
      }
      assert.fail("expected NTF YAML diagnostics to be published");
    }
  },
  {
    name: "round-trips a real fixture through the extension save path without losing critical YAML shape",
    run: async () => {
      const source = path.join(repoRoot, "converted", "ProjectActionRequestTest.yaml");
      const original = fs.readFileSync(source, "utf8");
      const uri = makeTempYaml("ProjectActionRequestTest.yaml", original);

      await vscode.commands.executeCommand("vscode.openWith", uri, "ntfYaml.editor");
      await waitForCustomEditorTab(uri, "ntfYaml.editor");
      await vscode.commands.executeCommand("ntfYaml.e2e.roundTripFile", uri);

      const saved = fs.readFileSync(uri.fsPath, "utf8");
      assert.match(saved, /confirmOfCreateNormal:/);
      assert.match(saved, /LIST_MAP=requestParams: #ListMap/);
      assert.match(saved, /"\[no\]": "1"/);
      assert.match(saved, /EXPECTED_VARIABLE=\.\/tmp\/html_dump\/ProjectActionRequestTest\/downloadNormal_Shot1_/);
    }
  },
  {
    name: "preserves null sentinel rows when saving a migrated sample fixture",
    run: async () => {
      const source = path.join(
        repoRoot,
        "samples",
        "nablarch-example-web",
        "src",
        "test",
        "java",
        "com",
        "nablarch",
        "example",
        "app",
        "web",
        "action",
        "ProjectBulkActionRequestTest.yaml"
      );
      const uri = makeTempYaml("ProjectBulkActionRequestTest.yaml", fs.readFileSync(source, "utf8"));

      await vscode.commands.executeCommand("vscode.openWith", uri, "ntfYaml.editor");
      await waitForCustomEditorTab(uri, "ntfYaml.editor");
      await vscode.commands.executeCommand("ntfYaml.e2e.roundTripFile", uri);

      const saved = fs.readFileSync(uri.fsPath, "utf8");
      assert.match(saved, /PROJECT_ID: ~/);
      assert.match(saved, /"\[no\]": "1"/);
    }
  }
];

module.exports = { tests };
