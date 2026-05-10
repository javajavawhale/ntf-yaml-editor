(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NtfYamlEditorDiffHelpers = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function findDiffSheet(diffReport, sheetName) {
    const file = diffReport?.files?.[0];
    return file?.sheets?.find(item => item.name === sheetName) || null;
  }

  function findDiffBlock(diffReport, sheetName, blockName) {
    const sheet = findDiffSheet(diffReport, sheetName);
    return sheet?.blocks?.find(item => item.name === blockName) || null;
  }

  function findDiffRow(block, key, diffSide) {
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

  function unchangedUnifiedRow(row, index, cols) {
    return {
      key: String(index),
      status: "unchanged",
      headIndex: index,
      cells: cols.map(col => {
        const value = Array.isArray(row) ? row[Number(col)] : row[col];
        return { column: col, status: "unchanged", before: value, after: value };
      })
    };
  }

  function unifiedRowsForBlock(diffBlock, headBlockRows, cols) {
    if (!Array.isArray(headBlockRows)) {
      return diffBlock.rows || [];
    }

    const diffRowsByHeadIndex = new Map();
    const deletedRows = [];
    for (const diffRow of diffBlock.rows || []) {
      if (diffRow.headIndex === null || diffRow.headIndex === undefined) {
        deletedRows.push(diffRow);
      } else {
        diffRowsByHeadIndex.set(Number(diffRow.headIndex), diffRow);
      }
    }

    const rows = [];
    headBlockRows.forEach((row, index) => {
      rows.push(diffRowsByHeadIndex.get(index) || unchangedUnifiedRow(row, index, cols));
    });
    deletedRows.sort((a, b) => Number(a.key) - Number(b.key));
    rows.push(...deletedRows);
    return rows;
  }

  return {
    findDiffSheet,
    findDiffBlock,
    findDiffRow,
    findDiffCell,
    tableRowKey,
    applyDiffClass,
    setDiffStatus,
    valueText,
    unifiedRowsForBlock
  };
});
