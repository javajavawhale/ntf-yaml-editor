#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
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

  console.error(`Unknown command: ${command}`);
  printHelp();
  return 2;
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
    "  lint <file...>       Analyze NTF YAML files.",
    "  format [--write] <file>",
    "                       Re-serialize NTF YAML through the shared model."
  ].join("\n"));
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
