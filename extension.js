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
    const {
      parseYaml,
      serializeYaml,
      isTableBlock,
      isRawRowsBlock,
      columns
    } = globalThis.NtfYamlModel;

    const vscode = acquireVsCodeApi();
    let state = parseYaml(${initialState});
    let activeSheet = state.sheets[0]?.name ?? "";

    window.addEventListener("message", event => {
      if (event.data.type === "update") {
        state = parseYaml(event.data.text);
        if (!state.sheets.some(sheet => sheet.name === activeSheet)) {
          activeSheet = state.sheets[0]?.name ?? "";
        }
        render();
      }
    });

    function render() {
      const root = document.getElementById("root");
      const sheet = state.sheets.find(item => item.name === activeSheet);
      root.innerHTML = "";

      const app = document.createElement("div");
      app.className = "app";
      const aside = document.createElement("aside");
      const main = document.createElement("main");
      app.append(aside, main);

      const title = document.createElement("h1");
      title.textContent = "NTF YAML";
      aside.append(title);
      for (const item of state.sheets) {
        const button = document.createElement("button");
        button.className = "sheet" + (item.name === activeSheet ? " active" : "");
        button.textContent = item.name;
        button.onclick = () => {
          activeSheet = item.name;
          render();
        };
        aside.append(button);
      }

      const toolbar = document.createElement("div");
      toolbar.className = "toolbar";
      const save = document.createElement("button");
      save.textContent = "Save YAML";
      save.onclick = () => vscode.postMessage({ type: "save", text: serializeYaml(state) });
      const message = document.createElement("span");
      message.className = "message";
      message.textContent = "Table blocks are editable. Raw blocks are preserved as text.";
      toolbar.append(save, message);
      main.append(toolbar);

      if (!sheet) {
        const empty = document.createElement("p");
        empty.textContent = "No sheets found.";
        main.append(empty);
      } else {
        const heading = document.createElement("h2");
        heading.textContent = sheet.name;
        main.append(heading);
        for (const block of sheet.blocks) {
          main.append(renderBlock(block));
        }
      }

      root.append(app);
    }

    function renderBlock(block) {
      const wrapper = document.createElement("section");
      wrapper.className = "block";
      const header = document.createElement("div");
      header.className = "block-header";
      const name = document.createElement("div");
      name.className = "block-name";
      name.textContent = block.name;
      header.append(name);

      if (isTableBlock(block.name)) {
        const actions = document.createElement("div");
        const addRow = document.createElement("button");
        addRow.className = "secondary";
        addRow.textContent = "Add Row";
        addRow.onclick = () => {
          const row = {};
          for (const col of columns(block)) {
            row[col] = "";
          }
          block.rows.push(row);
          render();
        };
        const addColForm = document.createElement("div");
        addColForm.className = "add-col-form";
        const colInput = document.createElement("input");
        colInput.type = "text";
        colInput.placeholder = "列名";
        const addColumn = document.createElement("button");
        addColumn.className = "secondary";
        addColumn.textContent = "Add Column";
        const doAddCol = () => {
          const col = colInput.value.trim();
          if (!col) return;
          for (const row of block.rows) { row[col] = ""; }
          if (block.rows.length === 0) { block.rows.push({ [col]: "" }); }
          colInput.value = "";
          render();
        };
        addColumn.onclick = doAddCol;
        colInput.onkeydown = e => { if (e.key === "Enter") doAddCol(); };
        addColForm.append(colInput, addColumn);
        actions.append(addRow, " ", addColForm);
        header.append(actions);
      }
      wrapper.append(header);

      if (!isTableBlock(block.name)) {
        if (isRawRowsBlock(block.name)) {
          wrapper.append(renderRawRowsTable(block));
          return wrapper;
        }
        const raw = document.createElement("pre");
        raw.textContent = block.raw || "Unsupported block in this PoC.";
        wrapper.append(raw);
        return wrapper;
      }

      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      const table = document.createElement("table");
      const cols = columns(block);
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const col of cols) {
        const th = document.createElement("th");
        const input = document.createElement("input");
        input.value = col;
        input.onchange = () => renameColumn(block, col, input.value);
        th.append(input);
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      block.rows.forEach(row => {
        const tr = document.createElement("tr");
        cols.forEach(col => {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.value = row[col] ?? "";
          input.oninput = () => {
            row[col] = input.value;
          };
          td.append(input);
          tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(tbody);
      scroll.append(table);
      wrapper.append(scroll);
      return wrapper;
    }

    function renderRawRowsTable(block) {
      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      const table = document.createElement("table");
      table.className = "rawrows-table";
      const maxCols = block.rows.reduce(function(m, r) { return Math.max(m, r.length); }, 0);
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const thIdx = document.createElement("th");
      thIdx.textContent = "#";
      headRow.append(thIdx);
      for (let i = 0; i < maxCols; i++) {
        const th = document.createElement("th");
        th.textContent = i;
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);
      const tbody = document.createElement("tbody");
      block.rows.forEach(function(row, ri) {
        const tr = document.createElement("tr");
        const tdIdx = document.createElement("td");
        tdIdx.textContent = ri;
        tr.append(tdIdx);
        for (let ci = 0; ci < maxCols; ci++) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.value = row[ci] ?? "";
          (function(r, idx) {
            input.oninput = function() { r[idx] = input.value; };
          })(row, ci);
          td.append(input);
          tr.append(td);
        }
        tbody.append(tr);
      });
      table.append(tbody);
      scroll.append(table);
      return scroll;
    }

    function renameColumn(block, from, to) {
      const next = String(to || "").trim();
      if (!next || next === from) {
        render();
        return;
      }
      for (const row of block.rows) {
        row[next] = row[from] ?? "";
        delete row[from];
      }
      render();
    }

    render();
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
