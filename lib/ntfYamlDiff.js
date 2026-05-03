(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("fs"), require("child_process"), require("./ntfYamlModel"));
  } else {
    root.NtfYamlDiff = factory(null, null, root.NtfYamlModel);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(fs, childProcess, ntfModel) {
  function createDiffReport(options) {
    const baseModel = options.baseText ? ntfModel.parseYaml(options.baseText) : { sheets: [] };
    const headModel = options.headText ? ntfModel.parseYaml(options.headText) : { sheets: [] };
    const report = {
      baseRef: options.baseRef || "",
      baseSha: options.baseSha || "",
      headRef: options.headRef || "",
      headSha: options.headSha || "",
      repositoryPath: options.repositoryPath || "",
      generatedAt: options.generatedAt || new Date().toISOString(),
      files: [
        diffFile({
          path: options.path || "",
          oldPath: options.oldPath || options.path || "",
          status: options.status || "modified",
          baseModel,
          headModel
        })
      ]
    };
    report.summary = summarize(report.files);
    return report;
  }

  function diffFile(options) {
    const baseSheets = mapByName(options.baseModel.sheets);
    const headSheets = mapByName(options.headModel.sheets);
    const sheetNames = orderedUnion(options.headModel.sheets.map(sheet => sheet.name), options.baseModel.sheets.map(sheet => sheet.name));
    const sheets = sheetNames.map(name => diffSheet(baseSheets.get(name), headSheets.get(name))).filter(Boolean);
    return {
      path: options.path,
      oldPath: options.oldPath,
      status: statusFromChildren(options.status, sheets),
      sheets
    };
  }

  function diffSheet(baseSheet, headSheet) {
    const baseBlocks = mapByName(baseSheet?.blocks || []);
    const headBlocks = mapByName(headSheet?.blocks || []);
    const blockNames = orderedUnion((headSheet?.blocks || []).map(block => block.name), (baseSheet?.blocks || []).map(block => block.name));
    const blocks = blockNames.map(name => diffBlock(baseBlocks.get(name), headBlocks.get(name))).filter(Boolean);
    if (!blocks.length && baseSheet && headSheet) {
      return null;
    }
    return {
      name: headSheet?.name || baseSheet?.name || "",
      status: statusFromChildren(baseSheet ? headSheet ? "unchanged" : "deleted" : "added", blocks),
      blocks
    };
  }

  function diffBlock(baseBlock, headBlock) {
    const block = headBlock || baseBlock;
    if (!block) return null;
    if (!isComparableBlock(baseBlock) && !isComparableBlock(headBlock)) {
      return rawBlockDiff(baseBlock, headBlock);
    }
    const table = ntfModel.isRawRowsBlock(block.name)
      ? diffRawRows(baseBlock, headBlock)
      : diffTable(baseBlock, headBlock);
    if (table.status === "unchanged") {
      return null;
    }
    return {
      name: block.name,
      kind: block.kind || ntfModel.inferKind(block.name),
      status: table.status,
      columns: table.columns,
      rows: table.rows
    };
  }

  function rawBlockDiff(baseBlock, headBlock) {
    const before = baseBlock?.raw || "";
    const after = headBlock?.raw || "";
    if (before === after && baseBlock && headBlock) {
      return null;
    }
    return {
      name: (headBlock || baseBlock).name,
      kind: (headBlock || baseBlock).kind || "Raw",
      status: baseBlock ? headBlock ? "changed" : "deleted" : "added",
      columns: [{ key: "raw", label: "raw" }],
      rows: [{
        key: "raw",
        status: baseBlock ? headBlock ? "changed" : "deleted" : "added",
        cells: [{ column: "raw", status: baseBlock ? headBlock ? "changed" : "deleted" : "added", before, after }]
      }]
    };
  }

  function diffTable(baseBlock, headBlock) {
    const baseRows = baseBlock?.rows || [];
    const headRows = headBlock?.rows || [];
    const baseCols = baseBlock ? ntfModel.columns(baseBlock) : [];
    const headCols = headBlock ? ntfModel.columns(headBlock) : [];
    const columns = orderedUnion(headCols, baseCols).map(name => ({ key: name, label: name }));
    const baseMap = rowMap(baseRows, baseCols);
    const headMap = rowMap(headRows, headCols);
    const keys = orderedUnion(headMap.order, baseMap.order);
    const rows = keys.map(key => {
      const before = baseMap.items.get(key);
      const after = headMap.items.get(key);
      return diffRow(key, before, after, columns);
    }).filter(row => row.status !== "unchanged");
    return { status: rows.length ? "changed" : "unchanged", columns, rows };
  }

  function diffRawRows(baseBlock, headBlock) {
    const baseRows = baseBlock?.rows || [];
    const headRows = headBlock?.rows || [];
    const width = Math.max(maxRawWidth(baseRows), maxRawWidth(headRows));
    const columns = Array.from({ length: width }, (_, index) => ({ key: String(index), label: String(index) }));
    const length = Math.max(baseRows.length, headRows.length);
    const rows = [];
    for (let index = 0; index < length; index++) {
      const before = baseRows[index] ? rawRowObject(baseRows[index], width) : null;
      const after = headRows[index] ? rawRowObject(headRows[index], width) : null;
      const row = diffRow(String(index), before, after, columns);
      if (row.status !== "unchanged") rows.push(row);
    }
    return { status: rows.length ? "changed" : "unchanged", columns, rows };
  }

  function diffRow(key, before, after, columns) {
    const status = before ? after ? "unchanged" : "deleted" : "added";
    let rowStatus = status;
    const cells = columns.map(column => {
      const hasBefore = before ? Object.hasOwn(before.row, column.key) : false;
      const hasAfter = after ? Object.hasOwn(after.row, column.key) : false;
      const oldValue = hasBefore ? before.row[column.key] : undefined;
      const newValue = hasAfter ? after.row[column.key] : undefined;
      const cellStatus = before
        ? after
          ? hasBefore
            ? hasAfter
              ? valueEqual(oldValue, newValue) ? "unchanged" : "changed"
              : "deleted"
            : hasAfter ? "added" : "unchanged"
          : "deleted"
        : "added";
      if (cellStatus !== "unchanged" && rowStatus === "unchanged") {
        rowStatus = "changed";
      }
      return { column: column.key, status: cellStatus, before: oldValue, after: newValue };
    });
    return { key, status: rowStatus, cells };
  }

  function rowMap(rows, columns) {
    const items = new Map();
    const order = [];
    rows.forEach((row, index) => {
      const key = rowIdentity(row, index);
      order.push(key);
      items.set(key, { row, index });
    });
    if (!columns.length && rows.length) {
      rows.forEach((row, index) => {
        for (const col of Object.keys(row)) {
          if (!columns.includes(col)) columns.push(col);
        }
      });
    }
    return { items, order };
  }

  function rowIdentity(row, index) {
    for (const name of ["no", "[no]"]) {
      const value = row[name];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return name + ":" + String(value);
      }
    }
    return "index:" + index;
  }

  function rawRowObject(row, width) {
    const object = {};
    for (let index = 0; index < width; index++) {
      object[String(index)] = row[index];
    }
    return { row: object };
  }

  function maxRawWidth(rows) {
    return rows.reduce((max, row) => Math.max(max, row.length), 0);
  }

  function isComparableBlock(block) {
    return block && (ntfModel.isTableBlock(block.name) || ntfModel.isRawRowsBlock(block.name));
  }

  function mapByName(items) {
    const map = new Map();
    for (const item of items || []) {
      map.set(item.name, item);
    }
    return map;
  }

  function orderedUnion(primary, secondary) {
    const result = [];
    for (const value of primary.concat(secondary)) {
      if (!result.includes(value)) result.push(value);
    }
    return result;
  }

  function statusFromChildren(fallback, children) {
    if (!children.length) return fallback;
    if (children.some(item => item.status !== "unchanged")) return "changed";
    return fallback;
  }

  function valueEqual(a, b) {
    return (a === null ? null : String(a ?? "")) === (b === null ? null : String(b ?? ""));
  }

  function summarize(files) {
    const summary = {
      files: { changed: 0, added: 0, deleted: 0 },
      sheets: { changed: 0, added: 0, deleted: 0 },
      blocks: { changed: 0, added: 0, deleted: 0 },
      rows: { changed: 0, added: 0, deleted: 0 },
      cells: { changed: 0, added: 0, deleted: 0 }
    };
    for (const file of files) {
      count(summary.files, file.status);
      for (const sheet of file.sheets) {
        count(summary.sheets, sheet.status);
        for (const block of sheet.blocks) {
          count(summary.blocks, block.status);
          for (const row of block.rows) {
            count(summary.rows, row.status);
            for (const cell of row.cells) {
              count(summary.cells, cell.status);
            }
          }
        }
      }
    }
    return summary;
  }

  function count(bucket, status) {
    if (status === "added") bucket.added++;
    else if (status === "deleted") bucket.deleted++;
    else if (status === "changed") bucket.changed++;
  }

  function renderHtmlReport(report) {
    const title = "NTF YAML Cell Diff";
    return [
      "<!doctype html>",
      '<html lang="ja">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>" + escapeHtml(title) + "</title>",
      "<style>" + reportCss() + "</style>",
      "</head>",
      "<body>",
      "<header>",
      "<h1>" + escapeHtml(title) + "</h1>",
      '<div class="meta">' + escapeHtml(report.baseRef) + " (" + escapeHtml(shortSha(report.baseSha)) + ") → " + escapeHtml(report.headRef) + " (" + escapeHtml(shortSha(report.headSha)) + ")</div>",
      '<div class="meta">' + escapeHtml(report.repositoryPath) + " / " + escapeHtml(report.generatedAt) + "</div>",
      renderSummary(report.summary),
      "</header>",
      "<main>",
      report.files.length ? report.files.map(renderFile).join("") : '<p class="empty">YAML の差分はありません。</p>',
      "</main>",
      "</body>",
      "</html>"
    ].join("\n");
  }

  function renderSummary(summary) {
    const rows = [
      ["ファイル", summary.files],
      ["シート", summary.sheets],
      ["ブロック", summary.blocks],
      ["行", summary.rows],
      ["セル", summary.cells]
    ];
    return '<dl class="summary">' + rows.map(([label, value]) => [
      "<div>",
      "<dt>" + escapeHtml(label) + "</dt>",
      "<dd>変更 " + value.changed + " / 追加 " + value.added + " / 削除 " + value.deleted + "</dd>",
      "</div>"
    ].join("")).join("") + "</dl>";
  }

  function renderFile(file) {
    return '<section class="file status-' + file.status + '">' +
      "<h2>" + escapeHtml(file.path || file.oldPath) + statusBadge(file.status) + "</h2>" +
      file.sheets.map(renderSheet).join("") +
      "</section>";
  }

  function renderSheet(sheet) {
    return '<section class="sheet status-' + sheet.status + '">' +
      "<h3>シート: " + escapeHtml(sheet.name) + statusBadge(sheet.status) + "</h3>" +
      sheet.blocks.map(renderBlock).join("") +
      "</section>";
  }

  function renderBlock(block) {
    return '<section class="block status-' + block.status + '">' +
      "<h4>ブロック: " + escapeHtml(block.name) + statusBadge(block.status) + "</h4>" +
      renderTable(block) +
      "</section>";
  }

  function renderTable(block) {
    return '<div class="table-scroll"><table><thead><tr><th>#</th>' +
      block.columns.map(column => "<th>" + escapeHtml(column.label) + "</th>").join("") +
      "</tr></thead><tbody>" +
      block.rows.map(row => '<tr class="status-' + row.status + '"><th>' + escapeHtml(row.key) + "</th>" + row.cells.map(renderCell).join("") + "</tr>").join("") +
      "</tbody></table></div>";
  }

  function renderCell(cell) {
    if (cell.status === "unchanged") {
      return "<td>" + escapeHtml(valueText(cell.after)) + "</td>";
    }
    if (cell.status === "added") {
      return '<td class="cell-added"><div class="new">' + escapeHtml(valueText(cell.after)) + "</div></td>";
    }
    if (cell.status === "deleted") {
      return '<td class="cell-deleted"><div class="old">' + escapeHtml(valueText(cell.before)) + "</div></td>";
    }
    return '<td class="cell-changed"><div class="old">' + escapeHtml(valueText(cell.before)) + '</div><div class="new">' + escapeHtml(valueText(cell.after)) + "</div></td>";
  }

  function statusBadge(status) {
    return ' <span class="badge">' + escapeHtml(status) + "</span>";
  }

  function valueText(value) {
    return value === null ? "~" : String(value ?? "");
  }

  function shortSha(value) {
    return value ? String(value).slice(0, 12) : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function reportCss() {
    return [
      "body{margin:0;background:#f7f7f5;color:#202124;font:14px system-ui,sans-serif}",
      "header{padding:20px 24px;border-bottom:1px solid #c9ced4;background:#fff}",
      "main{padding:20px 24px}",
      "h1,h2,h3,h4{margin:0 0 10px;line-height:1.3}",
      ".meta{color:#626a73;margin:4px 0}",
      ".summary{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0}",
      ".summary div{border:1px solid #c9ced4;background:#f3f5f4;padding:8px 10px}",
      ".summary dt{font-weight:700}.summary dd{margin:2px 0 0}",
      ".file,.sheet,.block{margin:0 0 18px}.block{border:1px solid #c9ced4;background:#fff}",
      ".block h4{padding:10px;background:#eef1ef;border-bottom:1px solid #c9ced4}",
      ".badge{font-size:12px;color:#626a73;border:1px solid #c9ced4;padding:1px 5px}",
      ".table-scroll{overflow:auto;max-height:75vh}",
      "table{border-collapse:collapse;min-width:100%}",
      "th,td{border:1px solid #c9ced4;padding:6px 8px;vertical-align:top;min-width:90px}",
      "thead th{position:sticky;top:0;background:#e8ecea;z-index:1}",
      "tbody th{position:sticky;left:0;background:#f7f8f7;z-index:1;text-align:left}",
      ".status-added{background:#edf8ef}.status-deleted{background:#fff1ed}.status-changed{background:#fffbea}",
      ".cell-added{background:#daf1df}.cell-deleted{background:#ffdcd2}.cell-changed{background:#fff0b8}",
      ".old{color:#8f2f1f;text-decoration:line-through}.new{color:#145c2e;font-weight:600}",
      ".empty{color:#626a73}"
    ].join("");
  }

  function diffGitRefs(options) {
    if (!fs || !childProcess) {
      throw new Error("diffGitRefs is only available in Node.js.");
    }
    const cwd = options.cwd || process.cwd();
    const baseRef = options.baseRef;
    const headRef = options.headRef;
    const baseSha = git(["rev-parse", baseRef], cwd).trim();
    const headSha = git(["rev-parse", headRef], cwd).trim();
    const statusText = git(["diff", "--name-status", "-M", baseRef, headRef, "--", "*.yaml", "*.yml"], cwd);
    const files = parseNameStatus(statusText).map(file => {
      const oldPath = file.oldPath || file.path;
      const baseText = file.status === "added" ? "" : gitShow(baseRef, oldPath, cwd);
      const headText = file.status === "deleted" ? "" : gitShow(headRef, file.path, cwd);
      return diffFile({
        path: file.path,
        oldPath,
        status: file.status,
        baseModel: baseText ? ntfModel.parseYaml(baseText) : { sheets: [] },
        headModel: headText ? ntfModel.parseYaml(headText) : { sheets: [] }
      });
    });
    const report = {
      baseRef,
      baseSha,
      headRef,
      headSha,
      repositoryPath: cwd,
      generatedAt: new Date().toISOString(),
      files
    };
    report.summary = summarize(files);
    return report;
  }

  function parseNameStatus(text) {
    return text.split(/\r?\n/).filter(Boolean).map(line => {
      const parts = line.split("\t");
      const code = parts[0];
      if (code.startsWith("R")) {
        return { status: "changed", oldPath: parts[1], path: parts[2] };
      }
      if (code === "A") return { status: "added", path: parts[1] };
      if (code === "D") return { status: "deleted", path: parts[1] };
      return { status: "changed", path: parts[1] };
    });
  }

  function git(args, cwd) {
    const result = childProcess.spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "git command failed").trim());
    }
    return result.stdout;
  }

  function gitShow(ref, file, cwd) {
    return git(["show", ref + ":" + file], cwd);
  }

  function writeHtmlReport(report, outputFile) {
    fs.writeFileSync(outputFile, renderHtmlReport(report));
  }

  return {
    createDiffReport,
    diffGitRefs,
    parseNameStatus,
    renderHtmlReport,
    writeHtmlReport
  };
});
