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
    let diffReport = options.initialDiffReport || null;
    const readOnly = Boolean(options.readOnly);
    const diffSide = options.diffSide != null ? options.diffSide : (readOnly ? "base" : "head");
    let nextId = 1;
    let activeSheetId = "";
    ensureIds(state);
    activeSheetId = state.sheets[0]?._id ?? "";

    function handleMessage(event) {
      if (event.data.type === "update") {
        const activeName = activeSheet()?.name;
        state = model.parseYaml(event.data.text);
        diffReport = event.data.diffReport || null;
        ensureIds(state);
        activeSheetId = state.sheets.find(sheet => sheet.name === activeName)?._id
          ?? state.sheets[0]?._id
          ?? "";
        render();
      }
    }

    if (options.window) {
      options.window.addEventListener("message", handleMessage);
    }

    function render() {
      const sheet = activeSheet();
      root.innerHTML = "";

      const app = document.createElement("div");
      app.className = "app";
      const aside = document.createElement("aside");
      const main = document.createElement("main");
      app.append(aside, main);

      const title = document.createElement("h1");
      title.textContent = "NTF YAML";
      aside.append(title);
      if (!readOnly) {
        aside.append(renderSaveControl());
        aside.append(renderAddSheetForm());
      }
      for (const item of state.sheets) {
        const itemWrapper = document.createElement("div");
        itemWrapper.className = "sheet-item";
        itemWrapper.draggable = !readOnly;
        if (!readOnly) {
          attachDragSort(itemWrapper, state.sheets, item, () => { activeSheetId = item._id; });
        }
        const sheetControl = item._id === activeSheetId
          ? renderActiveSheetNameInput(item)
          : renderSheetSelector(item);
        itemWrapper.append(sheetControl);
        if (!readOnly) {
          const deleteBtn = smallButton(CLOSE_SVG, "Delete sheet", () => {
            const index = state.sheets.indexOf(item);
            state.sheets.splice(index, 1);
            activeSheetId = state.sheets[Math.max(0, index - 1)]?._id ?? "";
            render();
          }, "danger ghost compact table-delete-button");
          deleteBtn.dataset.action = "delete-sheet";
          itemWrapper.append(deleteBtn);
        }
        aside.append(itemWrapper);
      }

      if (!sheet) {
        const empty = document.createElement("p");
        empty.textContent = "No sheets found.";
        main.append(empty);
      } else {
        if (diffReport) {
          main.append(renderDiffLegend());
        }
        main.append(renderSheetHeader(sheet));
        if (!readOnly) {
          main.append(renderAddBlockForm(sheet));
        }
        for (const block of sheet.blocks) {
          main.append(renderBlock(sheet, block));
        }
      }

      root.append(app);
    }

    function renderSaveControl() {
      const toolbar = document.createElement("div");
      toolbar.className = "side-toolbar";
      const save = document.createElement("button");
      save.dataset.action = "save";
      save.textContent = "Save YAML";
      save.onclick = () => vscode.postMessage({ type: "save", text: model.serializeYaml(state) });
      toolbar.append(save);
      return toolbar;
    }

    function renderAddSheetForm() {
      const form = document.createElement("div");
      form.className = "side-form";
      const button = document.createElement("button");
      button.className = "secondary";
      button.dataset.action = "add-sheet";
      button.textContent = "Add Sheet";
      const add = () => {
        const sheet = withId({ name: "", blocks: [] });
        state.sheets.push(sheet);
        activeSheetId = sheet._id;
        render();
      };
      button.onclick = add;
      form.append(button);
      return form;
    }

    function renderSheetSelector(sheet) {
      const button = document.createElement("button");
      button.className = "sheet";
      button.dataset.sheetName = sheet.name;
      applyDiffClass(button, findDiffSheet(sheet.name)?.status, "diff-sheet");
      if (!readOnly) {
        button.append(createDragHandle());
      }
      button.append(document.createTextNode(sheet.name || "(unnamed sheet)"));
      button.onclick = () => {
        activeSheetId = sheet._id;
        render();
      };
      return button;
    }

    function renderActiveSheetNameInput(sheet) {
      const container = document.createElement("div");
      container.className = "sheet active";
      container.dataset.sheetName = sheet.name;
      applyDiffClass(container, findDiffSheet(sheet.name)?.status, "diff-sheet");
      if (!readOnly) {
        container.append(createDragHandle());
      }
      const input = document.createElement("input");
      input.dataset.role = "sheet-name";
      input.value = sheet.name;
      input.readOnly = readOnly;
      input.placeholder = "Sheet name";
      input.onchange = () => renameSheet(sheet, input.value);
      container.append(input);
      return container;
    }

    function renderSheetHeader(sheet) {
      const header = document.createElement("div");
      header.className = "sheet-header";
      applyDiffClass(header, findDiffSheet(sheet.name)?.status, "diff-sheet");
      const title = document.createElement("h2");
      title.textContent = sheet.name || "(unnamed sheet)";
      header.append(title);
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
      const button = document.createElement("button");
      button.className = "secondary";
      button.dataset.action = "add-block";
      button.textContent = "Add Block";
      const add = () => {
        const name = uniqueName(kind.value + "=", sheet.blocks.map(block => block.name));
        sheet.blocks.push(withId({
          name,
          kind: model.inferKind(name),
          rows: model.isRawRowsBlock(name) ? [[""]] : [{}],
          columnOrder: model.isTableBlock(name) ? ["no"] : [],
          raw: ""
        }));
        render();
      };
      button.onclick = add;
      form.append(kind, button);
      return form;
    }

    function renderBlock(sheet, block) {
      const wrapper = document.createElement("section");
      wrapper.className = "block";
      wrapper.dataset.blockName = block.name;
      wrapper.draggable = !readOnly;
      if (!readOnly) {
        attachDragSort(wrapper, sheet.blocks, block);
      }
      const diffBlock = findDiffBlock(sheet.name, block.name);
      applyDiffClass(wrapper, diffBlock?.status, "diff-block");
      const header = document.createElement("div");
      header.className = "block-header";
      if (!readOnly) {
        header.append(createDragHandle());
      }
      const name = document.createElement("input");
      name.className = "block-name";
      name.dataset.role = "block-name";
      name.value = block.name;
      name.readOnly = readOnly;
      name.onchange = () => renameBlock(sheet, block, name.value);
      header.append(name);

      if (!readOnly && model.isTableBlock(block.name)) {
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
        const addColumn = document.createElement("button");
        addColumn.className = "secondary";
        addColumn.dataset.action = "add-column";
        addColumn.textContent = "Add Column";
        addColumn.onclick = () => {
          const col = uniqueName("col", model.columns(block));
          for (const row of block.rows) { row[col] = ""; }
          if (block.rows.length === 0) { block.rows.push({ [col]: "" }); }
          addColumnName(block, col);
          render();
        };
        actions.append(addRow, addColumn);
        header.append(actions);
        header.append(renderDeleteBlockButton(sheet, block));
      } else if (!readOnly && model.isRawRowsBlock(block.name)) {
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
        actions.append(addRow, addColumn);
        header.append(actions);
        header.append(renderDeleteBlockButton(sheet, block));
      } else if (!readOnly) {
        header.append(renderDeleteBlockButton(sheet, block));
      }
      wrapper.append(header);

      if (!model.isTableBlock(block.name)) {
        if (model.isRawRowsBlock(block.name)) {
          wrapper.append(renderRawRowsTable(block, diffBlock));
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
      actionHead.className = "row-actions-cell table-header-cell";
      headRow.append(actionHead);
      for (const col of cols) {
        const th = document.createElement("th");
        th.className = "table-header-cell";
        th.draggable = !readOnly;
        if (!readOnly) {
          attachIndexDragSort(th, () => model.columns(block).length, cols.indexOf(col), (from, to) => {
            const order = model.columns(block);
            moveItem(order, from, to);
            block.columnOrder = order;
            render();
          });
        }
        const thInner = document.createElement("div");
        thInner.className = "th-inner";
        const thContent = document.createElement("div");
        thContent.className = "th-content";
        const input = document.createElement("input");
        input.dataset.role = "column-name";
        input.value = col;
        input.readOnly = readOnly;
        input.onchange = () => renameColumn(block, col, input.value);
        thContent.append(input);
        if (!readOnly) {
          thInner.append(createDragHandle("h"));
        }
        thInner.append(thContent);
        th.append(thInner);
        if (!readOnly) {
          th.append(smallButton(CLOSE_SVG, "Delete column", () => deleteColumn(block, col), "danger ghost compact table-delete-button"));
        }
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      block.rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        const diffRow = findDiffRow(diffBlock, tableRowKey(row, index));
        applyDiffClass(tr, diffRow?.status, "diff-row");
        tr.draggable = !readOnly;
        if (!readOnly) {
          attachDragSort(tr, block.rows, row);
        }
        const actionTd = document.createElement("td");
        actionTd.className = "row-actions-cell";
        const rowActionsInner = document.createElement("div");
        rowActionsInner.className = "row-actions-inner";
        if (!readOnly) {
          rowActionsInner.append(createDragHandle());
          actionTd.append(
            rowActionsInner,
            smallButton(CLOSE_SVG, "Delete row", () => deleteRow(block, index), "danger ghost compact table-delete-button")
          );
        }
        tr.append(actionTd);
        cols.forEach(col => {
          const td = document.createElement("td");
          const diffCell = findDiffCell(diffRow, col);
          applyDiffClass(td, diffCell?.status, "diff-cell");
          setDiffStatus(td, diffCell?.status);
          const input = document.createElement("input");
          input.dataset.column = col;
          input.value = row[col] ?? "";
          input.readOnly = readOnly;
          if (diffCell?.status && diffCell.status !== "unchanged") {
            input.title = "before: " + valueText(diffCell.before);
          }
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

    function renderRawRowsTable(block, diffBlock) {
      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      const table = document.createElement("table");
      table.className = "rawrows-table";
      const maxCols = block.rows.reduce(function(m, r) { return Math.max(m, r.length); }, 0);
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const thIdx = document.createElement("th");
      thIdx.className = "row-actions-cell table-header-cell";
      headRow.append(thIdx);
      for (let i = 0; i < maxCols; i++) {
        const th = document.createElement("th");
        th.className = "table-header-cell";
        th.draggable = !readOnly;
        if (!readOnly) {
          attachIndexDragSort(th, () => rawWidth(block), i, (from, to) => moveRawColumnTo(block, from, to));
        }
        const thInner = document.createElement("div");
        thInner.className = "th-inner";
        if (!readOnly) {
          thInner.append(createDragHandle("h"));
        }
        th.append(thInner);
        if (!readOnly) {
          th.append(smallButton(CLOSE_SVG, "Delete raw column", () => deleteRawColumn(block, i), "danger ghost compact table-delete-button"));
        }
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);
      const tbody = document.createElement("tbody");
      const sectionState = { name: "", continuationCount: 0 };
      block.rows.forEach(function(row, ri) {
        const tr = document.createElement("tr");
        const rowView = rawRowView(row, sectionState);
        tr.className = rowView.className;
        const diffRow = findDiffRow(diffBlock, String(ri));
        applyDiffClass(tr, diffRow?.status, "diff-row");
        tr.draggable = !readOnly;
        if (!readOnly) {
          attachDragSort(tr, block.rows, row);
        }
        const tdIdx = document.createElement("td");
        tdIdx.className = "row-actions-cell";
        const rawActionsInner = document.createElement("div");
        rawActionsInner.className = "row-actions-inner";
        if (!readOnly) {
          rawActionsInner.append(createDragHandle());
          tdIdx.append(
            rawActionsInner,
            smallButton(CLOSE_SVG, "Delete raw row", () => deleteRow(block, ri), "danger ghost compact table-delete-button")
          );
        }
        tr.append(tdIdx);
        for (let ci = 0; ci < row.length; ci++) {
          const td = document.createElement("td");
          const diffCell = findDiffCell(diffRow, String(ci));
          applyDiffClass(td, diffCell?.status, "diff-cell");
          setDiffStatus(td, diffCell?.status);
          if (ci === 0) {
            td.className = "raw-key-cell";
            applyDiffClass(td, diffCell?.status, "diff-cell");
            setDiffStatus(td, diffCell?.status);
            if (rowView.lockFirstCell) {
              tr.append(td);
              continue;
            }
          }
          if (rowView.headerLike) {
            td.classList.add("table-header-cell");
          }
          const input = document.createElement("input");
          input.dataset.rawRow = String(ri);
          input.dataset.rawColumn = String(ci);
          input.value = row[ci] ?? "";
          input.readOnly = readOnly;
          if (diffCell?.status && diffCell.status !== "unchanged") {
            input.title = "before: " + valueText(diffCell.before);
          }
          (function(r, idx) {
            input.oninput = function() {
              r[idx] = input.value;
            };
          })(row, ci);
          td.append(input);
          tr.append(td);
        }
        if (row.length < maxCols) {
          const filler = document.createElement("td");
          filler.className = "raw-filler-cell";
          filler.colSpan = maxCols - row.length;
          tr.append(filler);
        }
        tbody.append(tr);
      });
      table.append(tbody);
      scroll.append(table);
      return scroll;
    }

    function renderDeleteBlockButton(sheet, block) {
      const btn = smallButton(CLOSE_SVG, "Delete block", () => {
        sheet.blocks.splice(sheet.blocks.indexOf(block), 1);
        render();
      }, "danger ghost compact table-delete-button");
      btn.dataset.action = "delete-block";
      return btn;
    }

    const CLOSE_SVG = '<svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

    function smallButton(text, title, onclick, className) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className || "secondary compact";
      button.title = title;
      if (text.startsWith("<")) {
        button.innerHTML = text;
      } else {
        button.textContent = text;
      }
      button.onclick = onclick;
      return button;
    }

    function createDragHandle(direction) {
      const handle = document.createElement("span");
      handle.className = "drag-handle" + (direction === "h" ? " drag-handle--h" : "");
      handle.setAttribute("aria-hidden", "true");
      handle.textContent = "⣿";
      return handle;
    }

    function renameSheet(sheet, to) {
      const next = String(to || "").trim();
      if (next === sheet.name) {
        render();
        return;
      }
      sheet.name = uniqueName(next, state.sheets.filter(item => item !== sheet).map(item => item.name));
      activeSheetId = sheet._id;
      render();
    }

    function renameBlock(sheet, block, to) {
      const next = String(to || "").trim();
      if (next === block.name) {
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

    function deleteColumn(block, name) {
      for (const row of block.rows) {
        delete row[name];
      }
      if (Array.isArray(block.columnOrder)) {
        block.columnOrder = block.columnOrder.filter(col => col !== name);
      }
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

    function moveRawColumnTo(block, from, to) {
      const width = rawWidth(block);
      if (from < 0 || to < 0 || from >= width || to >= width || from === to) {
        return;
      }
      for (const row of block.rows) {
        const value = row[from] ?? "";
        row.splice(from, 1);
        row.splice(to, 0, value);
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

    function ensureIds(modelState) {
      for (const sheet of modelState.sheets) {
        withId(sheet);
        for (const block of sheet.blocks) {
          withId(block);
        }
      }
    }

    function withId(item) {
      if (!item._id) {
        item._id = "ntf-" + nextId++;
      }
      return item;
    }

    function activeSheet() {
      return state.sheets.find(item => item._id === activeSheetId)
        ?? state.sheets[0]
        ?? null;
    }

    function findDiffBlock(sheetName, blockName) {
      const file = diffReport?.files?.[0];
      const sheet = findDiffSheet(sheetName);
      return sheet?.blocks?.find(item => item.name === blockName) || null;
    }

    function findDiffSheet(sheetName) {
      const file = diffReport?.files?.[0];
      return file?.sheets?.find(item => item.name === sheetName) || null;
    }

    function findDiffRow(block, key) {
      if (!block?.rows) return null;
      if (diffSide === "base") {
        return block.rows.find(item => item.key === key) || null;
      }
      return block.rows.find(item => item.headIndex !== null && item.headIndex !== undefined && String(item.headIndex) === key) || null;
    }

    function findDiffCell(row, column) {
      return row?.cells?.find(item => item.column === column) || null;
    }

    function tableRowKey(row, index) {
      return String(index);
    }

    function applyDiffClass(element, status, prefix) {
      if (status && status !== "unchanged") {
        element.classList.add(prefix + "-" + status);
      }
    }

    function setDiffStatus(element, status) {
      if (status && status !== "unchanged") {
        element.dataset.diffStatus = status;
      }
    }

    function valueText(value) {
      return value === null ? "~" : String(value ?? "");
    }

    function renderDiffLegend() {
      const legend = document.createElement("div");
      legend.className = "diff-legend";
      for (const [status, label] of [["added", "追加"], ["changed", "変更"], ["deleted", "削除"]]) {
        const item = document.createElement("span");
        item.className = "diff-legend-item";
        const swatch = document.createElement("span");
        swatch.className = "diff-legend-swatch diff-legend-" + status;
        const text = document.createElement("span");
        text.textContent = label;
        item.append(swatch, text);
        legend.append(item);
      }
      return legend;
    }

    function attachDragSort(element, items, item, afterMove) {
      element.addEventListener("dragstart", event => {
        event.stopPropagation();
        element.classList.add("dragging");
        event.dataTransfer?.setData("text/plain", String(items.indexOf(item)));
      });
      element.addEventListener("dragend", () => {
        element.classList.remove("dragging");
      });
      element.addEventListener("dragover", event => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.add("drop-target");
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("drop-target");
      });
      element.addEventListener("drop", event => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.remove("drop-target");
        const from = Number(event.dataTransfer?.getData("text/plain"));
        const to = items.indexOf(item);
        moveItem(items, from, to);
        if (afterMove) afterMove();
        render();
      });
    }

    function attachIndexDragSort(element, getLength, index, move) {
      element.addEventListener("dragstart", event => {
        event.stopPropagation();
        element.classList.add("dragging");
        event.dataTransfer?.setData("text/plain", String(index));
      });
      element.addEventListener("dragend", () => {
        element.classList.remove("dragging");
      });
      element.addEventListener("dragover", event => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.add("drop-target");
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("drop-target");
      });
      element.addEventListener("drop", event => {
        event.preventDefault();
        event.stopPropagation();
        element.classList.remove("drop-target");
        const from = Number(event.dataTransfer?.getData("text/plain"));
        if (from >= 0 && from < getLength()) {
          move(from, index);
        }
      });
    }

    function moveItem(items, from, to) {
      if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
        return;
      }
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
    }

    function rawRowView(row, sectionState) {
      const first = String(row[0] ?? "");
      if (isNtfFileDirective(first)) {
        sectionState.name = "";
        sectionState.continuationCount = 0;
        return { className: "raw-metadata-row" };
      }
      if (/^(header|data|end)$/.test(first)) {
        sectionState.name = first;
        sectionState.continuationCount = 0;
        return { className: "raw-section-header-row", headerLike: true };
      }
      if (!first && sectionState.name) {
        sectionState.continuationCount++;
        return {
          className: sectionState.continuationCount === 1 ? "raw-type-row" : "raw-value-row",
          headerLike: sectionState.continuationCount === 1,
          lockFirstCell: true
        };
      }
      sectionState.name = "";
      sectionState.continuationCount = 0;
      return { className: "" };
    }

    const ntfFileDirectives = new Set([
      "text-encoding",
      "record-separator",
      "field-separator",
      "quoting-delimiter",
      "positive-zone-sign-nibble",
      "negative-zone-sign-nibble",
      "positive-pack-sign-nibble",
      "negative-pack-sign-nibble",
      "required-decimal-point",
      "fixed-sign-position",
      "required-plus-sign"
    ]);

    function isNtfFileDirective(name) {
      return ntfFileDirectives.has(String(name ?? ""));
    }

    render();
    return {
      render,
      getState: () => state,
      getActiveSheet: () => activeSheet()?.name ?? "",
      dispose() {
        if (options.window) {
          options.window.removeEventListener("message", handleMessage);
        }
      }
    };
  }

  return { createNtfYamlEditorApp };
});
