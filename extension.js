const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { analyzeYaml, parseYaml, serializeYaml } = require("./lib/ntfYamlModel");
const { createDiffReport, diffGitRefs, renderSummaryHtmlReport } = require("./lib/ntfYamlDiff");
const { createDocumentDiffReport, createRefDiffReport, createReportFromResource, diffWorkingTreeAllFiles } = require("./lib/ntfYamlGitDiffContext");
const { parseGitQuery } = require("./lib/gitUri");
const { locateDiagnosticLine } = require("./lib/ntfYamlDiagnostics");
const {
  collectResourceUris,
  isNtfYamlUri,
  backingFilePath,
  isInsidePath
} = require("./lib/ntfYamlExtensionUtils");
const {
  renderHtml,
  renderHtmlDiffPanel,
  renderStandaloneHtmlDiffPanel
} = require("./lib/ntfYamlWebviewHtml");

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("ntf-yaml");
  context.subscriptions.push(diagnostics);
  registerDiagnostics(context, diagnostics);

  const provider = new NtfYamlEditorProvider(context);
  const editorOptions = {
    webviewOptions: { retainContextWhenHidden: true },
    supportsMultipleEditorsPerDocument: false
  };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("ntfYaml.editor", provider, editorOptions),
    vscode.window.registerCustomEditorProvider("ntfYaml.editor.generic", provider, editorOptions)
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
        isNtfYamlUri(editor.document.uri) ? "ntfYaml.editor" : "ntfYaml.editor.generic"
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
        return renderHtml(__dirname, undefined, String(text ?? ""));
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.renderDiffPanelHtml", async options => {
        const report = createDiffReport({
          path: options?.path || "case.ntf.yaml",
          baseRef: options?.baseRef || "HEAD",
          headRef: options?.headRef || "working tree",
          baseText: String(options?.baseText ?? ""),
          headText: String(options?.headText ?? "")
        });
        return renderHtmlDiffPanel(__dirname, undefined, report, {
          allowDiffControls: options?.allowDiffControls
        });
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.renderStandaloneDiffHtml", async options => {
        const report = createDiffReport({
          path: options?.path || "case.ntf.yaml",
          baseRef: options?.baseRef || "HEAD",
          headRef: options?.headRef || "working tree",
          baseText: String(options?.baseText ?? ""),
          headText: String(options?.headText ?? "")
        });
        return renderStandaloneHtmlDiffPanel(__dirname, report);
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.renderRefDiffPanelHtml", async options => {
        const report = createRefDiffReport({
          repositoryPath: String(options?.repositoryPath || ""),
          relativePath: String(options?.relativePath || ""),
          baseRef: String(options?.baseRef || "HEAD"),
          headRef: String(options?.headRef || "working tree")
        });
        if (!report) return "";
        return renderHtmlDiffPanel(__dirname, undefined, report, {
          allowDiffControls: options?.allowDiffControls
        });
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.exportStandaloneDiffHtml", async options => {
        const report = createRefDiffReport({
          repositoryPath: String(options?.repositoryPath || ""),
          relativePath: String(options?.relativePath || ""),
          baseRef: String(options?.baseRef || "HEAD"),
          headRef: String(options?.headRef || "working tree")
        });
        if (!report) return false;
        fs.writeFileSync(String(options?.outputPath || ""), renderStandaloneHtmlDiffPanel(__dirname, report));
        return true;
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.exportAllStandaloneDiffHtml", async options => {
        const outDir = String(options?.outputDir || "");
        const reports = diffWorkingTreeAllFiles({
          repositoryPath: String(options?.repositoryPath || ""),
          baseRef: String(options?.baseRef || "HEAD"),
          headRef: String(options?.headRef || "working tree")
        });
        fs.mkdirSync(outDir, { recursive: true });
        const written = [];
        for (const report of reports) {
          if (!report?.files?.[0]) continue;
          const fileName = (report.files[0].path || "diff").replace(/[\\/]/g, "_") + "-diff.html";
          fs.writeFileSync(path.join(outDir, fileName), renderStandaloneHtmlDiffPanel(__dirname, report));
          written.push(fileName);
        }
        return written.sort();
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
  const line = locateDiagnosticLine(document.getText(), diagnosticPath || []);
  return new vscode.Range(line.line, 0, line.line, line.length);
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
    webviewPanel.webview.html = renderHtml(__dirname, webviewPanel.webview, document.getText(), {
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

function isInsideUri(uri, rootUri) {
  return isInsidePath(uri?.fsPath || "", rootUri?.fsPath || "");
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
        panel.webview.html = renderHtmlDiffPanel(__dirname, panel.webview, currentReport);
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
        panel.webview.html = renderHtmlDiffPanel(__dirname, panel.webview, currentReport);
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
        fs.writeFileSync(saveUri.fsPath, renderStandaloneHtmlDiffPanel(__dirname, currentReport));
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
          fs.writeFileSync(path.join(outDir, fileName), renderStandaloneHtmlDiffPanel(__dirname, r));
          written++;
        }
        vscode.window.showInformationMessage(`NTF YAML diff: ${written}件のHTMLを出力しました: ${outDir}`);
      } catch (err) {
        vscode.window.showErrorMessage(`NTF YAML Export All failed: ${err.message}`);
      }
    }
  }, undefined, context.subscriptions);

  panel.webview.html = renderHtmlDiffPanel(__dirname, panel.webview, report);
}

module.exports = { activate };
