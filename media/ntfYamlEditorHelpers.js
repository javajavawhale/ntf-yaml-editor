(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NtfYamlEditorHelpers = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
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

  function moveItem(items, from, to) {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
      return;
    }
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
  }

  function rawWidth(block) {
    return block.rows.reduce((max, row) => Math.max(max, row.length), 0);
  }

  function tableColumns(block) {
    const names = [];
    for (const name of (block.columnOrder || [])) {
      if (!names.includes(name)) names.push(name);
    }
    for (const row of (block.rows || [])) {
      for (const name of Object.keys(row)) {
        if (!names.includes(name)) names.push(name);
      }
    }
    return names;
  }

  function addColumnName(block, name) {
    if (!Array.isArray(block.columnOrder)) {
      block.columnOrder = tableColumns(block);
    }
    if (!block.columnOrder.includes(name)) {
      block.columnOrder.push(name);
    }
  }

  function renameColumn(block, from, to) {
    const next = String(to || "").trim();
    if (!next || next === from) {
      return false;
    }
    for (const row of block.rows) {
      replaceRowKey(row, from, next);
    }
    if (Array.isArray(block.columnOrder)) {
      block.columnOrder = block.columnOrder.map(name => name === from ? next : name);
    }
    return true;
  }

  function deleteRow(block, index) {
    block.rows.splice(index, 1);
  }

  function deleteColumn(block, name) {
    for (const row of block.rows) {
      delete row[name];
    }
    if (Array.isArray(block.columnOrder)) {
      block.columnOrder = block.columnOrder.filter(col => col !== name);
    }
  }

  function deleteRawColumn(block, index) {
    for (const row of block.rows) {
      row.splice(index, 1);
    }
  }

  function moveRawColumnTo(block, from, to) {
    const width = rawWidth(block);
    if (from < 0 || to < 0 || from >= width || to >= width || from === to) {
      return false;
    }
    for (const row of block.rows) {
      const value = row[from] ?? "";
      row.splice(from, 1);
      row.splice(to, 0, value);
    }
    return true;
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

  function rawRowView(row, sectionState, options) {
    const first = String(row[0] ?? "");
    if (isNtfFileDirective(first)) {
      sectionState.fileRowsStarted = true;
      sectionState.next = "record";
      return { className: "raw-metadata-row", keyLike: true };
    }

    if (sectionState.next === "types") {
      sectionState.next = options?.fixedLength ? "lengths" : "values";
      return { className: "raw-type-row", headerLike: true };
    }

    if (sectionState.next === "lengths") {
      sectionState.next = "values";
      return { className: "raw-length-row", headerLike: true };
    }

    if (!first && sectionState.next === "values") {
      return {
        className: "raw-value-row",
        keyLike: true,
        lockFirstCell: true
      };
    }

    const isKnownRecordType = /^(header|data)$/.test(first);
    if (first && (sectionState.fileRowsStarted || isKnownRecordType || sectionState.next === "values")) {
      sectionState.fileRowsStarted = true;
      sectionState.next = "types";
      return { className: "raw-section-header-row", headerLike: true };
    }

    sectionState.fileRowsStarted = false;
    sectionState.next = "";
    return { className: "" };
  }

  return {
    uniqueName,
    replaceRowKey,
    moveItem,
    rawWidth,
    addColumnName,
    renameColumn,
    deleteRow,
    deleteColumn,
    deleteRawColumn,
    moveRawColumnTo,
    isNtfFileDirective,
    rawRowView
  };
});
