const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { analyzeYaml, parseYaml, serializeYaml } = require("./lib/ntfYamlModel");
const { diffGitRefs, renderSummaryHtmlReport } = require("./lib/ntfYamlDiff");
const { createDocumentDiffReport, createRefDiffReport, createReportFromResource, diffWorkingTreeAllFiles } = require("./lib/ntfYamlGitDiffContext");

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
        fs.writeFileSync(outputPath, renderSummaryHtmlReport(report));
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
        const result = await createCellDiffReportFromCommand(resources);
        if (!result) {
          vscode.window.showInformationMessage("No NTF YAML cell diff is available for the selected resource.");
          return;
        }
        openCellDiffPanel(context, result.report, result.uri, result.repositoryPath);
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
    this.sidebarWidth = 240;
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => this.updateRelatedEditors(event.document.uri)),
      vscode.workspace.onDidSaveTextDocument(document => this.updateRelatedEditors(document.uri))
    );
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    webviewPanel.webview.options = { enableScripts: true };
    const diffSide = document.uri.scheme === "git" ? "base" : "head";
    const diffReport = createEditorDiffReport(document);
    const initialText = diffReport
      ? (diffSide === "base" ? diffReport.baseText : diffReport.headText)
      : document.getText();
    // file:// の場合、同じファイルの git:// ペアが既に開いていれば SCM diff 右ペイン
    const isScmDiffHead = diffSide === "head" && [...this.editors].some(editor => {
      if (editor.document.uri.scheme !== "git") return false;
      const gitPath = parseGitQuery(editor.document.uri.query)?.path;
      return gitPath && path.resolve(gitPath) === path.resolve(document.uri.fsPath);
    });
    const webviewDiffReport = (diffSide === "base" || isScmDiffHead) ? diffReport : null;
    webviewPanel.webview.html = renderHtml(webviewPanel.webview, document.getText(), {
      initialText,
      diffReport,
      webviewDiffReport,
      readOnly: document.uri.scheme !== "file",
      diffSide,
      sidebarWidth: this.sidebarWidth
    });

    const updateWebview = () => {
      const nextDiffReport = createEditorDiffReport(document);
      webviewPanel.webview.postMessage({
        type: "update",
        text: nextDiffReport
          ? (diffSide === "base" ? nextDiffReport.baseText : nextDiffReport.headText)
          : document.getText(),
        diffReport: (diffSide === "base" || isScmDiffHead) ? nextDiffReport : null
      });
    };

    const editor = {
      document,
      updateWebview,
      setSidebarWidth: width => webviewPanel.webview.postMessage({ type: "setSidebarWidth", width })
    };
    this.editors.add(editor);
    webviewPanel.onDidDispose(() => this.editors.delete(editor));

    webviewPanel.webview.onDidReceiveMessage(async message => {
      if (message.type === "sidebarResize") {
        this.updateSidebarWidth(message.width);
        return;
      }
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

  updateSidebarWidth(width) {
    const nextWidth = Math.max(140, Math.min(420, Math.round(Number(width))));
    if (!Number.isFinite(nextWidth)) return;
    this.sidebarWidth = nextWidth;
    for (const editor of this.editors) {
      editor.setSidebarWidth(nextWidth);
    }
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
  const uri = candidates.find(isNtfYamlUri) || vscode.window.activeTextEditor?.document?.uri;
  if (!uri || !isNtfYamlUri(uri)) return null;
  const repositoryPath = await gitRepositoryPathFor(uri);
  let report;
  if (uri.scheme === "git") {
    const document = await vscode.workspace.openTextDocument(uri);
    report = createDocumentDiffReport({
      uri,
      text: document.getText(),
      workspaceFolder: repositoryPath,
      repositoryPath
    });
  } else {
    report = createReportFromResource(uri, { workspaceFolder: repositoryPath, repositoryPath });
  }
  if (!report) return null;
  return { report, uri, repositoryPath };
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

function isNtfYamlUri(uri) {
  const fsPath = uri?.fsPath || uri?.path || "";
  const lower = fsPath.toLowerCase();
  return lower.endsWith(".ntf.yaml") || lower.endsWith(".ntf.yml");
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

function openCellDiffPanel(context, report, fileUri, repositoryPath) {
  const panel = vscode.window.createWebviewPanel(
    "ntfYaml.cellDiff",
    "NTF YAML Cell Diff",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  let currentReport = report;

  function refreshPanel() {
    try {
      const repoPath = repositoryPath || currentReport.repositoryPath;
      const relPath = currentReport.files[0]?.path || "";
      const newReport = createRefDiffReport({
        repositoryPath: repoPath,
        relativePath: relPath,
        baseRef: currentReport.baseRef || "HEAD",
        headRef: currentReport.headRef || "working tree"
      });
      if (newReport) {
        currentReport = newReport;
        panel.webview.html = renderHtmlDiffPanel(panel.webview, currentReport);
      }
    } catch { }
  }

  const watchedPath = fileUri
    ? (fileUri.scheme === "git"
      ? (parseGitQuery(fileUri.query).path || fileUri.fsPath)
      : fileUri.fsPath)
    : "";
  const saveWatcher = vscode.workspace.onDidSaveTextDocument(doc => {
    const docPath = doc.uri.scheme === "file" ? doc.uri.fsPath
      : doc.uri.scheme === "git" ? (parseGitQuery(doc.uri.query).path || doc.uri.fsPath) : "";
    if (docPath && watchedPath && path.resolve(docPath) === path.resolve(watchedPath)) {
      refreshPanel();
    }
  });
  panel.onDidDispose(() => saveWatcher.dispose());

  panel.webview.onDidReceiveMessage(async message => {
    if (message.type === "changeDiffRefs") {
      try {
        const repoPath = repositoryPath || currentReport.repositoryPath;
        const relPath = currentReport.files[0]?.path || "";
        const newReport = createRefDiffReport({
          repositoryPath: repoPath,
          relativePath: relPath,
          baseRef: message.baseRef || "HEAD",
          headRef: message.headRef || "working tree"
        });
        if (!newReport) {
          panel.webview.postMessage({ type: "diffRefError", message: "diff refs could not be resolved" });
          return;
        }
        currentReport = newReport;
        panel.webview.html = renderHtmlDiffPanel(panel.webview, currentReport);
      } catch (err) {
        panel.webview.postMessage({ type: "diffRefError", message: err.message });
      }
    } else if (message.type === "exportHtml") {
      const relPath = currentReport.files[0]?.path || "diff";
      const defaultName = relPath.replace(/[\\/]/g, "_") + "-diff.html";
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(currentReport.repositoryPath || ".", defaultName)),
        filters: { HTML: ["html"] }
      });
      if (saveUri) {
        fs.writeFileSync(saveUri.fsPath, renderStandaloneHtmlDiffPanel(currentReport));
        vscode.window.showInformationMessage(`NTF YAML diff exported: ${path.basename(saveUri.fsPath)}`);
      }
    } else if (message.type === "exportAllHtml") {
      const folderUris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "HTML出力先フォルダを選択"
      });
      if (!folderUris?.[0]) return;
      const outDir = folderUris[0].fsPath;
      const repoPath = repositoryPath || currentReport.repositoryPath;
      const baseRef = currentReport.baseRef || "HEAD";
      const headRef = currentReport.headRef || "working tree";
      try {
        const reports = diffWorkingTreeAllFiles({ repositoryPath: repoPath, baseRef, headRef });
        let written = 0;
        for (const r of reports) {
          if (!r.files[0]) continue;
          const fileName = (r.files[0].path || "diff").replace(/[\\/]/g, "_") + "-diff.html";
          fs.writeFileSync(path.join(outDir, fileName), renderStandaloneHtmlDiffPanel(r));
          written++;
        }
        vscode.window.showInformationMessage(`NTF YAML diff: ${written}件のHTMLを出力しました: ${outDir}`);
      } catch (err) {
        vscode.window.showErrorMessage(`NTF YAML Export All failed: ${err.message}`);
      }
    }
  }, undefined, context.subscriptions);

  panel.webview.html = renderHtmlDiffPanel(panel.webview, report);
}

function renderHtmlDiffPanel(webview, report, options = {}) {
  const nonce = getNonce();
  const baseState = JSON.stringify(report.baseText || "").replace(/</g, "\\u003c");
  const headState = JSON.stringify(report.headText || "").replace(/</g, "\\u003c");
  const diffReportState = JSON.stringify(report).replace(/</g, "\\u003c");
  const includeHeaderControls = options.allowDiffControls !== false;
  const modelScript = fs.readFileSync(path.join(__dirname, "lib", "ntfYamlModel.js"), "utf8");
  const webviewScript = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditorWebview.js"), "utf8");
  const editorCss = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditor.css"), "utf8");
  const baseRef = report.baseRef || "base";
  const headRef = report.headRef || "head";
  const baseRefValue = escapeHtmlAttribute(baseRef);
  const headRefValue = escapeHtmlAttribute(headRef);
  const baseRefHeaderHtml = includeHeaderControls
    ? `<input id="diff-base-ref" class="diff-ref-input" type="text" value="${baseRefValue}" aria-label="Base ref" title="Base ref">`
    : `<span class="diff-ref-label">${baseRefValue}</span>`;
  const headRefHeaderHtml = includeHeaderControls
    ? `<input id="diff-head-ref" class="diff-ref-input" type="text" value="${headRefValue}" aria-label="Head ref" title="Head ref">`
    : `<span class="diff-ref-label">${headRefValue}</span>`;
  const unifiedRefBarHtml = includeHeaderControls
    ? `<div class="unified-ref-bar"><input id="diff-unified-base-ref" class="diff-ref-input" type="text" value="${baseRefValue}" aria-label="Base ref" title="Base ref"><span class="unified-ref-arrow">→</span><input id="diff-unified-head-ref" class="diff-ref-input" type="text" value="${headRefValue}" aria-label="Head ref" title="Head ref"></div>`
    : `<div class="unified-ref-bar"><span class="diff-ref-label" style="padding:4px 12px">${baseRefValue}</span><span class="unified-ref-arrow">→</span><span class="diff-ref-label" style="padding:4px 12px">${headRefValue}</span></div>`;
  const layoutToggleHtml = '<div class="layout-toggle-group">'
    + '<button id="toggle-horizontal" class="diff-control-btn secondary layout-btn-active" title="横分割">横</button>'
    + '<button id="toggle-vertical" class="diff-control-btn secondary" title="縦分割">縦</button>'
    + '<button id="toggle-unified" class="diff-control-btn secondary" title="1枚表示">1枚</button>'
    + '</div>';
  const actionsHtml = includeHeaderControls
    ? [
      layoutToggleHtml,
      '<button id="diff-export-html" class="diff-control-btn secondary">Export HTML</button>',
      '<button id="diff-export-all" class="diff-control-btn secondary" title="変更のある全YAMLファイルを1ファイル1HTMLで出力">Export All</button>',
      '<span id="diff-ref-error" class="diff-panel-error"></span>'
    ].join("")
    : layoutToggleHtml;
  const panelHeaderHtml = `<div class="diff-panel-header">
      <div class="diff-panel-actions">
        ${actionsHtml}
      </div>
    </div>`;
  const headerScript = (includeHeaderControls ? `
    const baseRefInput = document.getElementById("diff-base-ref");
    const headRefInput = document.getElementById("diff-head-ref");
    const unifiedBaseRefInput = document.getElementById("diff-unified-base-ref");
    const unifiedHeadRefInput = document.getElementById("diff-unified-head-ref");
    const refError = document.getElementById("diff-ref-error");
    let refTimer = 0;
    function scheduleRefChange() {
      clearTimeout(refTimer);
      refError.textContent = "";
      unifiedBaseRefInput.value = baseRefInput.value;
      unifiedHeadRefInput.value = headRefInput.value;
      refTimer = setTimeout(() => {
        vscode.postMessage({
          type: "changeDiffRefs",
          baseRef: baseRefInput.value.trim(),
          headRef: headRefInput.value.trim()
        });
      }, 500);
    }
    function scheduleRefChangeFromUnified() {
      clearTimeout(refTimer);
      refError.textContent = "";
      baseRefInput.value = unifiedBaseRefInput.value;
      headRefInput.value = unifiedHeadRefInput.value;
      refTimer = setTimeout(() => {
        vscode.postMessage({
          type: "changeDiffRefs",
          baseRef: unifiedBaseRefInput.value.trim(),
          headRef: unifiedHeadRefInput.value.trim()
        });
      }, 500);
    }
    baseRefInput.addEventListener("input", scheduleRefChange);
    headRefInput.addEventListener("input", scheduleRefChange);
    unifiedBaseRefInput.addEventListener("input", scheduleRefChangeFromUnified);
    unifiedHeadRefInput.addEventListener("input", scheduleRefChangeFromUnified);
    document.getElementById("diff-export-html").addEventListener("click", () => vscode.postMessage({ type: "exportHtml" }));
    document.getElementById("diff-export-all").addEventListener("click", () => vscode.postMessage({ type: "exportAllHtml" }));
    window.addEventListener("message", event => {
      if (event.data.type === "diffRefError") {
        refError.textContent = event.data.message || "unknown error";
      }
    });
` : "") + `
    function setLayout(mode) {
      document.getElementById("unified-panel").style.display = mode === "unified" ? "" : "none";
      var container = document.getElementById("diff-panel-container");
      container.style.display = mode === "unified" ? "none" : "";
      container.classList.toggle("split-column", mode === "vertical");
      ["horizontal", "vertical", "unified"].forEach(function(m) {
        document.getElementById("toggle-" + m).classList.toggle("layout-btn-active", m === mode);
      });
    }
    document.getElementById("toggle-horizontal").addEventListener("click", function() { setLayout("horizontal"); });
    document.getElementById("toggle-vertical").addEventListener("click", function() { setLayout("vertical"); });
    document.getElementById("toggle-unified").addEventListener("click", function() { setLayout("unified"); });
`;

  return `<!DOCTYPE html>
<html lang="en" class="diff-panel-html">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Cell Diff</title>
  <style nonce="${nonce}">
${editorCss}
.diff-panel-html,.diff-panel-body{width:100%;height:100%;margin:0;padding:0;overflow:hidden}
.diff-panel-shell{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden}
.diff-panel-header{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;padding:6px 10px;background:var(--vscode-editorGroupHeader-tabsBackground);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-actions{display:flex;align-items:center;gap:8px}
.diff-panel-error{color:var(--vscode-errorForeground,#c0392b);font-size:12px}
.diff-ref-label{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-editor-foreground,#202124)}
.diff-panel-container{display:flex;flex:1;min-height:0;overflow:hidden}
.diff-panel-container.split-column{flex-direction:column}
.diff-panel-pane{display:flex;flex:1;flex-direction:column;overflow:hidden;min-width:0}
.diff-panel-pane+.diff-panel-pane{border-left:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-container.split-column .diff-panel-pane+.diff-panel-pane{border-left:none;border-top:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-label{padding:0;font-size:12px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,#f3f5f4);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.diff-panel-label .diff-ref-label{padding:4px 12px}
.diff-panel-pane>#base-root,.diff-panel-pane>#head-root,.unified-panel>#unified-root{flex:1;min-height:0;overflow:auto}
.unified-panel{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.unified-ref-bar{display:flex;align-items:center;background:var(--vscode-editorWidget-background,#f3f5f4);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc);font-size:12px}
.unified-ref-bar .diff-ref-input{flex:1;min-width:0}
.unified-ref-bar .diff-ref-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-editor-foreground,#202124)}
.unified-ref-arrow{padding:0 8px;color:var(--vscode-descriptionForeground);flex-shrink:0}
.layout-toggle-group{display:flex;gap:0}
.layout-toggle-group .diff-control-btn+.diff-control-btn{border-left:none}
.layout-btn-active{background:var(--vscode-button-background,#0078d4)!important;color:var(--vscode-button-foreground,#fff)!important;border-color:var(--vscode-button-background,#0078d4)!important}
  </style>
</head>
<body class="diff-panel-body">
  <div class="diff-panel-shell">
    ${panelHeaderHtml}
    <div id="unified-panel" class="unified-panel" style="display:none">${unifiedRefBarHtml}<div id="unified-root"></div></div>
    <div id="diff-panel-container" class="diff-panel-container">
      <div class="diff-panel-pane">
        <div class="diff-panel-label">${baseRefHeaderHtml}</div>
        <div id="base-root"></div>
      </div>
      <div class="diff-panel-pane">
        <div class="diff-panel-label">${headRefHeaderHtml}</div>
        <div id="head-root"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    ${modelScript}
    ${webviewScript}
    const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage() {} };
    const diffReport = ${diffReportState};
    ${headerScript}
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("base-root"),
      initialText: ${baseState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "base",
      allowDiffControls: false,
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
      allowDiffControls: false,
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("unified-root"),
      initialText: ${headState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "unified",
      allowDiffControls: false,
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
  </script>
</body>
</html>`;
}

function renderStandaloneHtmlDiffPanel(report) {
  return renderHtmlDiffPanel(undefined, report, { allowDiffControls: false });
}

function renderHtml(webview, initialText, options = {}) {
  const nonce = getNonce();
  const initialState = JSON.stringify(options.initialText ?? initialText).replace(/</g, "\\u003c");
  // webviewDiffReport: webview JS に渡す着色用（undefined の場合は diffReport を使う）
  const webviewDiffReport = options.webviewDiffReport !== undefined ? options.webviewDiffReport : (options.diffReport || null);
  const initialDiffReport = JSON.stringify(webviewDiffReport).replace(/</g, "\\u003c");
  const initialReadOnly = options.readOnly ? "true" : "false";
  const initialDiffSide = JSON.stringify(options.diffSide || (options.readOnly ? "base" : "head"));
  const initialSidebarWidth = JSON.stringify(options.sidebarWidth || 240);
  const modelScript = fs.readFileSync(path.join(__dirname, "lib", "ntfYamlModel.js"), "utf8");
  const webviewScript = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditorWebview.js"), "utf8");
  const editorCss = fs.readFileSync(path.join(__dirname, "media", "ntfYamlEditor.css"), "utf8");
  const scmRef = options.diffReport
    ? (options.diffSide === "head" ? options.diffReport.headRef : options.diffReport.baseRef)
    : "";
  const scmHeader = options.diffReport && scmRef
    ? `<div class="scm-diff-header"><input class="diff-ref-input" type="text" value="${escapeHtmlAttribute(scmRef)}" readonly aria-label="Git ref" title="Git ref"></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" class="${options.diffReport ? "scm-diff-html" : ""}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Editor</title>
  <style nonce="${nonce}">
${editorCss}

  </style>
</head>
<body class="${options.diffReport ? "scm-diff-body" : ""}">
  ${scmHeader}
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
      diffSide: ${initialDiffSide},
      sidebarWidth: ${initialSidebarWidth},
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

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { activate };
