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
  // ── Block type helpers (no longer need external model object) ──────────────
  const tableBlockPrefixes = ["SETUP_TABLE", "EXPECTED_TABLE", "EXPECTED_COMPLETE_TABLE", "LIST_MAP"];
  const rawRowsBlockPrefixes = ["SETUP_VARIABLE", "EXPECTED_VARIABLE", "SETUP_FIXED", "EXPECTED_FIXED"];
  const rawBlockPrefixes = [];
  const blockPrefixList = tableBlockPrefixes.concat(rawRowsBlockPrefixes, rawBlockPrefixes);

  function blockNameStartsWith(name, prefixes) {
    return prefixes.some(function(prefix) {
      return new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\[\\d+\\])?=").test(String(name || ""));
    });
  }
  function inferKind(name) {
    if (blockNameStartsWith(name, rawRowsBlockPrefixes)) return "RawRows";
    return "ListMap";
  }
  function isTableBlock(name) { return !isRawRowsBlock(name); }
  function isRawRowsBlock(name) { return blockNameStartsWith(name, rawRowsBlockPrefixes); }
  function isFixedRowsBlock(name) { return blockNameStartsWith(name, ["SETUP_FIXED", "EXPECTED_FIXED"]); }
  function columns(block) {
    var names = [];
    for (var n of (block.columnOrder || [])) { if (!names.includes(n)) names.push(n); }
    for (var row of (block.rows || [])) { for (var k of Object.keys(row)) { if (!names.includes(k)) names.push(k); } }
    return names;
  }

  function createNtfYamlEditorApp(options) {
    const root = options.root;
    const vscode = options.vscode;
    const document = root.ownerDocument;
    const viewWindow = options.window || document.defaultView;
    let state = options.initialModel || { sheets: [] };
    let diffReport = options.initialDiffReport || null;
    const readOnly = Boolean(options.readOnly);
    const diffSide = options.diffSide != null ? options.diffSide : (readOnly ? "base" : "head");
    let nextId = 1;
    let activeSheetId = "";
    let activeUnifiedSheetName = "";
    let sidebarScrollTop = 0;
    const mainScrollTopByKey = new Map();
    const DND_MIME = "application/x-ntf-yaml-editor-dnd";
    let currentDragPayload = null;
    ensureIds(state);
    activeSheetId = state.sheets[0]?._id ?? "";
    if (options.sidebarWidth) {
      setSidebarWidth(options.sidebarWidth);
    }

    function handleMessage(event) {
      if (event.data.type === "update") {
        captureScrollPositions();
        const activeName = activeSheet()?.name;
        state = event.data.model || { sheets: [] };
        diffReport = event.data.diffReport || null;
        ensureIds(state);
        activeSheetId = state.sheets.find(sheet => sheet.name === activeName)?._id
          ?? state.sheets[0]?._id
          ?? "";
        render({ skipScrollCapture: true });
      } else if (event.data.type === "setSidebarWidth") {
        setSidebarWidth(event.data.width);
      }
    }

    if (options.window) {
      options.window.addEventListener("message", handleMessage);
    }

    function render(options) {
      if (diffSide === "unified" && diffReport) {
        renderUnifiedView(options);
        return;
      }
      if (!options?.skipScrollCapture) {
        captureScrollPositions();
      }
      const sheet = activeSheet();
      root.innerHTML = "";

      const app = document.createElement("div");
      app.className = "app";
      if (readOnly && diffReport) {
        app.classList.add("diff-app");
      }
      const aside = document.createElement("aside");
      const sidebarContent = document.createElement("div");
      sidebarContent.className = "sidebar-content";
      aside.append(sidebarContent);
      const main = document.createElement("main");
      app.append(aside, main);
      attachSidebarResize(aside);

      const title = document.createElement("h1");
      title.textContent = "NTF YAML Editor";
      sidebarContent.append(title);
      if (!readOnly) {
        sidebarContent.append(renderSaveControl());
        sidebarContent.append(renderAddSheetForm());
      }
      for (const item of state.sheets) {
        const itemWrapper = document.createElement("div");
        itemWrapper.className = "sheet-item";
        let sheetDragHandle = null;
        if (!readOnly) {
          sheetDragHandle = createDragHandle();
          sheetDragHandle.classList.add("sheet-drag-handle");
          itemWrapper.append(sheetDragHandle);
        }
        const sheetControl = item._id === activeSheetId
          ? renderActiveSheetNameInput(item)
          : renderSheetSelector(item);
        itemWrapper.append(sheetControl);
        if (!readOnly) {
          attachDragSort(itemWrapper, state.sheets, item, () => { activeSheetId = item._id; }, {
            dragSource: sheetDragHandle,
            type: "sheet",
            scope: "model"
          });
        }
        if (!readOnly) {
          const deleteBtn = smallButton(CLOSE_SVG, "Delete sheet", () => {
            const index = state.sheets.indexOf(item);
            state.sheets.splice(index, 1);
            activeSheetId = state.sheets[Math.max(0, index - 1)]?._id ?? "";
            render();
          }, "sheet-delete-button");
          deleteBtn.dataset.action = "delete-sheet";
          itemWrapper.append(deleteBtn);
        }
        sidebarContent.append(itemWrapper);
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
      restoreScrollPositions(sidebarContent, main);
    }

    function captureScrollPositions() {
      const app = root.querySelector(".app");
      if (!app) return;
      const sidebarContent = app.querySelector(".sidebar-content");
      const main = app.querySelector("main");
      if (sidebarContent) {
        sidebarScrollTop = sidebarContent.scrollTop;
      }
      const key = mainScrollKey();
      if (main && key) {
        mainScrollTopByKey.set(key, main.scrollTop);
      }
    }

    function restoreScrollPositions(sidebarContent, main) {
      sidebarContent.scrollTop = sidebarScrollTop;
      const key = mainScrollKey();
      if (key && mainScrollTopByKey.has(key)) {
        main.scrollTop = mainScrollTopByKey.get(key);
      }
    }

    function mainScrollKey() {
      if (diffSide === "unified") {
        return "unified:" + activeUnifiedSheetName;
      }
      const sheet = activeSheet();
      return sheet ? "normal:" + sheet.name : "";
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
      save.textContent = "保存";
      save.onclick = () => vscode.postMessage({ type: "save", model: state });
      toolbar.append(save);
      return toolbar;
    }

    function renderAddSheetForm() {
      const form = document.createElement("div");
      form.className = "side-form";
      const button = document.createElement("button");
      button.className = "secondary";
      button.dataset.action = "add-sheet";
      button.textContent = "シート追加";
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
      const div = document.createElement("div");
      div.className = "sheet";
      div.dataset.sheetName = sheet.name;
      div.setAttribute("role", "button");
      div.tabIndex = 0;
      applyDiffClass(div, findDiffSheet(sheet.name)?.status, "diff-sheet");
      div.append(document.createTextNode(sheet.name || "(unnamed sheet)"));
      div.onclick = () => {
        captureScrollPositions();
        activeSheetId = sheet._id;
        render({ skipScrollCapture: true });
      };
      div.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); div.click(); }
      };
      return div;
    }

    function renderActiveSheetNameInput(sheet) {
      const container = document.createElement("div");
      container.className = "sheet active";
      container.dataset.sheetName = sheet.name;
      applyDiffClass(container, findDiffSheet(sheet.name)?.status, "diff-sheet");
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
      for (const value of blockPrefixList) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        kind.append(option);
      }
      const button = document.createElement("button");
      button.className = "secondary";
      button.dataset.action = "add-block";
      button.textContent = "ブロック追加";
      const add = () => {
        const name = helper.uniqueName(kind.value + "=", sheet.blocks.map(block => block.name));
        sheet.blocks.push(withId({
          name,
          kind: inferKind(name),
          rows: isRawRowsBlock(name) ? [[""]] : isTableBlock(name) ? [{}] : [],
          columnOrder: isTableBlock(name) ? ["no"] : [],
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
      const diffBlock = findDiffBlock(sheet.name, block.name);
      applyDiffClass(wrapper, diffBlock?.status, "diff-block");
      const header = document.createElement("div");
      header.className = "block-header";
      let blockDragHandle = null;
      if (!readOnly) {
        blockDragHandle = createDragHandle();
        blockDragHandle.classList.add("block-drag-handle");
        header.append(blockDragHandle);
      }
      const name = document.createElement("input");
      name.className = "block-name";
      name.dataset.role = "block-name";
      name.value = block.name;
      name.readOnly = readOnly;
      name.onchange = () => renameBlock(sheet, block, name.value);
      header.append(name);
      if (!readOnly) {
        attachDragSort(wrapper, sheet.blocks, block, null, {
          dragSource: blockDragHandle,
          type: "block",
          scope: sheet._id
        });
      }

      if (!readOnly && isTableBlock(block.name)) {
        const actions = document.createElement("div");
        actions.className = "block-actions";
        const addRow = document.createElement("button");
        addRow.className = "secondary";
        addRow.dataset.action = "add-row";
        addRow.textContent = "行追加";
        addRow.onclick = () => {
          const row = {};
          for (const col of columns(block)) {
            row[col] = "";
          }
          block.rows.push(row);
          render();
        };
        const addColumn = document.createElement("button");
        addColumn.className = "secondary";
        addColumn.dataset.action = "add-column";
        addColumn.textContent = "列追加";
        addColumn.onclick = () => {
          const col = helper.uniqueName("col", columns(block));
          for (const row of block.rows) { row[col] = ""; }
          if (block.rows.length === 0) { block.rows.push({ [col]: "" }); }
          helper.addColumnName(block, col);
          render();
        };
        actions.append(addRow, addColumn);
        header.append(actions);
        header.append(renderDeleteBlockButton(sheet, block));
      } else if (!readOnly && isRawRowsBlock(block.name)) {
        const actions = document.createElement("div");
        actions.className = "block-actions";
        const addRow = document.createElement("button");
        addRow.className = "secondary";
        addRow.dataset.action = "add-row";
        addRow.textContent = "行追加";
        addRow.onclick = () => {
          const width = helper.rawWidth(block);
          block.rows.push(Array.from({ length: Math.max(width, 1) }, () => ""));
          render();
        };
        const addColumn = document.createElement("button");
        addColumn.className = "secondary";
        addColumn.dataset.action = "add-column";
        addColumn.textContent = "列追加";
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

      if (!isTableBlock(block.name)) {
        if (isRawRowsBlock(block.name)) {
          wrapper.append(renderRawRowsTable(block, diffBlock));
          return wrapper;
        }
        const raw = document.createElement("pre");
        raw.textContent = block.raw || "Unsupported block in this PoC.";
        wrapper.append(raw);
        return wrapper;
      }

      const scroll = document.createElement("div");
      scroll.className = readOnly ? "table-scroll" : "table-scroll table-scroll--with-row-actions";
      const viewport = document.createElement("div");
      viewport.className = "table-viewport";
      const table = document.createElement("table");
      table.className = "ntf-table";
      const cols = columns(block);
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const col of cols) {
        const colIndex = cols.indexOf(col);
        const th = document.createElement("th");
        th.className = "table-header-cell";
        th.dataset.colIndex = String(colIndex);
        const thContent = document.createElement("div");
        thContent.className = "th-content";
        const input = document.createElement("input");
        input.dataset.role = "column-name";
        input.value = col;
        input.readOnly = readOnly;
        input.onchange = () => {
          helper.renameColumn(block, col, input.value);
          render();
        };
        thContent.append(input);
        if (!readOnly) {
          const colActionBar = document.createElement("div");
          colActionBar.className = "col-action-bar";
          const colDragHandle = createDragHandle("h");
          colActionBar.append(colDragHandle);
          colActionBar.append(smallButton(CLOSE_SVG, "Delete column", () => {
            helper.deleteColumn(block, col);
            render();
          }, "action-bar-delete"));
          th.append(colActionBar);
          attachIndexDragSort(th, () => columns(block).length, colIndex, (from, to) => {
            const order = columns(block);
            helper.moveItem(order, from, to);
            block.columnOrder = order;
            render();
          }, {
            dragSource: colDragHandle,
            type: "column",
            scope: block._id
          });
        }
        th.append(thContent);
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      block.rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        const diffRow = findDiffRow(diffBlock, tableRowKey(row, index));
        applyDiffClass(tr, diffRow?.status, "diff-row");
        let rowDragHandle = null;
        cols.forEach(col => {
          const td = document.createElement("td");
          const diffCell = findDiffCell(diffRow, col);
          applyDiffClass(td, diffCell?.status, "diff-cell");
          setDiffStatus(td, diffCell?.status);
          const input = document.createElement("input");
          input.dataset.column = col;
          input.value = row[col] ?? "";
          input.readOnly = readOnly;
          input.oninput = () => {
            row[col] = input.value;
          };
          if (!readOnly && col === cols[0]) {
            rowDragHandle = appendRowActionBar(td, "Delete row", () => deleteRow(block, index));
          }
          td.append(input);
          tr.append(td);
        });
        if (!readOnly) {
          attachDragSort(tr, block.rows, row, null, {
            dragSource: rowDragHandle,
            type: "row",
            scope: block._id
          });
        }
        tbody.append(tr);
      });
      table.append(tbody);
      attachTableInteraction(table, headRow, input =>
        Array.from(input.closest("tr").children).indexOf(input.closest("td"))
      );
      viewport.append(table);
      scroll.append(viewport);
      wrapper.append(scroll);
      return wrapper;
    }

    function renderRawRowsTable(block, diffBlock) {
      const scroll = document.createElement("div");
      scroll.className = readOnly ? "table-scroll" : "table-scroll table-scroll--with-row-actions";
      const viewport = document.createElement("div");
      viewport.className = "table-viewport";
      const table = document.createElement("table");
      table.className = "ntf-table rawrows-table";
      const maxCols = block.rows.reduce(function(m, r) { return Math.max(m, r.length); }, 0);
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (let i = 0; i < maxCols; i++) {
        const th = document.createElement("th");
        th.className = "table-header-cell";
        th.dataset.colIndex = String(i);
        if (!readOnly) {
          const colActionBar = document.createElement("div");
          colActionBar.className = "col-action-bar";
          const colDragHandle = createDragHandle("h");
          colActionBar.append(colDragHandle);
          colActionBar.append(smallButton(CLOSE_SVG, "Delete raw column", () => {
            helper.deleteRawColumn(block, i);
            render();
          }, "action-bar-delete"));
          th.append(colActionBar);
          attachIndexDragSort(th, () => helper.rawWidth(block), i, (from, to) => {
            helper.moveRawColumnTo(block, from, to);
            render();
          }, {
            dragSource: colDragHandle,
            type: "column",
            scope: block._id
          });
        }
        headRow.append(th);
      }
      thead.append(headRow);
      table.append(thead);
      const tbody = document.createElement("tbody");
      const sectionState = { name: "", continuationCount: 0 };
      block.rows.forEach(function(row, ri) {
        const tr = document.createElement("tr");
        const rowView = helper.rawRowView(row, sectionState, { fixedLength: isFixedRowsBlock(block.name) });
        tr.className = rowView.className;
        const diffRow = findDiffRow(diffBlock, String(ri));
        applyDiffClass(tr, diffRow?.status, "diff-row");
        let rowDragHandle = null;
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
          if (ci === 0 && rowView.auxiliaryFirstCell) {
            td.classList.add("raw-filler-cell");
          }
          if (!readOnly && ci === 0) {
            rowDragHandle = appendRowActionBar(td, "Delete raw row", () => deleteRow(block, ri));
          }
          if (ci === 0 && rowView.lockFirstCell) {
            tr.append(td);
            continue;
          }
          if (rowView.headerLike && !(ci === 0 && rowView.auxiliaryFirstCell)) {
            td.classList.add("table-header-cell");
          }
          const input = document.createElement("input");
          input.dataset.rawRow = String(ri);
          input.dataset.rawColumn = String(ci);
          input.value = row[ci] ?? "";
          input.readOnly = readOnly;
          (function(r, idx) {
            input.oninput = function() {
              r[idx] = input.value;
            };
          })(row, ci);
          td.append(input);
          tr.append(td);
        }
        if (!readOnly) {
          attachDragSort(tr, block.rows, row, null, {
            dragSource: rowDragHandle,
            type: "row",
            scope: block._id
          });
        }
        for (let ci = row.length; ci < maxCols; ci++) {
          const filler = document.createElement("td");
          filler.className = "raw-filler-cell";
          tr.append(filler);
        }
        tbody.append(tr);
      });
      table.append(tbody);
      attachTableInteraction(table, headRow, input => parseInt(input.dataset.rawColumn ?? "0"));
      viewport.append(table);
      scroll.append(viewport);
      return scroll;
    }

    function renderDeleteBlockButton(sheet, block) {
      const btn = smallButton(CLOSE_SVG, "Delete block", () => {
        sheet.blocks.splice(sheet.blocks.indexOf(block), 1);
        render();
      }, "block-delete-button");
      btn.dataset.action = "delete-block";
      return btn;
    }

    const CLOSE_SVG = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const DRAG_HANDLE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="4" r="1.2" fill="currentColor"></circle><circle cx="11" cy="4" r="1.2" fill="currentColor"></circle><circle cx="5" cy="8" r="1.2" fill="currentColor"></circle><circle cx="11" cy="8" r="1.2" fill="currentColor"></circle><circle cx="5" cy="12" r="1.2" fill="currentColor"></circle><circle cx="11" cy="12" r="1.2" fill="currentColor"></circle></svg>';

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
      handle.innerHTML = DRAG_HANDLE_SVG;
      return handle;
    }

    function appendRowActionBar(cell, deleteTitle, onDelete) {
      const rowActionBar = document.createElement("div");
      rowActionBar.className = "row-action-bar";
      const dragHandle = createDragHandle();
      rowActionBar.append(dragHandle);
      rowActionBar.append(smallButton(CLOSE_SVG, deleteTitle, onDelete, "action-bar-delete"));
      cell.append(rowActionBar);
      return dragHandle;
    }

    function attachTableInteraction(table, headRow, getColIndex) {
      let blurTimer = null;
      const headers = Array.from(headRow.querySelectorAll("th"));
      const clearActiveColumn = () => {
        headers.forEach(th => th.classList.remove("col-active"));
      };
      const clearFocusedGuides = () => {
        table.querySelectorAll("tr.row-focused").forEach(r => r.classList.remove("row-focused"));
        table.querySelectorAll("th.col-focused").forEach(h => h.classList.remove("col-focused"));
      };
      const clearFocusedCell = () => {
        table.classList.remove("has-focused-cell");
        delete table.dataset.focusLocked;
        clearFocusedGuides();
      };
      const hasFocusedCell = () =>
        table.classList.contains("has-focused-cell")
        || table.dataset.focusLocked === "true"
        || table.contains(document.activeElement) && document.activeElement?.matches?.("tbody td input");
      const activateColumn = header => {
        clearActiveColumn();
        if (header) {
          header.classList.add("col-active");
        }
      };
      const activateColumnByIndex = index => {
        activateColumn(headers[index] || null);
      };

      headers.forEach(header => {
        header.addEventListener("mouseenter", () => {
          if (hasFocusedCell()) return;
          activateColumn(header);
        });
        header.addEventListener("pointerdown", () => {
          clearTimeout(blurTimer);
          clearFocusedCell();
          activateColumn(header);
        });
        header.addEventListener("focusin", () => {
          clearTimeout(blurTimer);
          clearFocusedCell();
          activateColumn(header);
        });
      });
      table.querySelectorAll("tbody td").forEach(cell => {
        cell.addEventListener("mouseenter", () => {
          if (hasFocusedCell()) return;
          activateColumnByIndex(cell.cellIndex);
        });
        cell.addEventListener("focusin", () => activateColumnByIndex(cell.cellIndex));
      });
      table.addEventListener("mouseleave", clearActiveColumn);
      table.querySelectorAll("tbody td input").forEach(input => {
        const focusInput = () => {
          clearTimeout(blurTimer);
          const tr = input.closest("tr");
          const colIdx = getColIndex(input);
          table.classList.add("has-focused-cell");
          table.dataset.focusLocked = "true";
          clearFocusedGuides();
          tr.classList.add("row-focused");
          const th = headers[colIdx] || headRow.querySelector(`th[data-col-index="${colIdx}"]`);
          if (th) th.classList.add("col-focused");
          activateColumn(th);
        };
        input.addEventListener("pointerdown", focusInput);
        input.addEventListener("mousedown", focusInput);
        input.addEventListener("focus", focusInput);
        input.addEventListener("blur", () => {
          blurTimer = setTimeout(() => {
            if (table.contains(document.activeElement)) {
              return;
            }
            clearFocusedCell();
          }, 200);
        });
      });
      table.addEventListener("focusout", event => {
        if (!table.contains(event.relatedTarget)) {
          clearFocusedCell();
          clearActiveColumn();
        }
      });
      table.querySelectorAll(".action-bar-delete").forEach(btn => {
        btn.addEventListener("mousedown", event => {
          clearTimeout(blurTimer);
          // Keep a focused cell/header input from blurring and re-rendering before click.
          event.preventDefault();
        });
      });
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
      block.kind = inferKind(block.name);
      if (isRawRowsBlock(block.name)) {
        const cols = columns(block);
        block.rows = block.rows.map(row => Array.isArray(row) ? row : cols.map(col => row[col] ?? ""));
        block.columnOrder = [];
      } else if (isTableBlock(block.name)) {
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
          block.columnOrder = columns(block);
        }
      }
      render();
    }

    function deleteRow(block, index) {
      helper.deleteRow(block, index);
      render();
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

    function attachDragSort(element, items, item, afterMove, options) {
      const dragSource = options?.dragSource || element;
      const type = options?.type || "item";
      const scope = options?.scope || "default";
      if (!dragSource) return;
      dragSource.draggable = true;
      dragSource.addEventListener("dragstart", event => {
        event.stopPropagation();
        element.classList.add("dragging");
        const payload = { type, scope, index: items.indexOf(item) };
        currentDragPayload = payload;
        event.dataTransfer?.setData(DND_MIME, JSON.stringify(payload));
        event.dataTransfer?.setData("text/plain", String(payload.index));
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });
      dragSource.addEventListener("dragend", () => {
        element.classList.remove("dragging");
        currentDragPayload = null;
      });
      element.addEventListener("dragover", event => {
        if (!isExpectedDrag(event, type, scope)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        element.classList.add("drop-target");
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("drop-target");
      });
      element.addEventListener("drop", event => {
        const from = dragIndex(event, type, scope);
        if (from == null) return;
        event.preventDefault();
        event.stopPropagation();
        element.classList.remove("drop-target");
        const to = items.indexOf(item);
        helper.moveItem(items, from, to);
        currentDragPayload = null;
        if (afterMove) afterMove();
        render();
      });
    }

    function attachIndexDragSort(element, getLength, index, move, options) {
      const dragSource = options?.dragSource || element;
      const type = options?.type || "index";
      const scope = options?.scope || "default";
      if (!dragSource) return;
      dragSource.draggable = true;
      dragSource.addEventListener("dragstart", event => {
        event.stopPropagation();
        element.classList.add("dragging");
        const payload = { type, scope, index };
        currentDragPayload = payload;
        event.dataTransfer?.setData(DND_MIME, JSON.stringify(payload));
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });
      dragSource.addEventListener("dragend", () => {
        element.classList.remove("dragging");
        currentDragPayload = null;
      });
      element.addEventListener("dragover", event => {
        if (!isExpectedDrag(event, type, scope)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        element.classList.add("drop-target");
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("drop-target");
      });
      element.addEventListener("drop", event => {
        const from = dragIndex(event, type, scope);
        if (from == null) return;
        event.preventDefault();
        event.stopPropagation();
        element.classList.remove("drop-target");
        if (from >= 0 && from < getLength()) {
          move(from, index);
        }
        currentDragPayload = null;
      });
    }

    function isExpectedDrag(event, type, scope) {
      if (currentDragPayload) {
        return currentDragPayload.type === type && currentDragPayload.scope === scope;
      }
      const types = Array.from(event.dataTransfer?.types || []);
      return types.includes(DND_MIME);
    }

    function dragIndex(event, type, scope) {
      const payload = dragPayload(event);
      if (!payload || payload.type !== type || payload.scope !== scope) {
        return null;
      }
      return payload.index;
    }

    function dragPayload(event) {
      const raw = event.dataTransfer?.getData(DND_MIME);
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          if (Number.isInteger(payload.index)) {
            return payload;
          }
        } catch (_error) {
          return null;
        }
      }
      return currentDragPayload;
    }

    function renderUnifiedView(options) {
      if (!options?.skipScrollCapture) {
        captureScrollPositions();
      }
      const diffFile = diffReport?.files?.[0];
      root.innerHTML = "";

      const app = document.createElement("div");
      app.className = "app diff-app unified-view";
      const aside = document.createElement("aside");
      const sidebarContent = document.createElement("div");
      sidebarContent.className = "sidebar-content";
      aside.append(sidebarContent);
      const main = document.createElement("main");
      app.append(aside, main);
      attachSidebarResize(aside);

      const title = document.createElement("h1");
      title.textContent = "NTF YAML Editor";
      sidebarContent.append(title);

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
          btn.onclick = () => {
            captureScrollPositions();
            activeUnifiedSheetName = diffSheet.name;
            renderUnifiedView({ skipScrollCapture: true });
          };
          itemWrapper.append(btn);
        }
        sidebarContent.append(itemWrapper);
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
      restoreScrollPositions(sidebarContent, main);
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
      const isRawRows = diffBlock.kind === "RawRows" || isRawRowsBlock(diffBlock.name);

      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      const viewport = document.createElement("div");
      viewport.className = "table-viewport";
      const table = document.createElement("table");
      table.className = isRawRows ? "ntf-table rawrows-table" : "ntf-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const col of cols) {
        const colIndex = cols.indexOf(col);
        const th = document.createElement("th");
        th.className = "table-header-cell";
        th.dataset.colIndex = String(colIndex);
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
      attachTableInteraction(table, headRow, input =>
        Array.from(input.closest("tr").children).indexOf(input.closest("td"))
      );
      viewport.append(table);
      scroll.append(viewport);
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
