(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NtfYamlEditorWebview = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function createNtfYamlEditorApp(options) {
    const root = options.root;
    const model = options.model;
    const vscode = options.vscode;
    const document = root.ownerDocument;
    let state = model.parseYaml(options.initialText || "");
    let activeSheet = state.sheets[0]?.name ?? "";

    function handleMessage(event) {
      if (event.data.type === "update") {
        state = model.parseYaml(event.data.text);
        if (!state.sheets.some(sheet => sheet.name === activeSheet)) {
          activeSheet = state.sheets[0]?.name ?? "";
        }
        render();
      }
    }

    if (options.window) {
      options.window.addEventListener("message", handleMessage);
    }

    function render() {
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
        button.dataset.sheetName = item.name;
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
      save.dataset.action = "save";
      save.textContent = "Save YAML";
      save.onclick = () => vscode.postMessage({ type: "save", text: model.serializeYaml(state) });
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
      wrapper.dataset.blockName = block.name;
      const header = document.createElement("div");
      header.className = "block-header";
      const name = document.createElement("div");
      name.className = "block-name";
      name.textContent = block.name;
      header.append(name);

      if (model.isTableBlock(block.name)) {
        const actions = document.createElement("div");
        const addRow = document.createElement("button");
        addRow.className = "secondary";
        addRow.dataset.action = "add-row";
        addRow.textContent = "Add Row";
        addRow.onclick = () => {
          const row = {};
          for (const col of model.columns(block)) {
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
        colInput.dataset.role = "new-column-name";
        const addColumn = document.createElement("button");
        addColumn.className = "secondary";
        addColumn.dataset.action = "add-column";
        addColumn.textContent = "Add Column";
        const doAddCol = () => {
          const col = colInput.value.trim();
          if (!col) return;
          for (const row of block.rows) { row[col] = ""; }
          if (block.rows.length === 0) { block.rows.push({ [col]: "" }); }
          addColumnName(block, col);
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

      if (!model.isTableBlock(block.name)) {
        if (model.isRawRowsBlock(block.name)) {
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
      const cols = model.columns(block);
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const col of cols) {
        const th = document.createElement("th");
        const input = document.createElement("input");
        input.dataset.role = "column-name";
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
          input.dataset.column = col;
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
          input.dataset.rawRow = String(ri);
          input.dataset.rawColumn = String(ci);
          input.value = row[ci] ?? "";
          (function(r, idx) {
            input.oninput = function() {
              r[idx] = input.value;
            };
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
        replaceRowKey(row, from, next);
      }
      if (Array.isArray(block.columnOrder)) {
        block.columnOrder = block.columnOrder.map(name => name === from ? next : name);
      }
      render();
    }

    function replaceRowKey(row, from, to) {
      const nextRow = {};
      let replaced = false;
      for (const name of Object.keys(row)) {
        if (name === from) {
          nextRow[to] = row[from] ?? "";
          replaced = true;
        } else {
          nextRow[name] = row[name];
        }
      }
      if (!replaced) {
        nextRow[to] = "";
      }
      for (const name of Object.keys(row)) {
        delete row[name];
      }
      Object.assign(row, nextRow);
    }

    function addColumnName(block, name) {
      if (!Array.isArray(block.columnOrder)) {
        block.columnOrder = model.columns(block);
      }
      if (!block.columnOrder.includes(name)) {
        block.columnOrder.push(name);
      }
    }

    render();
    return {
      render,
      getState: () => state,
      getActiveSheet: () => activeSheet,
      dispose() {
        if (options.window) {
          options.window.removeEventListener("message", handleMessage);
        }
      }
    };
  }

  return { createNtfYamlEditorApp };
});
