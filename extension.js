const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { analyzeYaml, parseYaml, serializeYaml } = require("./lib/ntfYamlModel");

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Editor</title>
  <style nonce="${nonce}">
    :root {
      --bg: #f7f7f5;
      --panel: #ffffff;
      --text: #202124;
      --muted: #626a73;
      --line: #c9ced4;
      --accent: #006d77;
      --accent-strong: #00525a;
      --warn: #8a4b00;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .app {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 100vh;
    }
    aside {
      border-right: 1px solid var(--line);
      background: #eef1ef;
      padding: 14px;
      overflow: auto;
    }
    main {
      padding: 16px;
      overflow: auto;
    }
    h1, h2, h3 {
      margin: 0 0 10px;
      line-height: 1.3;
    }
    h1 {
      font-size: 18px;
    }
    h2 {
      font-size: 16px;
      margin-top: 18px;
    }
    button {
      border: 1px solid var(--accent-strong);
      border-radius: 6px;
      background: var(--accent);
      color: white;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
    }
    button.secondary {
      background: white;
      color: var(--accent-strong);
    }
    button.sheet {
      display: block;
      width: 100%;
      margin: 0 0 8px;
      text-align: left;
      background: white;
      color: var(--text);
      border-color: var(--line);
    }
    button.sheet.active {
      border-color: var(--accent-strong);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .message {
      color: var(--muted);
    }
    .block {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin: 0 0 16px;
      overflow: hidden;
    }
    .block-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px;
      border-bottom: 1px solid var(--line);
      background: #f3f5f4;
    }
    .block-name {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .table-scroll {
      overflow-x: auto;
      width: 100%;
    }
    table {
      border-collapse: collapse;
      table-layout: auto;
    }
    th, td {
      border: 1px solid var(--line);
      min-width: 100px;
      padding: 0;
      vertical-align: top;
    }
    th {
      background: #e8ecea;
    }
    td input, th input {
      width: auto;
      field-sizing: content;
      min-width: 4ch;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      min-height: 32px;
      border: 0;
      padding: 6px;
      background: transparent;
      color: var(--text);
      font: inherit;
    }
    input:focus {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
      background: white;
    }
    pre {
      margin: 0;
      padding: 10px;
      overflow: auto;
      color: var(--warn);
      background: #fff8ec;
    }
    .rawrows-table td:first-child {
      background: #e8ecea;
      font-weight: bold;
      text-align: center;
      color: var(--muted);
      min-width: 2ch;
    }
    .add-col-form {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .add-col-form input[type=text] {
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 4px 8px;
      font: inherit;
      min-height: unset;
      width: 140px;
      field-sizing: content;
      min-width: 80px;
      background: white;
      color: var(--text);
    }
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
