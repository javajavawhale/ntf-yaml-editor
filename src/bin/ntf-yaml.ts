#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { spawnSync, SpawnSyncReturns } from "child_process";
import { analyzeYaml, parseYaml, serializeYaml } from "../lib/ntfYamlModel";
import { diffGitRefs } from "../lib/ntfYamlGitDiffContext";
import { writeSummaryHtmlReport } from "../lib/ntfYamlDiffHtml";

// tsc compiles this to out/bin/ntf-yaml.js (__dirname = <project>/out/bin).
// Go two levels up to reach the project root where tools/ lives.
const PROJECT_ROOT = path.resolve(__dirname, "../..");

interface Deps {
  resolveTool(name: string): string;
  runPython(args: string[]): SpawnSyncReturns<string>;
}

export function main(argv: string[]): number {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (command === "lint") return lint(args);
  if (command === "format") return format(args);
  if (command === "convert") return convert(args);
  if (command === "diff") return diff(args);

  console.error(`Unknown command: ${command}`);
  printHelp();
  return 2;
}

interface DiffArgs {
  baseRef: string;
  headRef: string;
  output: string;
}

export function diff(args: string[]): number {
  const options = parseDiffArgs(args);
  if (!options.baseRef || !options.headRef) {
    console.error("diff requires --base <git-ref> and --head <git-ref>.");
    return 2;
  }
  const report = diffGitRefs({
    baseRef: options.baseRef,
    headRef: options.headRef,
    cwd: process.cwd(),
  });
  writeSummaryHtmlReport(report, options.output);
  console.log(`ntf-yaml diff: wrote ${options.output}`);
  return 0;
}

export function parseDiffArgs(args: string[]): DiffArgs {
  const options: DiffArgs = { baseRef: "", headRef: "", output: "ntf-yaml-diff.html" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--base") {
      options.baseRef = args[++i] || "";
    } else if (arg === "--head") {
      options.headRef = args[++i] || "";
    } else if (arg === "-o" || arg === "--output") {
      options.output = args[++i] || "";
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.output) {
    options.output = "ntf-yaml-diff.html";
  }
  return options;
}

interface ConvertArgs {
  source: string;
  output: string;
  lint: boolean;
}

export function convert(args: string[], deps: Deps = defaultDeps()): number {
  const options = parseConvertArgs(args);
  if (!options.source) {
    console.error("convert requires an Excel source file.");
    return 2;
  }
  const converter = selectConverter(options.source);
  if (!converter) {
    console.error(`Unsupported Excel file extension: ${options.source}`);
    return 2;
  }

  const script = deps.resolveTool(converter);
  if (!fs.existsSync(script)) {
    console.error(`Converter script is missing: ${script}`);
    return 2;
  }

  const runArgs = [script, options.source];
  if (options.output) {
    runArgs.push("-o", options.output);
  }
  const result = deps.runPython(runArgs);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result.status || 1;
  }
  if (result.stderr) process.stderr.write(result.stderr);

  const yamlText = options.output
    ? fs.readFileSync(options.output, "utf8")
    : result.stdout ?? "";
  if (!options.output) {
    process.stdout.write(yamlText);
  }

  if (options.lint) {
    const diagnostics = analyzeYaml(yamlText);
    for (const item of diagnostics) {
      const where = item.path?.length ? ` ${item.path.join(" > ")}` : "";
      console.error(`${options.output || options.source}:${item.severity}:${where} ${item.message}`);
    }
    const errorCount = diagnostics.filter(item => item.severity === "error").length;
    const warningCount = diagnostics.length - errorCount;
    if (errorCount || warningCount) {
      console.error(`ntf-yaml convert lint: ${errorCount} error(s), ${warningCount} warning(s)`);
    } else {
      console.error("ntf-yaml convert lint: ok");
    }
    return errorCount ? 1 : 0;
  }
  return 0;
}

export function parseConvertArgs(args: string[]): ConvertArgs {
  const options: ConvertArgs = { source: "", output: "", lint: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" || arg === "--output") {
      options.output = args[++i] || "";
    } else if (arg === "--lint") {
      options.lint = true;
    } else if (!options.source) {
      options.source = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

export function selectConverter(source: string): string {
  const ext = path.extname(source).toLowerCase();
  if (ext === ".xlsx") return "xlsx_to_ntf_yaml.py";
  if (ext === ".xls") return "xls_to_ntf_yaml.py";
  return "";
}

function defaultDeps(): Deps {
  return {
    resolveTool(name: string): string {
      return path.resolve(PROJECT_ROOT, "tools", name);
    },
    runPython(args: string[]): SpawnSyncReturns<string> {
      return spawnSync("python3", args, { encoding: "utf8" });
    },
  };
}

function lint(args: string[]): number {
  if (!args.length) {
    console.error("lint requires at least one YAML file.");
    return 2;
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const file of args) {
    const text = fs.readFileSync(file, "utf8");
    const diagnostics = analyzeYaml(text);
    for (const item of diagnostics) {
      if (item.severity === "error") {
        errorCount++;
      } else {
        warningCount++;
      }
      const where = item.path?.length ? ` ${item.path.join(" > ")}` : "";
      console.log(`${file}:${item.severity}:${where} ${item.message}`);
    }
  }

  if (errorCount || warningCount) {
    console.log(`ntf-yaml lint: ${errorCount} error(s), ${warningCount} warning(s)`);
  } else {
    console.log("ntf-yaml lint: ok");
  }
  return errorCount ? 1 : 0;
}

function format(args: string[]): number {
  const write = args[0] === "--write";
  const file = write ? args[1] : args[0];
  if (!file) {
    console.error("format requires a YAML file.");
    return 2;
  }

  const text = fs.readFileSync(file, "utf8");
  const formatted = serializeYaml(parseYaml(text));
  if (write) {
    fs.writeFileSync(file, formatted);
  } else {
    process.stdout.write(formatted);
  }
  return 0;
}

function printHelp(): void {
  const name = path.basename(process.argv[1] || "ntf-yaml");
  console.log([
    `Usage: ${name} <command> [args]`,
    "",
    "Commands:",
    "  convert <file.xls[x]> [-o file.yaml] [--lint]",
    "                       Convert Excel NTF data to YAML.",
    "  lint <file...>       Analyze NTF YAML files.",
    "  format [--write] <file>",
    "                       Re-serialize NTF YAML through the shared model.",
    "  diff --base <ref> --head <ref> [-o file.html]",
    "                       Generate a local cell diff HTML report.",
  ].join("\n"));
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 2;
  }
}
