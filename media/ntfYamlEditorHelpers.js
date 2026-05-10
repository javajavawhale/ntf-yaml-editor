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

  function rawRowView(row, sectionState) {
    const first = String(row[0] ?? "");
    if (isNtfFileDirective(first)) {
      sectionState.name = "";
      sectionState.continuationCount = 0;
      return { className: "raw-metadata-row", keyLike: true };
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
        keyLike: true,
        lockFirstCell: true
      };
    }
    sectionState.name = "";
    sectionState.continuationCount = 0;
    return { className: "" };
  }

  return {
    uniqueName,
    replaceRowKey,
    moveItem,
    rawWidth,
    isNtfFileDirective,
    rawRowView
  };
});
