(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./ntfYamlEditorHelpers"),
      require("./ntfYamlEditorDiffHelpers")
    );
  } else {
    root.NtfYamlEditorWebview = factory(
      root.NtfYamlEditorHelpers,
      root.NtfYamlEditorDiffHelpers
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(helper, diffHelper) {
  function createNtfYamlEditorApp(options) {
    const root = options.root;
    const model = options.model;
    const vscode = options.vscode;
    const document = root.ownerDocument;
    const viewWindow = options.window || document.defaultView;
    let state = model.parseYaml(options.initialText || "");
    let diffReport = options.initialDiffReport || null;
    const readOnly = Boolean(options.readOnly);
    const diffSide = options.diffSide != null ? options.diffSide : (readOnly ? "base" : "head");
    let nextId = 1;
    let activeSheetId = "";
    let activeUnifiedSheetName = "";
    ensureIds(state);
    activeSheetId = state.sheets[0]?._id ?? "";
    if (options.sidebarWidth) {
      setSidebarWidth(options.sidebarWidth);
    }

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
      } else if (event.data.type === "setSidebarWidth") {
        setSidebarWidth(event.data.width);
      }
    }

    if (options.window) {
      options.window.addEventListener("message", handleMessage);
    }

    function render() {
      if (diffSide === "unified" && diffReport) {
        renderUnifiedView();
        return;
      }
      const sheet = activeSheet();
      root.innerHTML = "";

      const app = document.createElement("div");
      app.className = "app";
      if (readOnly && diffReport) {
        app.classList.add("diff-app");
      }
      const aside = document.createElement("aside");
      const main = document.createElement("main");
      app.append(aside, main);
      attachSidebarResize(aside);

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
          }, "danger ghost compact sheet-delete-button");
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

    function attachSidebarResize(aside) {
      const resizer = document.createElement("div");
      resizer.className = "sidebar-resizer";
      resizer.setAttribute("role", "separator");
      resizer.setAttribute("aria-orientation", "vertical");
      resizer.title = "Resize sheet list";
      let startX = 0;
      let startWidth = 0;

      function onPointerMove(event) {
        const nextWidth = clampSidebarWidth(startWidth + event.clientX - startX);
        setSidebarWidth(nextWidth);
        vscode.postMessage({ type: "sidebarResize", width: nextWidth });
      }

      function onPointerUp() {
        document.body.classList.remove("resizing-sidebar");
        viewWindow.removeEventListener("pointermove", onPointerMove);
        viewWindow.removeEventListener("pointerup", onPointerUp);
      }

      resizer.addEventListener("pointerdown", event => {
        event.preventDefault();
        startX = event.clientX;
        startWidth = aside.getBoundingClientRect().width || getSidebarWidth();
        document.body.classList.add("resizing-sidebar");
        viewWindow.addEventListener("pointermove", onPointerMove);
        viewWindow.addEventListener("pointerup", onPointerUp);
      });

      aside.append(resizer);
    }

    function getSidebarWidth() {
      const value = viewWindow.getComputedStyle(document.documentElement).getPropertyValue("--ntf-sidebar-width");
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 240;
    }

    function clampSidebarWidth(value) {
      return Math.max(140, Math.min(420, Math.round(value)));
    }

    function setSidebarWidth(value) {
      const width = clampSidebarWidth(Number(value));
      document.documentElement.style.setProperty("--ntf-sidebar-width", `${width}px`);
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
      for (const value of model.blockPrefixes || ["LIST_MAP", "SETUP_TABLE", "EXPECTED_TABLE", "SETUP_VARIABLE", "EXPECTED_VARIABLE"]) {
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
        const name = helper.uniqueName(kind.value + "=", sheet.blocks.map(block => block.name));
        sheet.blocks.push(withId({
          name,
          kind: model.inferKind(name),
          rows: model.isRawRowsBlock(name) ? [[""]] : model.isTableBlock(name) ? [{}] : [],
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
          const col = helper.uniqueName("col", model.columns(block));
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
          const width = helper.rawWidth(block);
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
      table.className = "ntf-table";
      table.className = "ntf-table";
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
            helper.moveItem(order, from, to);
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
          const colActionBar = document.createElement("div");
          colActionBar.className = "col-action-bar";
          colActionBar.append(createDragHandle("h"));
          colActionBar.append(smallButton(CLOSE_SVG, "Delete column", () => deleteColumn(block, col), "action-bar-delete"));
          th.append(colActionBar);
        }
        thInner.append(thContent);
        th.append(thInner);
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
        if (!readOnly) {
          const rowActionBar = document.createElement("div");
          rowActionBar.className = "row-action-bar";
          rowActionBar.append(createDragHandle());
          rowActionBar.append(smallButton(CLOSE_SVG, "Delete row", () => deleteRow(block, index), "action-bar-delete"));
          actionTd.append(rowActionBar);
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
      table.className = "ntf-table rawrows-table";
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
          attachIndexDragSort(th, () => helper.rawWidth(block), i, (from, to) => moveRawColumnTo(block, from, to));
        }
        const thInner = document.createElement("div");
        thInner.className = "th-inner";
        if (!readOnly) {
          const colActionBar = document.createElement("div");
          colActionBar.className = "col-action-bar";
          colActionBar.append(createDragHandle("h"));
          colActionBar.append(smallButton(CLOSE_SVG, "Delete raw column", () => deleteRawColumn(block, i), "action-bar-delete"));
          th.append(colActionBar);
        }
        th.append(thInner);
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);
      const tbody = document.createElement("tbody");
      const sectionState = { name: "", continuationCount: 0 };
      block.rows.forEach(function(row, ri) {
        const tr = document.createElement("tr");
        const rowView = helper.rawRowView(row, sectionState);
        tr.className = rowView.className;
        const diffRow = findDiffRow(diffBlock, String(ri));
        applyDiffClass(tr, diffRow?.status, "diff-row");
        tr.draggable = !readOnly;
        if (!readOnly) {
          attachDragSort(tr, block.rows, row);
        }
        const tdIdx = document.createElement("td");
        tdIdx.className = "row-actions-cell";
        if (!readOnly) {
          const rowActionBar = document.createElement("div");
          rowActionBar.className = "row-action-bar";
          rowActionBar.append(createDragHandle());
          rowActionBar.append(smallButton(CLOSE_SVG, "Delete raw row", () => deleteRow(block, ri), "action-bar-delete"));
          tdIdx.append(rowActionBar);
        }
        tr.append(tdIdx);
        for (let ci = 0; ci < row.length; ci++) {
          const td = document.createElement("td");
          const diffCell = findDiffCell(diffRow, String(ci));
          applyDiffClass(td, diffCell?.status, "diff-cell");
          setDiffStatus(td, diffCell?.status);
          if (ci === 0 && rowView.keyLike) {
            td.className = "raw-key-cell";
            applyDiffClass(td, diffCell?.status, "diff-cell");
            setDiffStatus(td, diffCell?.status);
          }
          if (ci === 0 && rowView.lockFirstCell) {
            tr.append(td);
            continue;
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
        for (let ci = row.length; ci < maxCols; ci++) {
          const filler = document.createElement("td");
          filler.className = "raw-filler-cell";
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
      }, "danger ghost compact block-delete-button");
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
      sheet.name = helper.uniqueName(next, state.sheets.filter(item => item !== sheet).map(item => item.name));
      activeSheetId = sheet._id;
      render();
    }

    function renameBlock(sheet, block, to) {
      const next = String(to || "").trim();
      if (next === block.name) {
        render();
        return;
      }
      block.name = helper.uniqueName(next, sheet.blocks.filter(item => item !== block).map(item => item.name));
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
        helper.replaceRowKey(row, from, next);
      }
      if (Array.isArray(block.columnOrder)) {
        block.columnOrder = block.columnOrder.map(name => name === from ? next : name);
      }
      render();
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

    function deleteRawColumn(block, index) {
      for (const row of block.rows) {
        row.splice(index, 1);
      }
      render();
    }

    function moveRawColumnTo(block, from, to) {
      const width = helper.rawWidth(block);
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
      return diffHelper.findDiffBlock(diffReport, sheetName, blockName);
    }

    function findDiffSheet(sheetName) {
      return diffHelper.findDiffSheet(diffReport, sheetName);
    }

    function findDiffRow(block, key) {
      return diffHelper.findDiffRow(block, key, diffSide);
    }

    function findDiffCell(row, column) {
      return diffHelper.findDiffCell(row, column);
    }

    function tableRowKey(row, index) {
      return diffHelper.tableRowKey(row, index);
    }

    function applyDiffClass(element, status, prefix) {
      diffHelper.applyDiffClass(element, status, prefix);
    }

    function setDiffStatus(element, status) {
      diffHelper.setDiffStatus(element, status);
    }

    function valueText(value) {
      return diffHelper.valueText(value);
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
        helper.moveItem(items, from, to);
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

    function renderUnifiedView() {
      const diffFile = diffReport?.files?.[0];
      root.innerHTML = "";

      const app = document.createElement("div");
      app.className = "app diff-app unified-view";
      const aside = document.createElement("aside");
      const main = document.createElement("main");
      app.append(aside, main);
      attachSidebarResize(aside);

      const title = document.createElement("h1");
      title.textContent = "NTF YAML";
      aside.append(title);

      const diffSheets = diffFile?.sheets || [];
      if (!activeUnifiedSheetName || !diffSheets.find(s => s.name === activeUnifiedSheetName)) {
        activeUnifiedSheetName = diffSheets[0]?.name ?? "";
      }

      for (const diffSheet of diffSheets) {
        const isActive = diffSheet.name === activeUnifiedSheetName;
        const itemWrapper = document.createElement("div");
        itemWrapper.className = "sheet-item";
        if (isActive) {
          const container = document.createElement("div");
          container.className = "sheet active";
          container.dataset.sheetName = diffSheet.name;
          applyDiffClass(container, diffSheet.status, "diff-sheet");
          const input = document.createElement("input");
          input.dataset.role = "sheet-name";
          input.value = diffSheet.name;
          input.readOnly = true;
          container.append(input);
          itemWrapper.append(container);
        } else {
          const btn = document.createElement("button");
          btn.className = "sheet";
          btn.dataset.sheetName = diffSheet.name;
          applyDiffClass(btn, diffSheet.status, "diff-sheet");
          btn.textContent = diffSheet.name || "(unnamed sheet)";
          btn.onclick = () => { activeUnifiedSheetName = diffSheet.name; renderUnifiedView(); };
          itemWrapper.append(btn);
        }
        aside.append(itemWrapper);
      }

      const activeDiffSheet = diffSheets.find(s => s.name === activeUnifiedSheetName);
      if (!activeDiffSheet) {
        const empty = document.createElement("p");
        empty.textContent = "No sheets found.";
        main.append(empty);
      } else {
        main.append(renderDiffLegend());
        const sheetHeader = document.createElement("div");
        sheetHeader.className = "sheet-header";
        applyDiffClass(sheetHeader, activeDiffSheet.status, "diff-sheet");
        const h2 = document.createElement("h2");
        h2.textContent = activeDiffSheet.name || "(unnamed sheet)";
        sheetHeader.append(h2);
        main.append(sheetHeader);
        for (const diffBlock of activeDiffSheet.blocks || []) {
          main.append(renderUnifiedBlock(diffBlock));
        }
      }

      root.append(app);
    }

    function renderUnifiedBlock(diffBlock) {
      const wrapper = document.createElement("section");
      wrapper.className = "block";
      wrapper.dataset.blockName = diffBlock.name;
      applyDiffClass(wrapper, diffBlock.status, "diff-block");

      const header = document.createElement("div");
      header.className = "block-header";
      const nameInput = document.createElement("input");
      nameInput.className = "block-name";
      nameInput.dataset.role = "block-name";
      nameInput.value = diffBlock.name;
      nameInput.readOnly = true;
      header.append(nameInput);
      wrapper.append(header);

      const cols = (diffBlock.columns || []).map(c => c.key);
      const colLabels = Object.fromEntries((diffBlock.columns || []).map(c => [c.key, c.label]));
      const isRawRows = diffBlock.kind === "RawRows" || model.isRawRowsBlock(diffBlock.name);

      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      const table = document.createElement("table");
      table.className = isRawRows ? "ntf-table rawrows-table" : "ntf-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const actionHead = document.createElement("th");
      actionHead.className = "row-actions-cell table-header-cell";
      headRow.append(actionHead);
      for (const col of cols) {
        const th = document.createElement("th");
        th.className = "table-header-cell";
        const thInner = document.createElement("div");
        thInner.className = "th-inner";
        const thContent = document.createElement("div");
        thContent.className = "th-content";
        const thInput = document.createElement("input");
        thInput.dataset.role = "column-name";
        thInput.value = colLabels[col] || col;
        thInput.readOnly = true;
        thContent.append(thInput);
        thInner.append(thContent);
        th.append(thInner);
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      for (const diffRow of unifiedRowsForBlock(diffBlock, cols)) {
        const tr = document.createElement("tr");
        applyDiffClass(tr, diffRow.status, "diff-row");
        const actionTd = document.createElement("td");
        actionTd.className = "row-actions-cell";
        tr.append(actionTd);
        for (const col of cols) {
          const diffCell = diffRow.cells?.find(c => c.column === col) || null;
          const td = document.createElement("td");
          applyDiffClass(td, diffCell?.status, "diff-cell");
          setDiffStatus(td, diffCell?.status);
          if (diffCell?.status === "changed") {
            const wrapper = document.createElement("div");
            wrapper.className = "cell-unified-diff";
            const before = document.createElement("del");
            before.className = "cell-before";
            before.textContent = valueText(diffCell.before);
            const afterRow = document.createElement("div");
            afterRow.className = "cell-after-row";
            const sep = document.createElement("span");
            sep.className = "cell-sep";
            sep.textContent = "→";
            const after = document.createElement("span");
            after.className = "cell-after";
            after.textContent = valueText(diffCell.after ?? diffCell.before);
            afterRow.append(sep, after);
            wrapper.append(before, afterRow);
            td.append(wrapper);
          } else {
            const input = document.createElement("input");
            if (isRawRows) {
              input.dataset.rawColumn = col;
            } else {
              input.dataset.column = col;
            }
            const isDeleted = diffRow.status === "deleted";
            input.value = valueText(isDeleted ? diffCell?.before : (diffCell?.after ?? diffCell?.before));
            input.readOnly = true;
            td.append(input);
          }
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
      scroll.append(table);
      wrapper.append(scroll);
      return wrapper;
    }

    function unifiedRowsForBlock(diffBlock, cols) {
      const headBlock = state.sheets
        .find(sheet => sheet.name === activeUnifiedSheetName)
        ?.blocks
        ?.find(block => block.name === diffBlock.name);
      return diffHelper.unifiedRowsForBlock(diffBlock, headBlock?.rows, cols);
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
