import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parseYaml, serializeYaml } from "./lib/ntfYamlModel";
import { createDiffReport } from "./lib/ntfYamlDiff";
import { renderSummaryHtmlReport } from "./lib/ntfYamlDiffHtml";
import {
  createDocumentDiffReport,
  createRefDiffReport,
  createReportFromResource,
  diffGitRefs,
  diffWorkingTreeAllFiles,
} from "./lib/ntfYamlGitDiffContext";
import { parseGitQuery } from "./lib/gitUri";
import {
  collectResourceUris,
  isNtfYamlUri,
  backingFilePath,
  editorViewContextForUri,
  isInsidePath,
  shouldUseWebviewDiffReport,
} from "./lib/ntfYamlExtensionUtils";
import {
  renderHtml,
  renderHtmlDiffPanel,
  renderStandaloneHtmlDiffPanel,
} from "./lib/ntfYamlWebviewHtml";
import type { DiffReport } from "./lib/ntfYamlDiff";

// tsc compiles this to out/extension.js, so __dirname = <project>/out.
// extensionRoot points one level up to reach project root where media/*.js live.
const extensionRoot = path.resolve(__dirname, "..");

export function activate(context: vscode.ExtensionContext): void {
  const provider = new NtfYamlEditorProvider(context);
  const editorOptions: { webviewOptions: vscode.WebviewPanelOptions; supportsMultipleEditorsPerDocument: boolean } = {
    webviewOptions: { retainContextWhenHidden: true },
    supportsMultipleEditorsPerDocument: false,
  };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("ntfYaml.editor", provider, editorOptions),
    vscode.window.registerCustomEditorProvider("ntfYaml.editor.generic", provider, editorOptions)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ntfYaml.openAsTable", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
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
        value: "HEAD~1",
      });
      if (!baseRef) return;
      const headRef = await vscode.window.showInputBox({
        title: "NTF YAML Cell Diff",
        prompt: "Head Git ref",
        value: "HEAD",
      });
      if (!headRef) return;
      const outputName = await vscode.window.showInputBox({
        title: "NTF YAML Cell Diff",
        prompt: "Output HTML file",
        value: "ntf-yaml-diff.html",
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
        vscode.window.showErrorMessage(`NTF YAML diff failed: ${(error as Error).message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ntfYaml.openCellDiff", async (...resources: unknown[]) => {
      try {
        const result = await createCellDiffReportFromCommand(resources);
        if (!result) {
          vscode.window.showInformationMessage("No NTF YAML cell diff is available for the selected resource.");
          return;
        }
        openCellDiffPanel(context, result.report, result.uri, result.repositoryPath);
      } catch (error) {
        vscode.window.showErrorMessage(`NTF YAML cell diff failed: ${(error as Error).message}`);
      }
    })
  );

  if (process.env["NTF_YAML_EDITOR_ENABLE_E2E_COMMANDS"] === "1") {
    context.subscriptions.push(
      vscode.commands.registerCommand("ntfYaml.e2e.renderHtml", async (text: unknown) => {
        return renderHtml(extensionRoot, undefined, String(text ?? ""));
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.renderDiffPanelHtml", async (options: Record<string, unknown>) => {
        const report = createDiffReport({
          path: String(options?.["path"] || "case.ntf.yaml"),
          baseRef: String(options?.["baseRef"] || "HEAD"),
          headRef: String(options?.["headRef"] || "working tree"),
          baseText: String(options?.["baseText"] ?? ""),
          headText: String(options?.["headText"] ?? ""),
        });
        return renderHtmlDiffPanel(extensionRoot, undefined, report, {
          allowDiffControls: options?.["allowDiffControls"] as boolean | undefined,
        });
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.renderStandaloneDiffHtml", async (options: Record<string, unknown>) => {
        const report = createDiffReport({
          path: String(options?.["path"] || "case.ntf.yaml"),
          baseRef: String(options?.["baseRef"] || "HEAD"),
          headRef: String(options?.["headRef"] || "working tree"),
          baseText: String(options?.["baseText"] ?? ""),
          headText: String(options?.["headText"] ?? ""),
        });
        return renderStandaloneHtmlDiffPanel(extensionRoot, report);
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.renderRefDiffPanelHtml", async (options: Record<string, unknown>) => {
        const report = createRefDiffReport({
          repositoryPath: String(options?.["repositoryPath"] || ""),
          relativePath: String(options?.["relativePath"] || ""),
          baseRef: String(options?.["baseRef"] || "HEAD"),
          headRef: String(options?.["headRef"] || "working tree"),
        });
        if (!report) return "";
        return renderHtmlDiffPanel(extensionRoot, undefined, report, {
          allowDiffControls: options?.["allowDiffControls"] as boolean | undefined,
        });
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.exportStandaloneDiffHtml", async (options: Record<string, unknown>) => {
        const report = createRefDiffReport({
          repositoryPath: String(options?.["repositoryPath"] || ""),
          relativePath: String(options?.["relativePath"] || ""),
          baseRef: String(options?.["baseRef"] || "HEAD"),
          headRef: String(options?.["headRef"] || "working tree"),
        });
        if (!report) return false;
        fs.writeFileSync(String(options?.["outputPath"] || ""), renderStandaloneHtmlDiffPanel(extensionRoot, report));
        return true;
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.exportAllStandaloneDiffHtml", async (options: Record<string, unknown>) => {
        const outDir = String(options?.["outputDir"] || "");
        const reports = diffWorkingTreeAllFiles({
          repositoryPath: String(options?.["repositoryPath"] || ""),
          baseRef: String(options?.["baseRef"] || "HEAD"),
          headRef: String(options?.["headRef"] || "working tree"),
        });
        fs.mkdirSync(outDir, { recursive: true });
        const written: string[] = [];
        for (const report of reports) {
          if (!report?.files?.[0]) continue;
          const fileName = (report.files[0].path || "diff").replace(/[\\/]/g, "_") + "-diff.html";
          fs.writeFileSync(path.join(outDir, fileName), renderStandaloneHtmlDiffPanel(extensionRoot, report));
          written.push(fileName);
        }
        return written.sort();
      }),
      vscode.commands.registerCommand("ntfYaml.e2e.roundTripFile", async (uri: vscode.Uri) => {
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

// ── Editor provider ────────────────────────────────────────────────────────

interface EditorHandle {
  document: vscode.TextDocument;
  updateWebview: () => void;
  setSidebarWidth: (width: number) => void;
}

class NtfYamlEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly editors = new Set<EditorHandle>();
  private sidebarWidth = 240;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => this.updateRelatedEditors(event.document.uri)),
      vscode.workspace.onDidSaveTextDocument(document => this.updateRelatedEditors(document.uri))
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    const viewContext = editorViewContextForUri(document.uri);
    const diffReport = createEditorDiffReport(document);
    const initialText = diffReport
      ? (viewContext.diffSide === "base" ? diffReport.baseText : diffReport.headText)
      : document.getText();
    const webviewDiffReport = this.shouldUseWebviewDiffReport(document) ? diffReport : null;
    webviewPanel.webview.html = renderHtml(extensionRoot, webviewPanel.webview, document.getText(), {
      initialText,
      diffReport,
      webviewDiffReport,
      readOnly: viewContext.readOnly,
      diffSide: viewContext.diffSide,
      sidebarWidth: this.sidebarWidth,
    });

    const updateWebview = (): void => {
      const nextDiffReport = createEditorDiffReport(document);
      const nextText = nextDiffReport
        ? (viewContext.diffSide === "base" ? nextDiffReport.baseText : nextDiffReport.headText)
        : document.getText();
      webviewPanel.webview.postMessage({
        type: "update",
        model: parseYaml(nextText),
        diffReport: this.shouldUseWebviewDiffReport(document) ? nextDiffReport : null,
      });
    };

    const editor: EditorHandle = {
      document,
      updateWebview,
      setSidebarWidth: width => webviewPanel.webview.postMessage({ type: "setSidebarWidth", width }),
    };
    this.editors.add(editor);
    webviewPanel.onDidDispose(() => this.editors.delete(editor));
    if (document.uri.scheme === "git") {
      this.updateRelatedEditors(document.uri);
    }

    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; width?: number; model?: ReturnType<typeof parseYaml> }) => {
      if (message.type === "sidebarResize") {
        this.updateSidebarWidth(message.width ?? 0);
        return;
      }
      if (message.type !== "save" || document.uri.scheme !== "file") {
        return;
      }
      const yamlText = message.model ? serializeYaml(message.model) : "";
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      edit.replace(document.uri, fullRange, yamlText);
      await vscode.workspace.applyEdit(edit);
      await document.save();
    });
  }

  updateSidebarWidth(width: number): void {
    const nextWidth = Math.max(140, Math.min(420, Math.round(Number(width))));
    if (!Number.isFinite(nextWidth)) return;
    this.sidebarWidth = nextWidth;
    for (const editor of this.editors) {
      editor.setSidebarWidth(nextWidth);
    }
  }

  updateRelatedEditors(uri: vscode.Uri): void {
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

  private shouldUseWebviewDiffReport(document: vscode.TextDocument): boolean {
    return shouldUseWebviewDiffReport(document.uri, [...this.editors].map(editor => editor.document.uri));
  }
}

// ── Cell diff command ──────────────────────────────────────────────────────

async function createCellDiffReportFromCommand(
  resources: unknown[]
): Promise<{ report: DiffReport; uri: vscode.Uri; repositoryPath: string } | null> {
  const candidates = collectResourceUris(resources);
  const uri = candidates.find(isNtfYamlUri) || vscode.window.activeTextEditor?.document?.uri;
  if (!uri || !isNtfYamlUri(uri)) return null;
  const repositoryPath = await gitRepositoryPathFor(uri);
  let report: DiffReport | null;
  if (uri.scheme === "git") {
    const document = await vscode.workspace.openTextDocument(uri);
    report = createDocumentDiffReport({
      uri,
      text: document.getText(),
      workspaceFolder: repositoryPath,
      repositoryPath,
    });
  } else {
    report = createReportFromResource(uri, { workspaceFolder: repositoryPath, repositoryPath });
  }
  if (!report) return null;
  return { report, uri, repositoryPath };
}

function createEditorDiffReport(document: vscode.TextDocument): DiffReport | null {
  try {
    const folder = workspaceFolderFor(document.uri);
    return createDocumentDiffReport({
      uri: document.uri,
      text: document.getText(),
      workspaceFolder: folder?.uri.fsPath || "",
    });
  } catch {
    return null;
  }
}

function workspaceFolderFor(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)
    || vscode.workspace.workspaceFolders?.find(folder => uri.fsPath?.startsWith(folder.uri.fsPath));
}

async function gitRepositoryPathFor(uri: vscode.Uri): Promise<string> {
  const fileUri = uri.scheme === "git"
    ? vscode.Uri.file((parseGitQuery(uri.query).path as string | undefined) || uri.fsPath)
    : uri;
  try {
    const extension = vscode.extensions.getExtension("vscode.git");
    const gitExtension = extension?.isActive ? extension.exports : await extension?.activate();
    const git = gitExtension?.getAPI?.(1);
    const repository = git?.repositories?.find(
      (repo: { rootUri: vscode.Uri }) => isInsideUri(fileUri, repo.rootUri)
    );
    if (repository?.rootUri?.fsPath) {
      return repository.rootUri.fsPath;
    }
  } catch {
    // Fall back to filesystem/git discovery in ntfYamlGitDiffContext.
  }
  return workspaceFolderFor(fileUri)?.uri.fsPath || "";
}

function isInsideUri(uri: vscode.Uri, rootUri: vscode.Uri): boolean {
  return isInsidePath(uri?.fsPath || "", rootUri?.fsPath || "");
}

// ── Cell diff panel ────────────────────────────────────────────────────────

function openCellDiffPanel(
  context: vscode.ExtensionContext,
  report: DiffReport,
  fileUri: vscode.Uri,
  repositoryPath: string
): void {
  const panel = vscode.window.createWebviewPanel(
    "ntfYaml.cellDiff",
    "NTF YAML Cell Diff",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  let currentReport = report;

  function refreshPanel(): void {
    try {
      const repoPath = repositoryPath || currentReport.repositoryPath;
      const relPath = currentReport.files[0]?.path || "";
      const newReport = createRefDiffReport({
        repositoryPath: repoPath,
        relativePath: relPath,
        baseRef: currentReport.baseRef || "HEAD",
        headRef: currentReport.headRef || "working tree",
      });
      if (newReport) {
        currentReport = newReport;
        panel.webview.html = renderHtmlDiffPanel(extensionRoot, panel.webview, currentReport);
      }
    } catch { /* ignore */ }
  }

  const watchedPath = fileUri
    ? (fileUri.scheme === "git"
      ? ((parseGitQuery(fileUri.query).path as string | undefined) || fileUri.fsPath)
      : fileUri.fsPath)
    : "";
  const saveWatcher = vscode.workspace.onDidSaveTextDocument(doc => {
    const docPath = doc.uri.scheme === "file" ? doc.uri.fsPath
      : doc.uri.scheme === "git" ? ((parseGitQuery(doc.uri.query).path as string | undefined) || doc.uri.fsPath) : "";
    if (docPath && watchedPath && path.resolve(docPath) === path.resolve(watchedPath)) {
      refreshPanel();
    }
  });
  panel.onDidDispose(() => saveWatcher.dispose());

  panel.webview.onDidReceiveMessage(async (message: { type: string; baseRef?: string; headRef?: string; outputPath?: string; outputDir?: string }) => {
    if (message.type === "changeDiffRefs") {
      try {
        const repoPath = repositoryPath || currentReport.repositoryPath;
        const relPath = currentReport.files[0]?.path || "";
        const newReport = createRefDiffReport({
          repositoryPath: repoPath,
          relativePath: relPath,
          baseRef: message.baseRef || "HEAD",
          headRef: message.headRef || "working tree",
        });
        if (!newReport) {
          panel.webview.postMessage({ type: "diffRefError", message: "diff refs could not be resolved" });
          return;
        }
        currentReport = newReport;
        panel.webview.html = renderHtmlDiffPanel(extensionRoot, panel.webview, currentReport);
      } catch (err) {
        panel.webview.postMessage({ type: "diffRefError", message: (err as Error).message });
      }
    } else if (message.type === "exportHtml") {
      const relPath = currentReport.files[0]?.path || "diff";
      const defaultName = relPath.replace(/[\\/]/g, "_") + "-diff.html";
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(currentReport.repositoryPath || ".", defaultName)),
        filters: { HTML: ["html"] },
      });
      if (saveUri) {
        fs.writeFileSync(saveUri.fsPath, renderStandaloneHtmlDiffPanel(extensionRoot, currentReport));
        vscode.window.showInformationMessage(`NTF YAML diff exported: ${path.basename(saveUri.fsPath)}`);
      }
    } else if (message.type === "exportAllHtml") {
      const folderUris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "HTML出力先フォルダを選択",
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
          if (!r?.files[0]) continue;
          const fileName = (r.files[0].path || "diff").replace(/[\\/]/g, "_") + "-diff.html";
          fs.writeFileSync(path.join(outDir, fileName), renderStandaloneHtmlDiffPanel(extensionRoot, r));
          written++;
        }
        vscode.window.showInformationMessage(`NTF YAML diff: ${written}件のHTMLを出力しました: ${outDir}`);
      } catch (err) {
        vscode.window.showErrorMessage(`NTF YAML Export All failed: ${(err as Error).message}`);
      }
    }
  }, undefined, context.subscriptions);

  panel.webview.html = renderHtmlDiffPanel(extensionRoot, panel.webview, report);
}
