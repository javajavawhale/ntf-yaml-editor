const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { analyzeYaml, parseYaml, serializeYaml } = require("./lib/ntfYamlModel");
const { diffGitRefs, renderHtmlReport } = require("./lib/ntfYamlDiff");

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
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = renderHtml(webviewPanel.webview, document.getText());

    const updateWebview = () => {
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText()
      });
    };

    const subscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });
    webviewPanel.onDidDispose(() => subscription.dispose());

    webviewPanel.webview.onDidReceiveMessage(async message => {
      if (message.type !== "save") {
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
}

function renderHtml(webview, initialText) {
  const nonce = getNonce();
  const initialState = JSON.stringify(initialText).replace(/</g, "\\u003c");
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
