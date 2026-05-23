// ── Types ──────────────────────────────────────────────────────────────────

export interface NtfSheet {
  name: string;
  blocks: NtfBlock[];
}

export interface NtfBlock {
  name: string;
  kind: string;
  rows: NtfRow[];
  columnOrder: string[];
  raw: string;
}

/** Table row: column name → cell value (null = YAML ~) */
export type TableRow = Record<string, string | null>;
/** RawRows row: ordered array of cell values */
export type RawRow = (string | null)[];
export type NtfRow = TableRow | RawRow;

export interface NtfYamlModel {
  sheets: NtfSheet[];
}

export interface NtfDiagnostic {
  severity: "error" | "warning";
  message: string;
  path: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

export const tableBlockPrefixes: string[] = [
  "SETUP_TABLE",
  "EXPECTED_TABLE",
  "EXPECTED_COMPLETE_TABLE",
  "LIST_MAP",
];

export const rawRowsBlockPrefixes: string[] = [
  "SETUP_VARIABLE",
  "EXPECTED_VARIABLE",
];

export const rawBlockPrefixes: string[] = [
  "SETUP_FIXED",
  "EXPECTED_FIXED",
  "MESSAGE",
  "EXPECTED_REQUEST_HEADER_MESSAGES",
  "EXPECTED_REQUEST_BODY_MESSAGES",
  "RESPONSE_HEADER_MESSAGES",
  "RESPONSE_BODY_MESSAGES",
];

export const blockPrefixes: string[] = [
  ...tableBlockPrefixes,
  ...rawRowsBlockPrefixes,
  ...rawBlockPrefixes,
];

// ── Parser ─────────────────────────────────────────────────────────────────

export function parseYaml(text: string): NtfYamlModel {
  const model: NtfYamlModel = { sheets: [] };
  const sheets = model.sheets;
  let currentSheet: NtfSheet | null = null;
  let currentBlock: NtfBlock | null = null;
  let currentRow: TableRow | null = null;
  let rawBuffer: string[] = [];
  let multiLineArr: string[] | null = null;

  function flushRaw(): void {
    if (currentBlock && rawBuffer.length) {
      currentBlock.raw = rawBuffer.join("\n");
      rawBuffer = [];
    }
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const top = line.match(/^([^\s][^:]*):(?:\s*#.*)?$/);
    if (top) {
      flushRaw();
      currentSheet = { name: top[1].trim(), blocks: [] };
      sheets.push(currentSheet);
      currentBlock = null;
      currentRow = null;
      continue;
    }
    if (!currentSheet) {
      continue;
    }
    const block = line.match(/^\s{2}([^:]+):(?:\s*#(.*))?$/);
    if (block) {
      flushRaw();
      currentBlock = {
        name: block[1].trim(),
        kind: block[2]?.trim() || inferKind(block[1].trim()),
        rows: [],
        columnOrder: [],
        raw: "",
      };
      currentSheet.blocks.push(currentBlock);
      currentRow = null;
      continue;
    }
    if (!currentBlock) {
      continue;
    }
    if (!isTableBlock(currentBlock.name) && !isRawRowsBlock(currentBlock.name)) {
      rawBuffer.push(line.replace(/^\s{4}/, ""));
      continue;
    }
    if (isRawRowsBlock(currentBlock.name)) {
      const singleLine = line.match(/^\s{4}-?\s*\[(.*)\]\s*,?$/);
      if (singleLine) {
        (currentBlock.rows as RawRow[]).push(parseInlineArray("[" + singleLine[1] + "]"));
      } else {
        const startArr = line.match(/^\s{4}-?\s*\[(.*)$/);
        if (startArr) {
          multiLineArr = startArr[1].trim() ? [startArr[1]] : [];
        } else if (multiLineArr !== null) {
          const endArr = line.match(/^\s*(.*?)\]\s*,?$/);
          if (endArr) {
            if (endArr[1].trim()) {
              multiLineArr.push(endArr[1]);
            }
            (currentBlock.rows as RawRow[]).push(
              parseInlineArray("[" + multiLineArr.join("\n").replace(/,\s*$/, "") + "]")
            );
            multiLineArr = null;
          } else {
            multiLineArr.push(line.trim());
          }
        }
      }
      continue;
    }
    const rowStart = line.match(/^\s{4}-\s*(.*)$/);
    if (rowStart) {
      currentRow = {};
      (currentBlock.rows as TableRow[]).push(currentRow);
      const inline = rowStart[1];
      if (inline) {
        const pair = inline.match(/^([^:]+):\s*(.*)$/);
        if (pair) {
          const name = unquote(pair[1].trim());
          rememberColumn(currentBlock, name);
          currentRow[name] = parseScalar(pair[2].trim());
        }
      }
      continue;
    }
    const pair = line.match(/^\s{6}([^:]+):\s*(.*)$/);
    if (pair && currentRow) {
      const name = unquote(pair[1].trim());
      rememberColumn(currentBlock, name);
      currentRow[name] = parseScalar(pair[2].trim());
    }
  }
  flushRaw();
  return model;
}

function rememberColumn(block: NtfBlock, name: string): void {
  if (block && !block.columnOrder.includes(name)) {
    block.columnOrder.push(name);
  }
}

export function inferKind(name: string): string {
  if (isTableBlock(name)) return "ListMap";
  if (isRawRowsBlock(name)) return "RawRows";
  if (isFixedLengthFileBlock(name)) return "FixedLengthFile";
  if (isMessageBlock(name)) return "Message";
  return "Raw";
}

export function isTableBlock(name: string): boolean {
  return blockNameStartsWith(name, tableBlockPrefixes);
}

export function isRawRowsBlock(name: string): boolean {
  return blockNameStartsWith(name, rawRowsBlockPrefixes);
}

export function isKnownRawBlock(name: string): boolean {
  return blockNameStartsWith(name, rawBlockPrefixes);
}

function isFixedLengthFileBlock(name: string): boolean {
  return blockNameStartsWith(name, rawBlockPrefixes.filter(prefix => prefix !== "MESSAGE"));
}

function isMessageBlock(name: string): boolean {
  return blockNameStartsWith(name, ["MESSAGE"]);
}

function blockNameStartsWith(name: string, prefixes: string[]): boolean {
  return prefixes.some(prefix =>
    new RegExp("^" + escapeRegExp(prefix) + "(\\[\\d+\\])?=").test(String(name || ""))
  );
}

export function parseInlineArray(text: string): RawRow {
  const inner = text.trim().replace(/^\[/, "").replace(/\]$/, "");
  const items: string[] = [];
  let cur = "";
  let inQ = false;
  let qc = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (!inQ && (c === '"' || c === "'")) { inQ = true; qc = c; continue; }
    if (inQ && qc === '"' && c === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      cur += next === '"' || next === "\\" ? next : c + next;
      i++;
      continue;
    }
    if (inQ && c === qc) { inQ = false; continue; }
    if (!inQ && c === ",") { items.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  items.push(cur.trim());
  return items.map(parseScalar);
}

function parseScalar(value: string): string | null {
  if (value === "~") {
    return null;
  }
  return unquote(value);
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuoted(value.slice(1, -1));
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function unescapeDoubleQuoted(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      out += next === '"' || next === "\\" ? next : c + next;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

export function quote(value: string | null | undefined): string {
  if (value === null) {
    return "~";
  }
  const text = String(value ?? "");
  return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function key(value: string | null | undefined): string {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_.-]+$/.test(text)) {
    return text;
  }
  return quote(text);
}

export function columns(block: NtfBlock): string[] {
  const names: string[] = [];
  for (const name of block.columnOrder || []) {
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  for (const row of block.rows) {
    for (const k of Object.keys(row as object)) {
      if (!names.includes(k)) {
        names.push(k);
      }
    }
  }
  return names.length ? names : ["no"];
}

// ── Analyzer ───────────────────────────────────────────────────────────────

export function analyzeYaml(text: string): NtfDiagnostic[] {
  return analyzeModel(parseYaml(text));
}

export function analyzeModel(model: NtfYamlModel): NtfDiagnostic[] {
  const diagnostics: NtfDiagnostic[] = [];
  const sheetNames = new Set<string>();

  if (!model.sheets.length) {
    diagnostics.push(diagnostic("warning", "Document does not contain any NTF sheets.", []));
  }

  for (const sheet of model.sheets) {
    const sheetPath = [sheet.name];
    if (sheetNames.has(sheet.name)) {
      diagnostics.push(diagnostic("error", `Duplicate sheet "${sheet.name}".`, sheetPath));
    }
    sheetNames.add(sheet.name);

    if (!sheet.blocks.length) {
      diagnostics.push(diagnostic("warning", `Sheet "${sheet.name}" does not contain any blocks.`, sheetPath));
    }

    const blockNames = new Set<string>();
    const blockByName = new Map<string, NtfBlock>();
    for (const block of sheet.blocks) {
      const blockPath = [sheet.name, block.name];
      if (blockNames.has(block.name)) {
        diagnostics.push(diagnostic("error", `Duplicate block "${block.name}" in sheet "${sheet.name}".`, blockPath));
      }
      blockNames.add(block.name);
      blockByName.set(block.name, block);

      if (isTableBlock(block.name)) {
        analyzeTableBlock(sheet, block, diagnostics);
      } else if (isRawRowsBlock(block.name)) {
        analyzeRawRowsBlock(sheet, block, diagnostics);
      } else if (!block.raw) {
        diagnostics.push(diagnostic("warning", `Block "${block.name}" has no readable content.`, blockPath));
      }
    }
    analyzeTestShotReferences(sheet, blockByName, diagnostics);
  }
  return diagnostics;
}

function analyzeTableBlock(sheet: NtfSheet, block: NtfBlock, diagnostics: NtfDiagnostic[]): void {
  const blockPath = [sheet.name, block.name];
  if (!block.rows.length) {
    diagnostics.push(diagnostic("warning", `Table block "${block.name}" has no rows.`, blockPath));
    return;
  }

  const cols = columns(block);
  if (block.name === "LIST_MAP=testShots") {
    for (const required of ["no", "description"]) {
      if (!cols.includes(required)) {
        diagnostics.push(diagnostic("error", `LIST_MAP=testShots is missing required column "${required}".`, blockPath));
      }
    }
  }

  (block.rows as TableRow[]).forEach((row, index) => {
    const rowPath = blockPath.concat(String(index));
    if (!Object.keys(row).length) {
      diagnostics.push(diagnostic("warning", `Row ${index + 1} in "${block.name}" has no cells.`, rowPath));
    }
    for (const col of cols) {
      if (!Object.hasOwn(row, col)) {
        diagnostics.push(diagnostic("warning", `Row ${index + 1} in "${block.name}" is missing column "${col}".`, rowPath.concat(col)));
      }
    }
  });
}

function analyzeRawRowsBlock(sheet: NtfSheet, block: NtfBlock, diagnostics: NtfDiagnostic[]): void {
  if (!block.rows.length) {
    diagnostics.push(diagnostic("warning", `Raw rows block "${block.name}" has no rows.`, [sheet.name, block.name]));
    return;
  }
  const width = (block.rows[0] as RawRow).length;
  (block.rows as RawRow[]).forEach((row, index) => {
    if (row.length !== width) {
      diagnostics.push(diagnostic(
        "warning",
        `Row ${index + 1} in "${block.name}" has ${row.length} cells; expected ${width}.`,
        [sheet.name, block.name, String(index)]
      ));
    }
  });
}

function analyzeTestShotReferences(
  sheet: NtfSheet,
  blockByName: Map<string, NtfBlock>,
  diagnostics: NtfDiagnostic[]
): void {
  const testShots = blockByName.get("LIST_MAP=testShots");
  if (!testShots || !testShots.rows.length) {
    return;
  }
  const referenceRules = [
    { column: "setUpTable", prefix: "SETUP_TABLE" },
    { column: "expectedTable", prefix: "EXPECTED_TABLE" },
    { column: "expectedFile", prefix: "EXPECTED_VARIABLE" },
    { column: "expectedFixedFile", prefix: "EXPECTED_FIXED" },
  ];

  (testShots.rows as TableRow[]).forEach((row, index) => {
    for (const rule of referenceRules) {
      const value = row[rule.column];
      if (value === null || value === undefined || String(value).trim() === "") {
        continue;
      }
      const ref = String(value).trim();
      if (!hasNumberedBlock(blockByName, rule.prefix, ref)) {
        diagnostics.push(diagnostic(
          "warning",
          `testShots row ${index + 1} references ${rule.column}="${ref}", but ${rule.prefix}[${ref}]=... is not defined in sheet "${sheet.name}".`,
          [sheet.name, "LIST_MAP=testShots", String(index), rule.column]
        ));
      }
    }
  });
}

function hasNumberedBlock(blockByName: Map<string, NtfBlock>, prefix: string, number: string): boolean {
  const re = new RegExp("^" + escapeRegExp(prefix) + "\\[" + escapeRegExp(number) + "\\]=");
  for (const name of blockByName.keys()) {
    if (re.test(name)) {
      return true;
    }
  }
  return false;
}

function diagnostic(severity: "error" | "warning", message: string, path: string[]): NtfDiagnostic {
  return { severity, message, path };
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Serializer ─────────────────────────────────────────────────────────────

export function serializeYaml(model: NtfYamlModel): string {
  const out: string[] = [];
  for (const sheet of model.sheets) {
    out.push(sheet.name + ":");
    for (const block of sheet.blocks) {
      out.push("  " + block.name + ": #" + (block.kind || inferKind(block.name)));
      if (isTableBlock(block.name)) {
        const cols = columns(block);
        for (const row of block.rows as TableRow[]) {
          out.push("    - " + key(cols[0]) + ": " + quote(Object.hasOwn(row, cols[0]) ? row[cols[0]] : ""));
          for (const col of cols.slice(1)) {
            out.push("      " + key(col) + ": " + quote(Object.hasOwn(row, col) ? row[col] : ""));
          }
        }
      } else if (isRawRowsBlock(block.name)) {
        for (const row of block.rows as RawRow[]) {
          const cells = row.map(quote);
          out.push("    - [ " + cells.join(", ") + " ]");
        }
      } else if (block.raw) {
        for (const rawLine of block.raw.split("\n")) {
          out.push("    " + rawLine);
        }
      }
      out.push("");
    }
  }
  return out.join("\n").replace(/\n+$/, "\n");
}
