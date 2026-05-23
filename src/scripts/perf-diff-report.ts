#!/usr/bin/env node

import { performance } from "perf_hooks";
import { createDiffReport } from "../lib/ntfYamlDiff";

interface PerfOptions {
  rows: number[];
  repeat: number;
  scenarios: string[];
}

function parseArgs(argv: string[]): PerfOptions {
  const options: PerfOptions = {
    rows: [1000, 5000, 10000, 15000],
    repeat: 1,
    scenarios: ["tail-change", "middle-delete", "all-changed"],
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--rows") {
      const value = String(argv[++index] || "").trim();
      options.rows = value
        .split(",")
        .map(item => Number(item.trim()))
        .filter(item => Number.isInteger(item) && item > 0);
    } else if (arg === "--repeat") {
      const value = Number(argv[++index] || "");
      if (Number.isInteger(value) && value > 0) {
        options.repeat = value;
      }
    } else if (arg === "--scenarios") {
      const value = String(argv[++index] || "").trim();
      options.scenarios = value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log([
    "Usage: node scripts/perf-diff-report.js [options]",
    "",
    "Options:",
    "  --rows 1000,5000,10000     Row counts to benchmark (default: 1000,5000,10000,15000)",
    "  --repeat 3                  Repetitions per scenario (default: 1)",
    "  --scenarios a,b,c           Scenario list (tail-change,middle-delete,all-changed)",
    "  -h, --help                  Show this help",
  ].join("\n"));
}

interface Row {
  no: string;
  value: string;
}

function makeBaseRows(count: number): Row[] {
  const rows = new Array<Row>(count);
  for (let index = 0; index < count; index++) {
    const no = String(index + 1);
    rows[index] = { no, value: `value-${no}` };
  }
  return rows;
}

function cloneRows(rows: Row[]): Row[] {
  return rows.map(row => ({ no: row.no, value: row.value }));
}

function makeHeadRows(baseRows: Row[], scenario: string): Row[] {
  const rows = cloneRows(baseRows);
  if (scenario === "tail-change") {
    const lastIndex = rows.length - 1;
    rows[lastIndex] = { ...rows[lastIndex], value: rows[lastIndex].value + "-changed" };
    return rows;
  }
  if (scenario === "middle-delete") {
    const middle = Math.floor(rows.length / 2);
    rows.splice(middle, 1);
    return rows;
  }
  if (scenario === "all-changed") {
    for (let index = 0; index < rows.length; index++) {
      rows[index] = { no: rows[index].no, value: `changed-${rows[index].no}` };
    }
    return rows;
  }
  throw new Error(`Unsupported scenario: ${scenario}`);
}

function rowsToYaml(rows: Row[]): string {
  const out = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
  ];
  for (const row of rows) {
    out.push(`    - no: "${row.no}"`);
    out.push(`      value: "${escapeYamlDoubleQuote(row.value)}"`);
  }
  out.push("");
  return out.join("\n");
}

function escapeYamlDoubleQuote(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

interface MeasureResult {
  elapsedMs: number;
  rssDeltaMb: number;
  changedRows: number;
  addedRows: number;
  deletedRows: number;
}

function measureOnce(baseText: string, headText: string): MeasureResult {
  if ((global as Record<string, unknown>)["gc"]) {
    ((global as Record<string, unknown>)["gc"] as () => void)();
  }
  const rssBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  const report = createDiffReport({
    path: "perf.ntf.yaml",
    baseRef: "base",
    headRef: "head",
    baseText,
    headText,
  });
  const elapsedMs = performance.now() - startedAt;
  const rssAfter = process.memoryUsage().rss;
  return {
    elapsedMs,
    rssDeltaMb: (rssAfter - rssBefore) / (1024 * 1024),
    changedRows: report.summary.rows.changed,
    addedRows: report.summary.rows.added,
    deletedRows: report.summary.rows.deleted,
  };
}

interface FormatRowArgs extends MeasureResult {
  rows: number;
  scenario: string;
  repeat: number;
}

function formatRow(result: FormatRowArgs): string {
  return [
    String(result.rows).padStart(6),
    result.scenario.padEnd(14),
    String(result.repeat).padStart(2),
    result.elapsedMs.toFixed(2).padStart(10),
    result.rssDeltaMb.toFixed(2).padStart(10),
    String(result.changedRows).padStart(8),
    String(result.addedRows).padStart(8),
    String(result.deletedRows).padStart(8),
  ].join("  ");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  console.log("NTF YAML diff performance benchmark");
  console.log(`node: ${process.version}`);
  console.log("run with --expose-gc for cleaner memory deltas");
  console.log("");
  console.log(" rows  scenario          rp   elapsedMs    rssDelta    changed     added   deleted");
  console.log("-----  --------------  ---  ----------  ----------  --------  --------  --------");

  for (const rowCount of options.rows) {
    const baseRows = makeBaseRows(rowCount);
    for (const scenario of options.scenarios) {
      const headRows = makeHeadRows(baseRows, scenario);
      const baseText = rowsToYaml(baseRows);
      const headText = rowsToYaml(headRows);
      for (let repeat = 1; repeat <= options.repeat; repeat++) {
        const measured = measureOnce(baseText, headText);
        console.log(formatRow({ rows: rowCount, scenario, repeat, ...measured }));
      }
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
