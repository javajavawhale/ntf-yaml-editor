import {
  parseYaml,
  isTableBlock,
  isRawRowsBlock,
  inferKind,
  columns,
  type NtfYamlModel,
  type NtfBlock,
  type TableRow,
  type RawRow,
} from "./ntfYamlModel";

// ── Types ──────────────────────────────────────────────────────────────────

export type DiffStatus = "unchanged" | "changed" | "added" | "deleted" | "modified";

export interface DiffCounts {
  changed: number;
  added: number;
  deleted: number;
}

export interface DiffSummary {
  files: DiffCounts;
  sheets: DiffCounts;
  blocks: DiffCounts;
  rows: DiffCounts;
  cells: DiffCounts;
}

export interface DiffColumn {
  key: string;
  label: string;
}

export interface DiffCell {
  column: string;
  status: DiffStatus;
  before: string | null | undefined;
  after: string | null | undefined;
}

export interface DiffRow {
  key: string;
  status: DiffStatus;
  headIndex: number | null | undefined;
  cells: DiffCell[];
}

export interface DiffBlock {
  name: string;
  kind: string;
  status: DiffStatus;
  columns: DiffColumn[];
  rows: DiffRow[];
}

export interface DiffSheet {
  name: string;
  status: DiffStatus;
  blocks: DiffBlock[];
}

export interface DiffFile {
  path: string;
  oldPath: string;
  status: DiffStatus;
  sheets: DiffSheet[];
}

export interface DiffReport {
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  repositoryPath: string;
  generatedAt: string;
  files: DiffFile[];
  summary: DiffSummary;
  baseText: string;
  headText: string;
}

export interface CreateDiffReportOptions {
  path?: string;
  oldPath?: string;
  status?: DiffStatus;
  baseRef?: string;
  baseSha?: string;
  headRef?: string;
  headSha?: string;
  repositoryPath?: string;
  generatedAt?: string;
  baseText?: string;
  headText?: string;
}

// ── Diff engine ────────────────────────────────────────────────────────────

export function createDiffReport(options: CreateDiffReportOptions): DiffReport {
  const baseModel = options.baseText ? parseYaml(options.baseText) : { sheets: [] };
  const headModel = options.headText ? parseYaml(options.headText) : { sheets: [] };
  const report: DiffReport = {
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
        headModel,
      }),
    ],
    summary: emptySummary(),
    baseText: options.baseText || "",
    headText: options.headText || "",
  };
  report.summary = summarize(report.files);
  return report;
}

interface DiffFileOptions {
  path: string;
  oldPath: string;
  status: DiffStatus;
  baseModel: NtfYamlModel;
  headModel: NtfYamlModel;
}

export function diffFile(options: DiffFileOptions): DiffFile {
  const baseSheets = mapByName(options.baseModel.sheets);
  const headSheets = mapByName(options.headModel.sheets);
  const sheetNames = orderedUnion(
    options.headModel.sheets.map(s => s.name),
    options.baseModel.sheets.map(s => s.name)
  );
  const sheets = sheetNames
    .map(name => diffSheet(baseSheets.get(name), headSheets.get(name)))
    .filter((s): s is DiffSheet => s !== null);
  return {
    path: options.path,
    oldPath: options.oldPath,
    status: statusFromChildren(options.status, sheets),
    sheets,
  };
}

function diffSheet(
  baseSheet: { name: string; blocks: NtfBlock[] } | undefined,
  headSheet: { name: string; blocks: NtfBlock[] } | undefined
): DiffSheet | null {
  const baseBlocks = mapByName(baseSheet?.blocks || []);
  const headBlocks = mapByName(headSheet?.blocks || []);
  const blockNames = orderedUnion(
    (headSheet?.blocks || []).map(b => b.name),
    (baseSheet?.blocks || []).map(b => b.name)
  );
  const blocks = blockNames
    .map(name => diffBlock(baseBlocks.get(name), headBlocks.get(name)))
    .filter((b): b is DiffBlock => b !== null);
  if (!blocks.length && baseSheet && headSheet) {
    return null;
  }
  return {
    name: headSheet?.name || baseSheet?.name || "",
    status: statusFromChildren(entityStatus(baseSheet, headSheet), blocks),
    blocks,
  };
}

function diffBlock(baseBlock: NtfBlock | undefined, headBlock: NtfBlock | undefined): DiffBlock | null {
  const block = headBlock || baseBlock;
  if (!block) return null;
  if (!isComparableBlock(baseBlock) && !isComparableBlock(headBlock)) {
    return rawBlockDiff(baseBlock, headBlock);
  }
  const table = isRawRowsBlock(block.name)
    ? diffRawRows(baseBlock, headBlock)
    : diffTable(baseBlock, headBlock);
  if (table.status === "unchanged") {
    return null;
  }
  return {
    name: block.name,
    kind: block.kind || inferKind(block.name),
    status: entityStatus(baseBlock, headBlock) === "unchanged" ? table.status : entityStatus(baseBlock, headBlock),
    columns: table.columns,
    rows: table.rows,
  };
}

function rawBlockDiff(baseBlock: NtfBlock | undefined, headBlock: NtfBlock | undefined): DiffBlock | null {
  const before = baseBlock?.raw || "";
  const after = headBlock?.raw || "";
  if (before === after && baseBlock && headBlock) {
    return null;
  }
  const b = (headBlock || baseBlock)!;
  const status: DiffStatus = baseBlock ? (headBlock ? "changed" : "deleted") : "added";
  const rawRow: DiffRow = {
    key: "raw",
    status,
    headIndex: undefined,
    cells: [{ column: "raw", status, before, after }],
  };
  return {
    name: b.name,
    kind: b.kind || "Raw",
    status,
    columns: [{ key: "raw", label: "raw" }],
    rows: [rawRow],
  };
}

interface TableDiffResult {
  status: DiffStatus;
  columns: DiffColumn[];
  rows: DiffRow[];
}

function diffTable(baseBlock: NtfBlock | undefined, headBlock: NtfBlock | undefined): TableDiffResult {
  const baseRows = (baseBlock?.rows || []) as TableRow[];
  const headRows = (headBlock?.rows || []) as TableRow[];
  const baseCols = baseBlock ? columns(baseBlock) : [];
  const headCols = headBlock ? columns(headBlock) : [];
  const cols = columnsUnion(baseRows, headRows, baseCols, headCols);
  const rows = lcsMatchAndDiff(
    baseRows,
    headRows,
    cols,
    rowsEqual,
    row => ({ row })
  );
  return { status: rows.length ? "changed" : "unchanged", columns: cols, rows };
}

function diffRawRows(baseBlock: NtfBlock | undefined, headBlock: NtfBlock | undefined): TableDiffResult {
  const baseRows = (baseBlock?.rows || []) as RawRow[];
  const headRows = (headBlock?.rows || []) as RawRow[];
  const width = Math.max(maxRawWidth(baseRows), maxRawWidth(headRows));
  const cols = Array.from({ length: width }, (_, index) => ({
    key: String(index),
    label: String(index),
  }));
  const rows = lcsMatchAndDiff(
    baseRows,
    headRows,
    cols,
    rawRowsEqual,
    rawRow => rawRowObject(rawRow, width)
  );
  return { status: rows.length ? "changed" : "unchanged", columns: cols, rows };
}

type WrappedRow = { row: TableRow };

function diffRow(
  rowKey: string,
  before: WrappedRow | null,
  after: WrappedRow | null,
  cols: DiffColumn[]
): DiffRow {
  const status: DiffStatus = before ? (after ? "unchanged" : "deleted") : "added";
  let rowStatus: DiffStatus = status;
  const cells = cols.map(column => {
    const beforeRow = before ? before.row : null;
    const afterRow = after ? after.row : null;
    const hasBefore = beforeRow ? Object.hasOwn(beforeRow, column.key) : false;
    const hasAfter = afterRow ? Object.hasOwn(afterRow, column.key) : false;
    const oldValue = hasBefore ? beforeRow![column.key] : undefined;
    const newValue = hasAfter ? afterRow![column.key] : undefined;
    let cellStatus: DiffStatus;
    if (before) {
      if (after) {
        if (hasBefore) {
          cellStatus = hasAfter ? (valueEqual(oldValue, newValue) ? "unchanged" : "changed") : "deleted";
        } else {
          cellStatus = hasAfter ? "added" : "unchanged";
        }
      } else {
        cellStatus = "deleted";
      }
    } else {
      cellStatus = "added";
    }
    if (cellStatus !== "unchanged" && rowStatus === "unchanged") {
      rowStatus = "changed";
    }
    return { column: column.key, status: cellStatus, before: oldValue, after: newValue };
  });
  return { key: rowKey, status: rowStatus, headIndex: undefined, cells };
}

function columnsUnion(
  baseRows: TableRow[],
  headRows: TableRow[],
  baseCols: string[],
  headCols: string[]
): DiffColumn[] {
  const names = orderedUnion(headCols, baseCols);
  if (!names.length) {
    const seen = new Set<string>();
    for (const row of headRows.concat(baseRows)) {
      for (const k of Object.keys(row)) {
        if (!seen.has(k)) { seen.add(k); names.push(k); }
      }
    }
  }
  return names.map(name => ({ key: name, label: name }));
}

// ── LCS ───────────────────────────────────────────────────────────────────

type LcsEdit<T> =
  | { type: "keep"; bi: number; hi: number }
  | { type: "del"; row: T; bi: number }
  | { type: "ins"; row: T; hi: number };

function lcsMatchAndDiff<T>(
  baseRows: T[],
  headRows: T[],
  cols: DiffColumn[],
  equalFn: (a: T, b: T) => boolean,
  wrapFn: (row: T) => WrappedRow
): DiffRow[] {
  const edits = lcs(baseRows, headRows, equalFn);
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < edits.length) {
    if (edits[i].type === "keep") { i++; continue; }
    const dels: (LcsEdit<T> & { type: "del" })[] = [];
    const ins: (LcsEdit<T> & { type: "ins" })[] = [];
    while (i < edits.length && edits[i].type === "del") {
      dels.push(edits[i++] as LcsEdit<T> & { type: "del" });
    }
    while (i < edits.length && edits[i].type === "ins") {
      ins.push(edits[i++] as LcsEdit<T> & { type: "ins" });
    }
    const pairCount = Math.min(dels.length, ins.length);
    for (let p = 0; p < pairCount; p++) {
      const row = diffRow(String(dels[p].bi), wrapFn(dels[p].row), wrapFn(ins[p].row), cols);
      row.headIndex = ins[p].hi;
      if (row.status !== "unchanged") rows.push(row);
    }
    for (let p = pairCount; p < dels.length; p++) {
      const row = diffRow(String(dels[p].bi), wrapFn(dels[p].row), null, cols);
      row.headIndex = null;
      rows.push(row);
    }
    for (let p = pairCount; p < ins.length; p++) {
      const row = diffRow(String(ins[p].hi), null, wrapFn(ins[p].row), cols);
      row.headIndex = ins[p].hi;
      rows.push(row);
    }
  }
  return rows;
}

function lcs<T>(a: T[], b: T[], equalFn: (x: T, y: T) => boolean): LcsEdit<T>[] {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = equalFn(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const edits: LcsEdit<T>[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && equalFn(a[i - 1], b[j - 1])) {
      edits.unshift({ type: "keep", bi: i - 1, hi: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: "ins", row: b[j - 1], hi: j - 1 });
      j--;
    } else {
      edits.unshift({ type: "del", row: a[i - 1], bi: i - 1 });
      i--;
    }
  }
  return edits;
}

function rowsEqual(a: TableRow, b: TableRow): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.hasOwn(b, k) || !valueEqual(a[k], b[k])) return false;
  }
  return true;
}

function rawRowsEqual(a: RawRow, b: RawRow): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!valueEqual(a[i], b[i])) return false;
  }
  return true;
}

function rawRowObject(row: RawRow, width: number): WrappedRow {
  const obj: TableRow = {};
  for (let index = 0; index < width; index++) {
    obj[String(index)] = row[index] ?? null;
  }
  return { row: obj };
}

function maxRawWidth(rows: RawRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function isComparableBlock(block: NtfBlock | undefined): boolean {
  return !!(block && (isRawRowsBlock(block.name) || isTableBlock(block.name)) && !block.raw);
}

function mapByName<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items || []) {
    map.set(item.name, item);
  }
  return map;
}

function orderedUnion(primary: string[], secondary: string[]): string[] {
  const result: string[] = [];
  for (const value of primary.concat(secondary)) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function statusFromChildren(fallback: DiffStatus, children: { status: DiffStatus }[]): DiffStatus {
  if (fallback === "added" || fallback === "deleted") return fallback;
  if (!children.length) return fallback;
  if (children.some(item => item.status !== "unchanged")) return "changed";
  return fallback;
}

function entityStatus(
  base: object | undefined,
  head: object | undefined
): DiffStatus {
  return base ? (head ? "unchanged" : "deleted") : "added";
}

function valueEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return (a === null ? null : String(a ?? "")) === (b === null ? null : String(b ?? ""));
}

// ── Summary ────────────────────────────────────────────────────────────────

function emptySummary(): DiffSummary {
  return {
    files: { changed: 0, added: 0, deleted: 0 },
    sheets: { changed: 0, added: 0, deleted: 0 },
    blocks: { changed: 0, added: 0, deleted: 0 },
    rows: { changed: 0, added: 0, deleted: 0 },
    cells: { changed: 0, added: 0, deleted: 0 },
  };
}

export function summarize(files: DiffFile[]): DiffSummary {
  const summary = emptySummary();
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

function count(bucket: DiffCounts, status: DiffStatus): void {
  if (status === "added") bucket.added++;
  else if (status === "deleted") bucket.deleted++;
  else if (status === "changed") bucket.changed++;
}
