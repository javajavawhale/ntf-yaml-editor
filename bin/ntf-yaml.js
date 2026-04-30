#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  analyzeYaml,
  parseYaml,
  serializeYaml
} = require("../lib/ntfYamlModel");

function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "lint") {
    return lint(args);
  }
  if (command === "format") {
    return format(args);
  }
  if (command === "convert") {
    return convert(args);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  return 2;
}

function convert(args, deps = defaultDeps()) {
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
    : result.stdout;
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

function parseConvertArgs(args) {
  const options = { source: "", output: "", lint: false };
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

function selectConverter(source) {
  const ext = path.extname(source).toLowerCase();
  if (ext === ".xlsx") return "xlsx_to_ntf_yaml.py";
  if (ext === ".xls") return "xls_to_ntf_yaml.py";
  return "";
}

function defaultDeps() {
  return {
    resolveTool(name) {
      return path.resolve(__dirname, "..", "..", "tools", name);
    },
    runPython(args) {
      return spawnSync("python3", args, { encoding: "utf8" });
    }
  };
}

function lint(args) {
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

function format(args) {
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

function printHelp() {
  const name = path.basename(process.argv[1] || "ntf-yaml");
  console.log([
    `Usage: ${name} <command> [args]`,
    "",
    "Commands:",
    "  convert <file.xls[x]> [-o file.yaml] [--lint]",
    "                       Convert Excel NTF data to YAML.",
    "  lint <file...>       Analyze NTF YAML files.",
    "  format [--write] <file>",
    "                       Re-serialize NTF YAML through the shared model."
  ].join("\n"));
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = { main, convert, parseConvertArgs, selectConverter };
