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
      aside.append(renderAddSheetForm());
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
        main.append(renderSheetHeader(sheet));
        main.append(renderAddBlockForm(sheet));
        for (const block of sheet.blocks) {
          main.append(renderBlock(sheet, block));
        }
      }

      root.append(app);
    }

    function renderAddSheetForm() {
      const form = document.createElement("div");
      form.className = "side-form";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "New sheet";
      input.dataset.role = "new-sheet-name";
      const button = document.createElement("button");
      button.className = "secondary";
      button.dataset.action = "add-sheet";
      button.textContent = "Add Sheet";
      const add = () => {
        const name = uniqueName(input.value.trim() || "newSheet", state.sheets.map(sheet => sheet.name));
        state.sheets.push({ name, blocks: [] });
        activeSheet = name;
        render();
      };
      button.onclick = add;
      input.onkeydown = e => { if (e.key === "Enter") add(); };
      form.append(input, button);
      return form;
    }

    function renderSheetHeader(sheet) {
      const header = document.createElement("div");
      header.className = "sheet-header";
      const input = document.createElement("input");
      input.dataset.role = "sheet-name";
      input.value = sheet.name;
      input.onchange = () => renameSheet(sheet, input.value);
      const remove = document.createElement("button");
      remove.className = "danger";
      remove.dataset.action = "delete-sheet";
      remove.textContent = "Delete Sheet";
      remove.onclick = () => {
        const index = state.sheets.indexOf(sheet);
        state.sheets.splice(index, 1);
        activeSheet = state.sheets[Math.max(0, index - 1)]?.name ?? "";
        render();
      };
      header.append(input, remove);
      return header;
    }

    function renderAddBlockForm(sheet) {
      const form = document.createElement("div");
      form.className = "add-block-form";
      const kind = document.createElement("select");
      kind.dataset.role = "new-block-kind";
      for (const value of ["LIST_MAP", "SETUP_TABLE", "EXPECTED_TABLE", "SETUP_VARIABLE", "EXPECTED_VARIABLE"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        kind.append(option);
      }
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Block name or path";
      input.dataset.role = "new-block-name";
      const button = document.createElement("button");
      button.className = "secondary";
      button.dataset.action = "add-block";
      button.textContent = "Add Block";
      const add = () => {
        const name = uniqueName(kind.value + "=" + (input.value.trim() || "newBlock"), sheet.blocks.map(block => block.name));
        sheet.blocks.push({
          name,
          kind: model.inferKind(name),
          rows: model.isRawRowsBlock(name) ? [[""]] : [{}],
          columnOrder: model.isTableBlock(name) ? ["no"] : [],
          raw: ""
        });
        render();
      };
      button.onclick = add;
      input.onkeydown = e => { if (e.key === "Enter") add(); };
      form.append(kind, input, button);
      return form;
    }

    function renderBlock(sheet, block) {
      const wrapper = document.createElement("section");
      wrapper.className = "block";
      wrapper.dataset.blockName = block.name;
      const header = document.createElement("div");
      header.className = "block-header";
      const name = document.createElement("input");
      name.className = "block-name";
      name.dataset.role = "block-name";
      name.value = block.name;
      name.onchange = () => renameBlock(sheet, block, name.value);
      header.append(name);

      if (model.isTableBlock(block.name)) {
        const actions = document.createElement("div");
        actions.className = "block-actions";
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
        actions.append(addRow, addColForm, renderDeleteBlockButton(sheet, block));
        header.append(actions);
      } else if (model.isRawRowsBlock(block.name)) {
        const actions = document.createElement("div");
        actions.className = "block-actions";
        const addRow = document.createElement("button");
        addRow.className = "secondary";
        addRow.dataset.action = "add-row";
        addRow.textContent = "Add Row";
        addRow.onclick = () => {
          const width = rawWidth(block);
          block.rows.push(Array.from({ length: Math.max(width, 1) }, () => ""));
          render();
        };
        const addColumn = document.createElement("button");
        addColumn.className = "secondary";
        addColumn.dataset.action = "add-column";
        addColumn.textContent = "Add Column";
        addColumn.onclick = () => {
          if (!block.rows.length) {
            block.rows.push([""]);
          } else {
            for (const row of block.rows) {
              row.push("");
            }
          }
          render();
        };
        actions.append(addRow, addColumn, renderDeleteBlockButton(sheet, block));
        header.append(actions);
      } else {
        const actions = document.createElement("div");
        actions.className = "block-actions";
        actions.append(renderDeleteBlockButton(sheet, block));
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
      const actionHead = document.createElement("th");
      actionHead.className = "row-actions-cell";
      actionHead.textContent = "#";
      headRow.append(actionHead);
      for (const col of cols) {
        const th = document.createElement("th");
        const columnActions = document.createElement("div");
        columnActions.className = "cell-actions";
        columnActions.append(
          smallButton("←", "Move column left", () => moveColumn(block, col, -1)),
          smallButton("→", "Move column right", () => moveColumn(block, col, 1)),
          smallButton("×", "Delete column", () => deleteColumn(block, col), "danger compact")
        );
        const input = document.createElement("input");
        input.dataset.role = "column-name";
        input.value = col;
        input.onchange = () => renameColumn(block, col, input.value);
        th.append(columnActions, input);
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      block.rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        const actionTd = document.createElement("td");
        actionTd.className = "row-actions-cell";
        actionTd.append(
          smallButton("↑", "Move row up", () => moveRow(block, index, -1)),
          smallButton("↓", "Move row down", () => moveRow(block, index, 1)),
          smallButton("×", "Delete row", () => deleteRow(block, index), "danger compact")
        );
        tr.append(actionTd);
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
      thIdx.className = "row-actions-cell";
      headRow.append(thIdx);
      for (let i = 0; i < maxCols; i++) {
        const th = document.createElement("th");
        const columnActions = document.createElement("div");
        columnActions.className = "cell-actions";
        columnActions.append(
          smallButton("←", "Move raw column left", () => moveRawColumn(block, i, -1)),
          smallButton("→", "Move raw column right", () => moveRawColumn(block, i, 1)),
          smallButton("×", "Delete raw column", () => deleteRawColumn(block, i), "danger compact")
        );
        const label = document.createElement("div");
        label.textContent = i;
        th.append(columnActions, label);
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);
      const tbody = document.createElement("tbody");
      block.rows.forEach(function(row, ri) {
        const tr = document.createElement("tr");
        const tdIdx = document.createElement("td");
        tdIdx.className = "row-actions-cell";
        tdIdx.append(
          smallButton("↑", "Move raw row up", () => moveRow(block, ri, -1)),
          smallButton("↓", "Move raw row down", () => moveRow(block, ri, 1)),
          smallButton("×", "Delete raw row", () => deleteRow(block, ri), "danger compact")
        );
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

    function renderDeleteBlockButton(sheet, block) {
      const button = document.createElement("button");
      button.className = "danger";
      button.dataset.action = "delete-block";
      button.textContent = "Delete Block";
      button.onclick = () => {
        sheet.blocks.splice(sheet.blocks.indexOf(block), 1);
        render();
      };
      return button;
    }

    function smallButton(text, title, onclick, className) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className || "secondary compact";
      button.title = title;
      button.textContent = text;
      button.onclick = onclick;
      return button;
    }

    function renameSheet(sheet, to) {
      const next = String(to || "").trim();
      if (!next || next === sheet.name) {
        render();
        return;
      }
      sheet.name = uniqueName(next, state.sheets.filter(item => item !== sheet).map(item => item.name));
      activeSheet = sheet.name;
      render();
    }

    function renameBlock(sheet, block, to) {
      const next = String(to || "").trim();
      if (!next || next === block.name) {
        render();
        return;
      }
      block.name = uniqueName(next, sheet.blocks.filter(item => item !== block).map(item => item.name));
      block.kind = model.inferKind(block.name);
      if (model.isRawRowsBlock(block.name)) {
        const cols = model.columns(block);
        block.rows = block.rows.map(row => Array.isArray(row) ? row : cols.map(col => row[col] ?? ""));
        block.columnOrder = [];
      } else if (model.isTableBlock(block.name)) {
        if (block.rows.some(Array.isArray)) {
          const width = block.rows.reduce((max, row) => Math.max(max, row.length), 0);
          const cols = Array.from({ length: width }, (_, index) => index === 0 ? "no" : "column" + index);
          block.rows = block.rows.map(row => {
            const object = {};
            cols.forEach((col, index) => { object[col] = row[index] ?? ""; });
            return object;
          });
          block.columnOrder = cols;
        } else if (!Array.isArray(block.columnOrder) || !block.columnOrder.length) {
          block.columnOrder = model.columns(block);
        }
      }
      render();
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

    function deleteRow(block, index) {
      block.rows.splice(index, 1);
      render();
    }

    function moveRow(block, index, direction) {
      const next = index + direction;
      if (next < 0 || next >= block.rows.length) {
        return;
      }
      const row = block.rows[index];
      block.rows.splice(index, 1);
      block.rows.splice(next, 0, row);
      render();
    }

    function deleteColumn(block, name) {
      for (const row of block.rows) {
        delete row[name];
      }
      if (Array.isArray(block.columnOrder)) {
        block.columnOrder = block.columnOrder.filter(col => col !== name);
      }
      render();
    }

    function moveColumn(block, name, direction) {
      const order = model.columns(block);
      const index = order.indexOf(name);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= order.length) {
        return;
      }
      order.splice(index, 1);
      order.splice(next, 0, name);
      block.columnOrder = order;
      render();
    }

    function rawWidth(block) {
      return block.rows.reduce((max, row) => Math.max(max, row.length), 0);
    }

    function deleteRawColumn(block, index) {
      for (const row of block.rows) {
        row.splice(index, 1);
      }
      render();
    }

    function moveRawColumn(block, index, direction) {
      const next = index + direction;
      const width = rawWidth(block);
      if (next < 0 || next >= width) {
        return;
      }
      for (const row of block.rows) {
        const value = row[index] ?? "";
        row.splice(index, 1);
        row.splice(next, 0, value);
      }
      render();
    }

    function addColumnName(block, name) {
      if (!Array.isArray(block.columnOrder)) {
        block.columnOrder = model.columns(block);
      }
      if (!block.columnOrder.includes(name)) {
        block.columnOrder.push(name);
      }
    }

    function uniqueName(base, existing) {
      const used = new Set(existing);
      if (!used.has(base)) {
        return base;
      }
      let index = 2;
      while (used.has(base + index)) {
        index++;
      }
      return base + index;
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
