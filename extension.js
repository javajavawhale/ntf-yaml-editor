const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { analyzeYaml, parseYaml, serializeYaml } = require("./lib/ntfYamlModel");
const { diffGitRefs, renderHtmlReport } = require("./lib/ntfYamlDiff");
const { createDocumentDiffReport, createReportFromResource } = require("./lib/ntfYamlGitDiffContext");

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("ntf-yaml");
  context.subscriptions.push(diagnostics);
  registerDiagnostics(context, diagnostics);

  const provider = new NtfYamlEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("ntfYaml.editor", provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ntfYaml.openAsTable", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      await vscode.commands.executeCommand(
        "vscode.openWith",
        editor.document.uri,
        "ntfYaml.editor"
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ntfYaml.generateDiffReport", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage("NTF YAML diff requires an open workspace folder.");
        return;
      }
      const baseRef = await vscode.window.showInputBox({
        title: "NTF YAML Cell Diff",
        prompt: "Base Git ref",
        value: "HEAD~1"
      });
      if (!baseRef) return;
      const headRef = await vscode.window.showInputBox({
        title: "NTF YAML Cell Diff",
        prompt: "Head Git ref",
        value: "HEAD"
      });
      if (!headRef) return;
      const outputName = await vscode.window.showInputBox({
        title: "NTF YAML Cell Diff",
        prompt: "Output HTML file",
        value: "ntf-yaml-diff.html"
      });
      if (!outputName) return;
      try {
        const report = diffGitRefs({ baseRef, headRef, cwd: folder.uri.fsPath });
        const outputPath = path.resolve(folder.uri.fsPath, outputName);
        fs.writeFileSync(outputPath, renderHtmlReport(report));
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(outputPath));
        await vscode.window.showTextDocument(document, { preview: false });
        vscode.window.showInformationMessage(`NTF YAML diff report written: ${outputName}`);
      } catch (error) {
        vscode.window.showErrorMessage(`NTF YAML diff failed: ${error.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ntfYaml.openCellDiff", async (...resources) => {
      try {
        const report = await createCellDiffReportFromCommand(resources);
        if (!report) {
          vscode.window.showInformationMessage("No NTF YAML cell diff is available for the selected resource.");
          return;
        }
        openCellDiffPanel(context, report);
      } catch (error) {
        vscode.window.showErrorMessage(`NTF YAML cell diff failed: ${error.message}`);
      }
    })
  );

  if (process.env.NTF_YAML_EDITOR_ENABLE_E2E_COMMANDS === "1") {
    context.subscriptions.push(
      vscode.commands.registerCommand("ntfYaml.e2e.renderHtml", async text => {
        return renderHtml(undefined, String(text ?? ""));
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.roundTripFile", async uri => {
        const document = await vscode.workspace.openTextDocument(uri);
        const nextText = serializeYaml(parseYaml(document.getText()));
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        edit.replace(document.uri, fullRange, nextText);
        await vscode.workspace.applyEdit(edit);
        await document.save();
      })
    );
  }
}

function registerDiagnostics(context, collection) {
  function update(document) {
    if (!isYamlDocument(document)) {
      collection.delete(document.uri);
      return;
    }
    let items = [];
    try {
      items = analyzeYaml(document.getText()).map(item => toVsCodeDiagnostic(document, item));
    } catch (error) {
      items = [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          `NTF YAML analysis failed: ${error.message}`,
          vscode.DiagnosticSeverity.Error
        )
      ];
    }
    collection.set(document.uri, items);
  }

  for (const document of vscode.workspace.textDocuments) {
    update(document);
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument(event => update(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => collection.delete(document.uri))
  );
}

function isYamlDocument(document) {
  const name = document.uri.fsPath.toLowerCase();
  return name.endsWith(".yaml") || name.endsWith(".yml");
}

function toVsCodeDiagnostic(document, item) {
  const range = locateDiagnosticRange(document, item.path || []);
  const severity = item.severity === "error"
    ? vscode.DiagnosticSeverity.Error
    : vscode.DiagnosticSeverity.Warning;
  const diagnostic = new vscode.Diagnostic(range, item.message, severity);
  diagnostic.source = "ntf-yaml";
  return diagnostic;
}

function locateDiagnosticRange(document, diagnosticPath) {
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const patterns = diagnosticPath.slice(0, 2).map(escapeForSearch);
  for (let i = 0; i < lines.length; i++) {
    if (patterns.some(pattern => lines[i].includes(pattern))) {
      return new vscode.Range(i, 0, i, Math.max(lines[i].length, 1));
    }
  }
  return new vscode.Range(0, 0, 0, 1);
}

function escapeForSearch(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

class NtfYamlEditorProvider {
  constructor(context) {
    this.context = context;
    this.editors = new Set();
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => this.updateRelatedEditors(event.document.uri)),
      vscode.workspace.onDidSaveTextDocument(document => this.updateRelatedEditors(document.uri))
    );
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = renderHtml(webviewPanel.webview, document.getText(), {
      diffReport: createEditorDiffReport(document),
      readOnly: document.uri.scheme !== "file"
    });

    const updateWebview = () => {
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText(),
        diffReport: createEditorDiffReport(document)
      });
    };

    const editor = { document, updateWebview };
    this.editors.add(editor);
    webviewPanel.onDidDispose(() => this.editors.delete(editor));

    webviewPanel.webview.onDidReceiveMessage(async message => {
      if (message.type !== "save" || document.uri.scheme !== "file") {
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      edit.replace(document.uri, fullRange, message.text);
      await vscode.workspace.applyEdit(edit);
      await document.save();
    });
  }

  updateRelatedEditors(uri) {
    const changedPath = backingFilePath(uri);
    for (const editor of this.editors) {
      const editorPath = backingFilePath(editor.document.uri);
      if (
        editor.document.uri.toString() === uri.toString()
        || (changedPath && editorPath && path.resolve(changedPath) === path.resolve(editorPath))
      ) {
        editor.updateWebview();
      }
    }
  }
}

async function createCellDiffReportFromCommand(resources) {
  const candidates = collectResourceUris(resources);
  const uri = candidates.find(isYamlUri) || vscode.window.activeTextEditor?.document?.uri;
  if (!uri || !isYamlUri(uri)) return null;
  const repositoryPath = await gitRepositoryPathFor(uri);
  if (uri.scheme === "git") {
    const document = await vscode.workspace.openTextDocument(uri);
    return createDocumentDiffReport({
      uri,
      text: document.getText(),
      workspaceFolder: repositoryPath,
      repositoryPath
    });
  }
  return createReportFromResource(uri, { workspaceFolder: repositoryPath, repositoryPath });
}

function collectResourceUris(items) {
  const result = [];
  for (const item of items || []) {
    collectResourceUrisInto(item, result);
  }
  return result;
}

function collectResourceUrisInto(item, result) {
  if (!item) return;
  if (Array.isArray(item)) {
    for (const child of item) collectResourceUrisInto(child, result);
    return;
  }
  if (item.resourceUri || item.uri || item.scheme) {
    result.push(item.resourceUri || item.uri || item);
  }
  if (Array.isArray(item.resourceStates)) {
    for (const state of item.resourceStates) collectResourceUrisInto(state, result);
  }
}

function isYamlUri(uri) {
  const fsPath = uri?.fsPath || uri?.path || "";
  const lower = fsPath.toLowerCase();
  return lower.endsWith(".yaml") || lower.endsWith(".yml");
}

function backingFilePath(uri) {
  if (!uri) return "";
  if (uri.scheme === "git") {
    return parseGitQuery(uri.query).path || uri.fsPath || "";
  }
  return uri.fsPath || "";
}

function createEditorDiffReport(document) {
  try {
    const folder = workspaceFolderFor(document.uri);
    return createDocumentDiffReport({
      uri: document.uri,
      text: document.getText(),
      workspaceFolder: folder?.uri.fsPath || ""
    });
  } catch {
    return null;
  }
}

function workspaceFolderFor(uri) {
  return vscode.workspace.getWorkspaceFolder(uri)
    || vscode.workspace.workspaceFolders?.find(folder => uri.fsPath?.startsWith(folder.uri.fsPath));
}

async function gitRepositoryPathFor(uri) {
  const fileUri = uri.scheme === "git" ? vscode.Uri.file(parseGitQuery(uri.query).path || uri.fsPath) : uri;
  try {
    const extension = vscode.extensions.getExtension("vscode.git");
    const gitExtension = extension?.isActive ? extension.exports : await extension?.activate();
    const git = gitExtension?.getAPI?.(1);
    const repository = git?.repositories?.find(repo => isInsideUri(fileUri, repo.rootUri));
    if (repository?.rootUri?.fsPath) {
      return repository.rootUri.fsPath;
    }
  } catch {
    // Fall back to filesystem/git discovery in ntfYamlGitDiffContext.
  }
  return workspaceFolderFor(fileUri)?.uri.fsPath || "";
}

function parseGitQuery(query) {
  try {
    return query ? JSON.parse(decodeURIComponent(query)) : {};
  } catch {
    return {};
  }
}

function isInsideUri(uri, rootUri) {
  if (!uri?.fsPath || !rootUri?.fsPath) return false;
  const relative = path.relative(rootUri.fsPath, uri.fsPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function openCellDiffPanel(context, report) {
  const panel = vscode.window.createWebviewPanel(
    "ntfYaml.cellDiff",
    "NTF YAML Cell Diff",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = renderHtmlDiffPanel(panel.webview, report);
}

function renderHtmlDiffPanel(webview, report) {
  const nonce = getNonce();
  const baseState = JSON.stringify(report.baseText || "").replace(/</g, "\\u003c");
  const headState = JSON.stringify(report.headText || "").replace(/</g, "\\u003c");
  const diffReportState = JSON.stringify(report).replace(/</g, "\\u003c");
  const modelScript = fs.readFileSync(path.join(__dirname, "lib", "ntfYamlModel.js"), "utf8");
  const webviewScript = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditorWebview.js"), "utf8");
  const editorCss = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditor.css"), "utf8");
  const baseRef = report.baseRef || "base";
  const headRef = report.headRef || "head";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Cell Diff</title>
  <style nonce="${nonce}">
${editorCss}
.diff-panel-container{display:flex;height:100vh;overflow:hidden}
.diff-panel-pane{flex:1;overflow:auto;min-width:0}
.diff-panel-pane+.diff-panel-pane{border-left:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-label{padding:4px 12px;font-size:12px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorGroupHeader-tabsBackground);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style>
</head>
<body>
  <div class="diff-panel-container">
    <div class="diff-panel-pane">
      <div class="diff-panel-label">${baseRef}</div>
      <div id="base-root"></div>
    </div>
    <div class="diff-panel-pane">
      <div class="diff-panel-label">${headRef}</div>
      <div id="head-root"></div>
    </div>
  </div>
  <script nonce="${nonce}">
    ${modelScript}
    ${webviewScript}
    const vscode = acquireVsCodeApi();
    const diffReport = ${diffReportState};
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("base-root"),
      initialText: ${baseState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "base",
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("head-root"),
      initialText: ${headState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "head",
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
  </script>
</body>
</html>`;
}

function renderHtml(webview, initialText, options = {}) {
  const nonce = getNonce();
  const initialState = JSON.stringify(initialText).replace(/</g, "\\u003c");
  const initialDiffReport = JSON.stringify(options.diffReport || null).replace(/</g, "\\u003c");
  const initialReadOnly = options.readOnly ? "true" : "false";
  const modelScript = fs.readFileSync(path.join(__dirname, "lib", "ntfYamlModel.js"), "utf8");
  const webviewScript = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditorWebview.js"), "utf8");
  const editorCss = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditor.css"), "utf8");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Editor</title>
  <style nonce="${nonce}">
${editorCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    ${modelScript}
    ${webviewScript}
    const vscode = acquireVsCodeApi();
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("root"),
      initialText: ${initialState},
      initialDiffReport: ${initialDiffReport},
      readOnly: ${initialReadOnly},
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = { activate };
