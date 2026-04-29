const vscode = require("vscode");

function activate(context) {
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

    function parseYaml(text) {
      const sheets = [];
      let currentSheet = null;
      let currentBlock = null;
      let currentRow = null;
      let rawBuffer = [];

      function flushRaw() {
        if (currentBlock && rawBuffer.length) {
          currentBlock.raw = rawBuffer.join("\\n");
          rawBuffer = [];
        }
      }

      for (const line of text.split(/\\r?\\n/)) {
        if (!line.trim() || line.trim().startsWith("#")) {
          continue;
        }
        const top = line.match(/^([^\\s][^:]*):(?:\\s*#.*)?$/);
        if (top) {
          flushRaw();
          currentSheet = { name: top[1].trim(), blocks: [] };
          sheets.push(currentSheet);
          currentBlock = null;
          currentRow = null;
          continue;
        }
        if (!currentSheet) {
          continue;
        }
        const block = line.match(/^\\s{2}([^:]+):(?:\\s*#(.*))?$/);
        if (block) {
          flushRaw();
          currentBlock = {
            name: block[1].trim(),
            kind: block[2]?.trim() || inferKind(block[1].trim()),
            rows: [],
            raw: ""
          };
          currentSheet.blocks.push(currentBlock);
          currentRow = null;
          continue;
        }
        if (!currentBlock) {
          continue;
        }
        if (!isTableBlock(currentBlock.name) && !isRawRowsBlock(currentBlock.name)) {
          rawBuffer.push(line.replace(/^\\s{4}/, ""));
          continue;
        }
        // RawRows: [ a, b, c ] 形式の配列行をパース
        if (isRawRowsBlock(currentBlock.name)) {
          const singleLine = line.match(/^\\s{4}-?\\s*\\[(.*)\\]\\s*,?$/);
          if (singleLine) {
            currentBlock.rows.push(parseInlineArray("[" + singleLine[1] + "]"));
          } else {
            const startArr = line.match(/^\\s{4}-?\\s*\\[(.*)$/);
            if (startArr) {
              rawBuffer._arr = [startArr[1]];
            } else if (rawBuffer._arr) {
              const endArr = line.match(/^\\s*(.*?)\\]\\s*,?$/);
              if (endArr) {
                rawBuffer._arr.push(endArr[1]);
                currentBlock.rows.push(parseInlineArray("[" + rawBuffer._arr.join(",") + "]"));
                delete rawBuffer._arr;
              } else {
                rawBuffer._arr.push(line.trim());
              }
            }
          }
          continue;
        }
        const rowStart = line.match(/^\\s{4}-\\s*(.*)$/);
        if (rowStart) {
          currentRow = {};
          currentBlock.rows.push(currentRow);
          const inline = rowStart[1];
          if (inline) {
            const pair = inline.match(/^([^:]+):\\s*(.*)$/);
            if (pair) {
              currentRow[unquote(pair[1].trim())] = unquote(pair[2].trim());
            }
          }
          continue;
        }
        const pair = line.match(/^\\s{6}([^:]+):\\s*(.*)$/);
        if (pair && currentRow) {
          currentRow[unquote(pair[1].trim())] = unquote(pair[2].trim());
        }
      }
      flushRaw();
      return { sheets };
    }

    function inferKind(name) {
      if (isTableBlock(name)) return "ListMap";
      if (isRawRowsBlock(name)) return "RawRows";
      return "Raw";
    }

    function isTableBlock(name) {
      return /^(LIST_MAP|SETUP_TABLE|EXPECTED_TABLE)(\\[\\d+\\])?=/.test(name);
    }

    function isRawRowsBlock(name) {
      return /^(SETUP_VARIABLE|EXPECTED_VARIABLE)(\\[\\d+\\])?=/.test(name);
    }

    function parseInlineArray(text) {
      const inner = text.trim().replace(/^\\[/, "").replace(/\\]$/, "");
      const items = [];
      let cur = "", inQ = false, qc = "";
      for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (!inQ && (c === '"' || c === "'")) { inQ = true; qc = c; continue; }
        if (inQ && c === qc) { inQ = false; continue; }
        if (!inQ && c === ",") { items.push(cur.trim()); cur = ""; continue; }
        cur += c;
      }
      items.push(cur.trim());
      return items.map(function(s) { return s === "~" ? "" : s; });
    }

    function unquote(value) {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        return value.slice(1, -1);
      }
      return value;
    }

    function quote(value) {
      const text = String(value ?? "");
      return '"' + text.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"';
    }

    function key(value) {
      const text = String(value ?? "");
      if (/^[A-Za-z0-9_.-]+$/.test(text)) {
        return text;
      }
      return quote(text);
    }

    function columns(block) {
      const names = [];
      for (const row of block.rows) {
        for (const key of Object.keys(row)) {
          if (!names.includes(key)) {
            names.push(key);
          }
        }
      }
      return names.length ? names : ["no"];
    }

    function serializeYaml(model) {
      const out = [];
      for (const sheet of model.sheets) {
        out.push(sheet.name + ":");
        for (const block of sheet.blocks) {
          out.push("  " + block.name + ": #" + (block.kind || inferKind(block.name)));
          if (isTableBlock(block.name)) {
              const cols = columns(block);
            for (const row of block.rows) {
              out.push("    - " + key(cols[0]) + ": " + quote(row[cols[0]] ?? ""));
              for (const col of cols.slice(1)) {
                out.push("      " + key(col) + ": " + quote(row[col] ?? ""));
              }
            }
          } else if (isRawRowsBlock(block.name)) {
            for (const row of block.rows) {
              const cells = row.map(function(c) { return c === "" ? "\"\"" : quote(c); });
              out.push("    - [ " + cells.join(", ") + " ]");
            }
          } else if (block.raw) {
            for (const rawLine of block.raw.split("\\n")) {
              out.push("    " + rawLine);
            }
          }
          out.push("");
        }
      }
      return out.join("\\n").replace(/\\n+$/, "\\n");
    }

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
