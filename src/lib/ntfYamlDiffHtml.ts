import * as fs from "fs";
import type {
  DiffBlock,
  DiffCell,
  DiffCounts,
  DiffFile,
  DiffReport,
  DiffSheet,
  DiffSummary,
} from "./ntfYamlDiff";

export function renderSummaryHtmlReport(report: DiffReport): string {
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
    renderSummaryHtml(report.summary),
    "</header>",
    "<main>",
    report.files.length ? report.files.map(renderFile).join("") : '<p class="empty">YAML の差分はありません。</p>',
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderSummaryHtml(summary: DiffSummary): string {
  const rows: [string, DiffCounts][] = [
    ["ファイル", summary.files],
    ["シート", summary.sheets],
    ["ブロック", summary.blocks],
    ["行", summary.rows],
    ["セル", summary.cells],
  ];
  return '<dl class="summary">' + rows.map(([label, value]) => [
    "<div>",
    "<dt>" + escapeHtml(label) + "</dt>",
    "<dd>変更 " + value.changed + " / 追加 " + value.added + " / 削除 " + value.deleted + "</dd>",
    "</div>",
  ].join("")).join("") + "</dl>";
}

function renderFile(file: DiffFile): string {
  return '<section class="file status-' + file.status + '">' +
    "<h2>" + escapeHtml(file.path || file.oldPath) + statusBadge(file.status) + "</h2>" +
    file.sheets.map(renderSheet).join("") +
    "</section>";
}

function renderSheet(sheet: DiffSheet): string {
  return '<section class="sheet status-' + sheet.status + '">' +
    "<h3>シート: " + escapeHtml(sheet.name) + statusBadge(sheet.status) + "</h3>" +
    sheet.blocks.map(renderBlock).join("") +
    "</section>";
}

function renderBlock(block: DiffBlock): string {
  return '<section class="block status-' + block.status + '">' +
    "<h4>ブロック: " + escapeHtml(block.name) + statusBadge(block.status) + "</h4>" +
    renderTable(block) +
    "</section>";
}

function renderTable(block: DiffBlock): string {
  return '<div class="table-scroll"><table><thead><tr><th>#</th>' +
    block.columns.map(column => "<th>" + escapeHtml(column.label) + "</th>").join("") +
    "</tr></thead><tbody>" +
    block.rows.map(row =>
      '<tr class="status-' + row.status + '"><th>' + escapeHtml(row.key) + "</th>" +
      row.cells.map(renderCell).join("") + "</tr>"
    ).join("") +
    "</tbody></table></div>";
}

function renderCell(cell: DiffCell): string {
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

function statusBadge(status: string): string {
  return ' <span class="badge">' + escapeHtml(status) + "</span>";
}

function valueText(value: string | null | undefined): string {
  return value === null ? "~" : String(value ?? "");
}

function shortSha(value: string): string {
  return value ? String(value).slice(0, 12) : "";
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportCss(): string {
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
    ".old{color:#8b0000;text-decoration:line-through}.new{color:#145c2e;font-weight:600}",
    ".empty{color:#626a73}",
  ].join("");
}

export function renderUnifiedDiffContent(report: DiffReport): string {
  const hasChanges = report.files && report.files.some(f => f.status !== "unchanged");
  const content = hasChanges
    ? report.files.filter(f => f.status !== "unchanged").map(renderFile).join("")
    : '<p class="empty">差分はありません。</p>';
  return '<div class="unified-panel-content">' + content + "</div>";
}

export function writeSummaryHtmlReport(report: DiffReport, outputFile: string): void {
  fs.writeFileSync(outputFile, renderSummaryHtmlReport(report));
}
