const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const vscode = require("vscode");
const { parseYaml, serializeYaml } = require("../../../lib/ntfYamlModel");

const extensionRoot = path.resolve(__dirname, "..", "..", "..");
const packageJson = require(path.join(extensionRoot, "package.json"));
const extensionId = `${packageJson.publisher}.${packageJson.name}`;
const sampleFixtures = {
  webProjectAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-action-request.ntf.yaml"),
  webProjectBulkAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-bulk-action-request.ntf.yaml")
};

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

async function waitForTabLabel(label) {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.label === label) {
          return tab;
        }
      }
    }
    await delay(250);
  }
  assert.fail(`tab ${label} was not opened`);
}

function makeTempYaml(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-editor-e2e-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return vscode.Uri.file(file);
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function makeGitDiffYaml() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-editor-e2e-git-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const baseText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, baseText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);
  fs.writeFileSync(file, baseText.replace("before", "after"));
  return vscode.Uri.file(file);
}

function makeGitRepoWithDiffs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-editor-e2e-git-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const files = {
    first: path.join(dir, "first.ntf.yaml"),
    second: path.join(dir, "nested", "second.ntf.yaml")
  };
  fs.mkdirSync(path.dirname(files.second), { recursive: true });
  const baseText = name => [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    `      name: \"${name}-before\"`,
    ""
  ].join("\n");
  fs.writeFileSync(files.first, baseText("first"));
  fs.writeFileSync(files.second, baseText("second"));
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const baseSha = git(dir, ["rev-parse", "--short", "HEAD"]).trim();
  fs.writeFileSync(files.first, fs.readFileSync(files.first, "utf8").replace("first-before", "first-head"));
  fs.writeFileSync(files.second, fs.readFileSync(files.second, "utf8").replace("second-before", "second-head"));
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "head"]);
  const headSha = git(dir, ["rev-parse", "--short", "HEAD"]).trim();
  fs.writeFileSync(files.first, fs.readFileSync(files.first, "utf8").replace("first-head", "first-worktree"));
  fs.writeFileSync(files.second, fs.readFileSync(files.second, "utf8").replace("second-head", "second-worktree"));
  return { dir, baseSha, headSha };
}

function diffPanelFixture() {
  return {
    baseText: [
      "case1:",
      "  LIST_MAP=requestParams: #ListMap",
      "    - no: \"1\"",
      "      name: \"before\"",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  LIST_MAP=requestParams: #ListMap",
      "    - no: \"1\"",
      "      name: \"after\"",
      ""
    ].join("\n")
  };
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
      assert.ok(commands.includes("ntfYaml.generateDiffReport"));
      assert.ok(commands.includes("ntfYaml.openCellDiff"));
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
    name: "renders cell diff panel controls and strips export controls for standalone HTML",
    run: async () => {
      const extension = vscode.extensions.getExtension(extensionId);
      await extension.activate();

      const interactive = await vscode.commands.executeCommand("ntfYaml.e2e.renderDiffPanelHtml", diffPanelFixture());
      assert.match(interactive, /id="diff-base-ref"/);
      assert.match(interactive, /id="diff-head-ref"/);
      assert.match(interactive, /id="diff-export-html"/);
      assert.match(interactive, /id="diff-export-all"/);
      assert.match(interactive, /id="toggle-horizontal"/);
      assert.match(interactive, /id="toggle-vertical"/);
      assert.match(interactive, /id="toggle-unified"/);

      const standalone = await vscode.commands.executeCommand("ntfYaml.e2e.renderStandaloneDiffHtml", diffPanelFixture());
      assert.doesNotMatch(standalone, /id="diff-base-ref"/);
      assert.doesNotMatch(standalone, /id="diff-head-ref"/);
      assert.doesNotMatch(standalone, /id="diff-export-html"/);
      assert.doesNotMatch(standalone, /id="diff-export-all"/);
      assert.match(standalone, /id="toggle-horizontal"/);
      assert.match(standalone, /id="toggle-vertical"/);
      assert.match(standalone, /id="toggle-unified"/);
    }
  },
  {
    name: "renders cell diff panel from changed refs and exports standalone HTML files",
    run: async () => {
      const extension = vscode.extensions.getExtension(extensionId);
      await extension.activate();
      const repo = makeGitRepoWithDiffs();

      const refHtml = await vscode.commands.executeCommand("ntfYaml.e2e.renderRefDiffPanelHtml", {
        repositoryPath: repo.dir,
        relativePath: "first.ntf.yaml",
        baseRef: repo.baseSha,
        headRef: repo.headSha
      });
      assert.match(refHtml, /first-before/);
      assert.match(refHtml, /first-head/);
      assert.doesNotMatch(refHtml, /first-worktree/);

      const outFile = path.join(repo.dir, "single-diff.html");
      assert.equal(await vscode.commands.executeCommand("ntfYaml.e2e.exportStandaloneDiffHtml", {
        repositoryPath: repo.dir,
        relativePath: "first.ntf.yaml",
        baseRef: repo.headSha,
        headRef: "working tree",
        outputPath: outFile
      }), true);
      const exported = fs.readFileSync(outFile, "utf8");
      assert.match(exported, /first-head/);
      assert.match(exported, /first-worktree/);
      assert.doesNotMatch(exported, /id="diff-export-html"/);

      const outDir = path.join(repo.dir, "all-diff");
      const written = await vscode.commands.executeCommand("ntfYaml.e2e.exportAllStandaloneDiffHtml", {
        repositoryPath: repo.dir,
        baseRef: repo.headSha,
        headRef: "working tree",
        outputDir: outDir
      });
      assert.deepEqual(written, [
        "first.ntf.yaml-diff.html",
        "nested_second.ntf.yaml-diff.html"
      ]);
      assert.match(fs.readFileSync(path.join(outDir, "first.ntf.yaml-diff.html"), "utf8"), /first-worktree/);
      assert.match(fs.readFileSync(path.join(outDir, "nested_second.ntf.yaml-diff.html"), "utf8"), /second-worktree/);
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
    name: "opens Cell Diff panel for a changed NTF YAML file",
    run: async () => {
      const extension = vscode.extensions.getExtension(extensionId);
      await extension.activate();
      const uri = makeGitDiffYaml();

      await vscode.commands.executeCommand("ntfYaml.openCellDiff", uri);

      const tab = await waitForTabLabel("NTF YAML Cell Diff");
      assert.equal(tab.label, "NTF YAML Cell Diff");
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

      await waitForCustomEditorTab(uri, "ntfYaml.editor.generic");
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
      const original = fs.readFileSync(sampleFixtures.webProjectAction, "utf8");
      const uri = makeTempYaml("ProjectActionRequestTest.yaml", original);

      await vscode.commands.executeCommand("vscode.openWith", uri, "ntfYaml.editor");
      await waitForCustomEditorTab(uri, "ntfYaml.editor");
      await vscode.commands.executeCommand("ntfYaml.e2e.roundTripFile", uri);

      const saved = fs.readFileSync(uri.fsPath, "utf8");
      assert.equal(saved, serializeYaml(parseYaml(original)));
      assert.match(saved, /confirmOfCreateNormal:/);
      assert.match(saved, /LIST_MAP=requestParams: #ListMap/);
      assert.match(saved, /"\[no\]": "1"/);
    }
  },
  {
    name: "preserves null sentinel rows when saving a migrated sample fixture",
    run: async () => {
      const uri = makeTempYaml("ProjectBulkActionRequestTest.yaml", fs.readFileSync(sampleFixtures.webProjectBulkAction, "utf8"));

      await vscode.commands.executeCommand("vscode.openWith", uri, "ntfYaml.editor");
      await waitForCustomEditorTab(uri, "ntfYaml.editor");
      await vscode.commands.executeCommand("ntfYaml.e2e.roundTripFile", uri);

      const saved = fs.readFileSync(uri.fsPath, "utf8");
      assert.equal(saved, serializeYaml(parseYaml(fs.readFileSync(sampleFixtures.webProjectBulkAction, "utf8"))));
      assert.match(saved, /PROJECT_ID: ~/);
      assert.match(saved, /"\[no\]": "1"/);
    }
  }
];

module.exports = { tests };
