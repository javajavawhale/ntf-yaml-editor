const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const JSZip = require("jszip");

const {
  analyzeYaml,
  parseYaml,
  serializeYaml,
  inferKind,
  isRawRowsBlock,
  isTableBlock,
  isKnownRawBlock,
  blockPrefixes
} = require("../out/lib/ntfYamlModel");
const {
  convert,
  main: runCli,
  parseDiffArgs,
  selectConverter
} = require("../out/bin/ntf-yaml");
const {
  createDiffReport,
} = require("../out/lib/ntfYamlDiff");
const { renderSummaryHtmlReport } = require("../out/lib/ntfYamlDiffHtml");
const {
  createDocumentDiffReport,
  createRefDiffReport,
  diffWorkingTreeAllFiles,
  parseGitQuery
} = require("../out/lib/ntfYamlGitDiffContext");

const extensionRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionRoot, "..");
const sampleFixtures = {
  webProjectAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-action-request.ntf.yaml"),
  webProjectBulkAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-bulk-action-request.ntf.yaml"),
  batchImportZipCodeDataFormat: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "batch-import-zip-code-data-format-action-request.ntf.yaml"),
  restProjectAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "rest-project-action.ntf.yaml"),
  webProjectForm: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-form.ntf.yaml")
};

function readSampleFixture(name) {
  return fs.readFileSync(sampleFixtures[name], "utf8");
}

function getBlock(model, sheetName, blockName) {
  const sheet = model.sheets.find(item => item.name === sheetName);
  assert.ok(sheet, `sheet ${sheetName} should exist`);
  const block = sheet.blocks.find(item => item.name === blockName);
  assert.ok(block, `block ${blockName} should exist`);
  return block;
}

function columnName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

async function writeXlsxFixture(file, sheets) {
  const zip = new JSZip();
  const sharedStrings = [];
  const sharedIndex = new Map();

  function shared(value) {
    const text = String(value);
    if (!sharedIndex.has(text)) {
      sharedIndex.set(text, sharedStrings.length);
      sharedStrings.push(text);
    }
    return sharedIndex.get(text);
  }

  zip.file("[Content_Types].xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join(""),
    "</Types>"
  ].join(""));
  zip.folder("_rels").file(".rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>"
  ].join(""));
  zip.folder("xl").file("workbook.xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join(""),
    "</sheets>",
    "</workbook>"
  ].join(""));
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join(""),
    '<Relationship Id="rIdShared" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
    "</Relationships>"
  ].join(""));

  const worksheets = zip.folder("xl").folder("worksheets");
  sheets.forEach((sheet, sheetIndex) => {
    const rows = sheet.rows.map((row, rowIndex) => {
      const cells = row.map((value, colIndex) => {
        const ref = `${columnName(colIndex)}${rowIndex + 1}`;
        return `<c r="${ref}" t="s"><v>${shared(value)}</v></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    worksheets.file(`sheet${sheetIndex + 1}.xml`, [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      `<sheetData>${rows}</sheetData>`,
      "</worksheet>"
    ].join(""));
  });

  zip.folder("xl").file("sharedStrings.xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`,
    sharedStrings.map(value => `<si><t>${escapeXml(value)}</t></si>`).join(""),
    "</sst>"
  ].join(""));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(file, buffer);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hasPythonModule(name) {
  return spawnSync("python3", ["-c", `import ${name}`], { encoding: "utf8" }).status === 0;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function writeXlsFixture(file) {
  const script = [
    "import sys, xlwt",
    "book = xlwt.Workbook()",
    "sheet = book.add_sheet('case1')",
    "rows = [",
    "  ['LIST_MAP=testShots'],",
    "  ['no', 'description', 'expectedTable'],",
    "  ['1', 'legacy xls case', '1'],",
    "  ['EXPECTED_TABLE[1]=PROJECT'],",
    "  ['PROJECT_ID', 'PROJECT_NAME'],",
    "  ['1', 'Project from xls'],",
    "]",
    "for r, row in enumerate(rows):",
    "  for c, value in enumerate(row):",
    "    sheet.write(r, c, value)",
    "book.save(sys.argv[1])"
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("classifies editable table and raw-row blocks", () => {
  assert.equal(isTableBlock("LIST_MAP=testShots"), true);
  assert.equal(isTableBlock("SETUP_TABLE[1]=PROJECT"), true);
  assert.equal(isTableBlock("EXPECTED_TABLE=PROJECT"), true);
  assert.equal(isTableBlock("EXPECTED_COMPLETE_TABLE=PROJECT"), true);
  assert.equal(isRawRowsBlock("SETUP_VARIABLE[1]=work/input.csv"), true);
  assert.equal(isRawRowsBlock("EXPECTED_VARIABLE=./tmp/result.csv"), true);
  assert.equal(isRawRowsBlock("SETUP_FIXED[1]=work/input.dat"), true);
  assert.equal(isRawRowsBlock("EXPECTED_FIXED[1]=./tmp/result.dat"), true);
  assert.equal(isTableBlock("RESPONSE_BODY_MESSAGES=response"), true);
});

test("classifies all supported NTF block prefixes", () => {
  assert.deepEqual(blockPrefixes, [
    "SETUP_TABLE",
    "EXPECTED_TABLE",
    "EXPECTED_COMPLETE_TABLE",
    "LIST_MAP",
    "SETUP_VARIABLE",
    "EXPECTED_VARIABLE",
    "SETUP_FIXED",
    "EXPECTED_FIXED"
  ]);

  assert.equal(inferKind("SETUP_TABLE=PROJECT"), "ListMap");
  assert.equal(inferKind("EXPECTED_COMPLETE_TABLE[1]=PROJECT"), "ListMap");
  assert.equal(inferKind("SETUP_VARIABLE[1]=work/input.csv"), "RawRows");
  assert.equal(inferKind("EXPECTED_VARIABLE=./tmp/result.csv"), "RawRows");
  assert.equal(inferKind("SETUP_FIXED[1]=work/input.dat"), "RawRows");
  assert.equal(inferKind("EXPECTED_FIXED[1]=./tmp/result.dat"), "RawRows");

  for (const name of [
    "EXPECTED_REQUEST_HEADER_MESSAGES=req01",
    "EXPECTED_REQUEST_BODY_MESSAGES=req01",
    "RESPONSE_HEADER_MESSAGES=req01",
    "RESPONSE_BODY_MESSAGES=req01"
  ]) {
    assert.equal(isKnownRawBlock(name), false);
    assert.equal(inferKind(name), "ListMap");
    assert.equal(isTableBlock(name), true);
  }

  assert.equal(isKnownRawBlock("MESSAGE=2"), false);
  assert.equal(inferKind("MESSAGE=2"), "ListMap");
});

test("parses sheet, table rows, and quoted special keys", () => {
  const yaml = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - \"[no]\": \"1\"",
    "      form.projectName: \"プロジェクト００１\"",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "case1", "LIST_MAP=requestParams");

  assert.deepEqual(block.rows, [
    {
      "[no]": "1",
      "form.projectName": "プロジェクト００１"
    }
  ]);
});

test("serializes special keys quoted so YAML does not reinterpret them", () => {
  const yaml = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - \"[no]\": \"1\"",
    ""
  ].join("\n");

  const serialized = serializeYaml(parseYaml(yaml));

  assert.match(serialized, /    - "\[no\]": "1"/);
});

test("preserves YAML null sentinel cells used by empty table column definitions", () => {
  const yaml = [
    "setUpDb:",
    "  SETUP_TABLE=PROJECT: #ListMap",
    "    - PROJECT_ID: ~",
    "      PROJECT_NAME: ~",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "setUpDb", "SETUP_TABLE=PROJECT");

  assert.deepEqual(block.rows, [
    {
      PROJECT_ID: null,
      PROJECT_NAME: null
    }
  ]);
  assert.match(serializeYaml(model), /PROJECT_ID: ~\n      PROJECT_NAME: ~/);
});

test("keeps empty string cells distinct from YAML null cells", () => {
  const yaml = [
    "case1:",
    "  LIST_MAP=row: #ListMap",
    "    - emptyString: \"\"",
    "      nullCell: ~",
    ""
  ].join("\n");

  const serialized = serializeYaml(parseYaml(yaml));

  assert.match(serialized, /emptyString: ""/);
  assert.match(serialized, /nullCell: ~/);
});

test("preserves empty table blocks with no rows", () => {
  const yaml = [
    "setUpDb:",
    "  SETUP_TABLE=PROJECT: #ListMap",
    "",
    "case1:",
    "  LIST_MAP=testShots: #ListMap",
    "    - no: \"1\"",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "setUpDb", "SETUP_TABLE=PROJECT");
  const serialized = serializeYaml(model);

  assert.deepEqual(block.rows, []);
  assert.match(serialized, /setUpDb:\n  SETUP_TABLE=PROJECT: #ListMap\n\ncase1:/);
});

test("preserves Japanese, long text, commas, quotes, and backslashes in table cells", () => {
  const longText = "説明".repeat(80) + ", comma, \"quote\", C:\\tmp\\result.csv";
  const yaml = [
    "case1:",
    "  LIST_MAP=testShots: #ListMap",
    `    - description: "${longText.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`,
    "      expectedStatusCode: \"200\"",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "case1", "LIST_MAP=testShots");
  const serialized = serializeYaml(model);

  assert.equal(block.rows[0].description, longText);
  assert.match(serialized, /説明説明説明/);
  assert.match(serialized, /, comma,/);
  assert.match(serialized, /\\"quote\\"/);
  assert.match(serialized, /C:\\\\tmp\\\\result\.csv/);
});

test("parses and serializes RawRows variable blocks", () => {
  const yaml = [
    "case1:",
    "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
    "    - [ \"001\", \"東京,港区\", \"A\\\"B\", ~ ]",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "case1", "EXPECTED_VARIABLE=./tmp/result.csv");

  assert.deepEqual(block.rows, [["001", "東京,港区", "A\"B", null]]);
  assert.match(serializeYaml(model), /    - \[ "001", "東京,港区", "A\\"B", ~ \]/);
});

test("parses multiline RawRows arrays without synthetic blank cells", () => {
  const yaml = [
    "case1:",
    "  SETUP_VARIABLE[1]=data.csv: #RawRows",
    "    - [",
    "        \"header\",",
    "        \"recordKbn\",",
    "        \"zipCode\",",
    "      ]",
    "    - [",
    "        \"\",",
    "        \"1\",",
    "        \"0600000\",",
    "      ]",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "case1", "SETUP_VARIABLE[1]=data.csv");

  assert.deepEqual(block.rows[0], ["header", "recordKbn", "zipCode"]);
  assert.deepEqual(block.rows[1], ["", "1", "0600000"]);
});

test("parses and serializes fixed-length blocks as editable file rows", () => {
  const yaml = [
    "case1:",
    "  EXPECTED_FIXED[1]=./path/to/fixedFile: #FixedLengthFile",
    "    - [ \"text-encoding\", \"ms932\" ]",
    "    - [ \"record-length\", \"12\" ]",
    "    - [ \"data\", \"001\", \"東京\" ]",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "case1", "EXPECTED_FIXED[1]=./path/to/fixedFile");

  assert.deepEqual(block.rows, [
    ["text-encoding", "ms932"],
    ["record-length", "12"],
    ["data", "001", "東京"]
  ]);
  block.rows[2][2] = "大阪";
  assert.match(serializeYaml(model), /EXPECTED_FIXED\[1\]=\.\/path\/to\/fixedFile: #FixedLengthFile/);
  assert.match(serializeYaml(model), /    - \[ "data", "001", "大阪" \]/);
});

test("loads representative sample fixtures and keeps key editor targets", () => {
  const model = parseYaml(readSampleFixture("webProjectAction"));
  const serialized = serializeYaml(model);

  assert.deepEqual(model.sheets.map(sheet => sheet.name), ["confirmOfCreateNormal", "sheetAdded"]);
  assert.ok(getBlock(model, "confirmOfCreateNormal", "LIST_MAP=testShots"));
  assert.ok(getBlock(model, "confirmOfCreateNormal", "LIST_MAP=requestParams"));
  assert.match(serialized, /"\[no\]": "1"/);
});

test("representative fixtures round-trip to a stable canonical model shape", () => {
  for (const [name, file] of Object.entries(sampleFixtures)) {
    const original = fs.readFileSync(file, "utf8");
    const canonical = serializeYaml(parseYaml(original));
    const reparsed = serializeYaml(parseYaml(canonical));
    const model = parseYaml(canonical);

    assert.equal(reparsed, canonical, `${name} should be canonical after one serialization`);
    assert.ok(model.sheets.length > 0, `${name} should keep sheets`);
    assert.ok(model.sheets.every(sheet => sheet.blocks.length > 0), `${name} should keep blocks on every sheet`);
    assert.ok(
      model.sheets.some(sheet => sheet.blocks.some(block => block.rows?.length || block.raw)),
      `${name} should keep readable block content`
    );
  }
});

test("loads the migrated web fixture and preserves null sentinel rows", () => {
  const serialized = serializeYaml(parseYaml(readSampleFixture("webProjectBulkAction")));

  assert.match(serialized, /PROJECT_ID: ~/);
  assert.match(serialized, /"\[no\]": "1"/);
});

test("loads sample fixture variants across web, batch, rest, and form YAML", () => {
  const webAction = parseYaml(readSampleFixture("webProjectBulkAction"));
  assert.ok(getBlock(webAction, "setUpDb", "SETUP_TABLE=PROJECT"));
  assert.ok(getBlock(webAction, "updateNormal", "EXPECTED_TABLE[1]=PROJECT"));

  const batchAction = parseYaml(readSampleFixture("batchImportZipCodeDataFormat"));
  assert.ok(getBlock(batchAction, "testNormalEnd", "SETUP_VARIABLE[1]=work/test/importZipCode/importZipCode_by_format.csv"));
  assert.ok(getBlock(batchAction, "testNormalEnd", "EXPECTED_TABLE[1]=ZIP_CODE_DATA"));

  const restAction = parseYaml(readSampleFixture("restProjectAction"));
  assert.ok(getBlock(restAction, "プロジェクトを新規登録できること", "EXPECTED_TABLE=PROJECT"));
  assert.ok(!restAction.sheets[0].blocks.find(b => b.name === "SETUP_TABLE=PROJECT"), "SETUP_TABLE=PROJECT should not exist in modified fixture");

  const webForm = parseYaml(readSampleFixture("webProjectForm"));
  assert.ok(getBlock(webForm, "testCharsetAndLength", "LIST_MAP=charsetAndLength"));
  assert.ok(getBlock(webForm, "testSingleValidation", "LIST_MAP=singleValidation"));
});

test("analyzes missing required testShots columns and missing references", () => {
  const diagnostics = analyzeYaml([
    "case1:",
    "  LIST_MAP=testShots: #ListMap",
    "    - no: \"1\"",
    "      setUpTable: \"1\"",
    ""
  ].join("\n"));

  assert.ok(
    diagnostics.some(item =>
      item.severity === "error" &&
      item.message.includes('missing required column "description"')
    )
  );
  assert.ok(
    diagnostics.some(item =>
      item.severity === "warning" &&
      item.message.includes('setUpTable="1"') &&
      item.message.includes("SETUP_TABLE[1]")
    )
  );
});

test("does not warn when numbered testShots references are defined", () => {
  const diagnostics = analyzeYaml([
    "case1:",
    "  LIST_MAP=testShots: #ListMap",
    "    - no: \"1\"",
    "      description: \"ok\"",
    "      setUpTable: \"1\"",
    "      expectedTable: \"1\"",
    "  SETUP_TABLE[1]=PROJECT: #ListMap",
    "    - PROJECT_ID: \"1\"",
    "  EXPECTED_TABLE[1]=PROJECT: #ListMap",
    "    - PROJECT_ID: \"1\"",
    ""
  ].join("\n"));

  assert.deepEqual(diagnostics, []);
});

test("analyzes ragged raw rows", () => {
  const diagnostics = analyzeYaml([
    "case1:",
    "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
    "    - [ \"001\", \"Tokyo\" ]",
    "    - [ \"002\" ]",
    ""
  ].join("\n"));

  assert.ok(diagnostics.some(item => item.message.includes("has 1 cells; expected 2")));
});

test("CLI lint exits non-zero for errors and zero for warning-only diagnostics", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-cli-test-"));
  const badFile = path.join(dir, "bad-lint.yaml");
  const warningFile = path.join(dir, "warning-lint.yaml");
  fs.writeFileSync(badFile, [
    "case1:",
    "  LIST_MAP=testShots: #ListMap",
    "    - no: \"1\"",
    ""
  ].join("\n"));
  fs.writeFileSync(warningFile, [
    "case1:",
    "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
    "    - [ \"001\", \"Tokyo\" ]",
    "    - [ \"002\" ]",
    ""
  ].join("\n"));

  assert.equal(runCli(["lint", badFile]), 1);
  assert.equal(runCli(["lint", warningFile]), 0);
});

test("CLI convert converts xlsx through the existing converter and lint pipeline", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-convert-test-"));
  const source = path.join(dir, "request.xlsx");
  const output = path.join(dir, "request.yaml");

  await writeXlsxFixture(source, [
    {
      name: "case1",
      rows: [
        ["LIST_MAP=testShots"],
        ["no", "description", "setUpTable"],
        ["1", "normal case", "1"],
        ["SETUP_TABLE[1]=PROJECT"],
        ["PROJECT_ID", "PROJECT_NAME"],
        ["1", "Project A"]
      ]
    }
  ]);

  assert.equal(runCli(["convert", source, "-o", output, "--lint"]), 0);

  const yaml = fs.readFileSync(output, "utf8");
  assert.match(yaml, /case1:/);
  assert.match(yaml, /LIST_MAP=testShots: #ListMap/);
  assert.match(yaml, /SETUP_TABLE\[1\]=PROJECT: #ListMap/);
  assert.deepEqual(analyzeYaml(yaml), []);
});

test("CLI convert supports xls by dispatching to the xls converter", () => {
  assert.equal(selectConverter("legacy.xls"), "xls_to_ntf_yaml.py");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-xls-dispatch-test-"));
  const output = path.join(dir, "legacy.yaml");
  const calls = [];
  const status = convert(["legacy.xls", "-o", output, "--lint"], {
    resolveTool(name) {
      calls.push(["resolve", name]);
      return __filename;
    },
    runPython(args) {
      calls.push(["run", args]);
      fs.writeFileSync(output, [
        "case1:",
        "  LIST_MAP=testShots: #ListMap",
        "    - no: \"1\"",
        "      description: \"ok\"",
        ""
      ].join("\n"));
      return {
        status: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(status, 0);
  assert.deepEqual(calls[0], ["resolve", "xls_to_ntf_yaml.py"]);
  assert.equal(calls[1][1][1], "legacy.xls");
  assert.equal(calls[1][1][3], output);
});

test("CLI convert converts real xls files through the xlrd converter", { skip: !hasPythonModule("xlwt") }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-real-xls-test-"));
  const source = path.join(dir, "legacy.xls");
  const output = path.join(dir, "legacy.yaml");
  writeXlsFixture(source);

  assert.equal(runCli(["convert", source, "-o", output, "--lint"]), 0);

  const yaml = fs.readFileSync(output, "utf8");
  assert.match(yaml, /case1:/);
  assert.match(yaml, /LIST_MAP=testShots: #ListMap/);
  assert.match(yaml, /EXPECTED_TABLE\[1\]=PROJECT: #ListMap/);
  assert.deepEqual(analyzeYaml(yaml), []);
});

test("CLI convert rejects unsupported files, missing converters, and converter failures", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-convert-errors-"));
  const missingScript = path.join(dir, "missing.py");

  assert.equal(convert(["data.csv"], {
    resolveTool() {
      throw new Error("should not resolve converter for unsupported files");
    },
    runPython() {
      throw new Error("should not run converter for unsupported files");
    }
  }), 2);

  assert.equal(convert(["legacy.xls"], {
    resolveTool() {
      return missingScript;
    },
    runPython() {
      throw new Error("should not run missing converter");
    }
  }), 2);

  assert.equal(convert(["legacy.xls"], {
    resolveTool() {
      return __filename;
    },
    runPython() {
      return {
        status: 7,
        stdout: "partial output\n",
        stderr: "converter failed\n"
      };
    }
  }), 7);
});

test("cell diff report highlights changed table cells and changed rows", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseRef: "main",
    headRef: "HEAD",
    baseSha: "111111111111",
    headSha: "222222222222",
    baseText: [
      "case1:",
      "  LIST_MAP=requestParams: #ListMap",
      "    - \"[no]\": \"1\"",
      "      name: \"before\"",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  LIST_MAP=requestParams: #ListMap",
      "    - \"[no]\": \"1\"",
      "      name: \"after\"",
      "      extra: \"new\"",
      ""
    ].join("\n")
  });

  assert.equal(report.summary.files.changed, 1);
  assert.equal(report.summary.rows.changed, 1);
  assert.equal(report.summary.cells.changed, 1);
  assert.equal(report.summary.cells.added, 1);

  const html = renderSummaryHtmlReport(report);
  assert.match(html, /NTF YAML Cell Diff/);
  assert.match(html, /before/);
  assert.match(html, /after/);
  assert.match(html, /extra/);
});

test("cell diff report exposes exact table row and cell status details", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "case1:",
      "  LIST_MAP=requestParams: #ListMap",
      "    - no: \"1\"",
      "      name: \"before\"",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  LIST_MAP=requestParams: #ListMap",
      "    - no: \"1\"",
      "      name: \"after\"",
      "      extra: \"new\"",
      ""
    ].join("\n")
  });

  const block = report.files[0].sheets[0].blocks[0];

  assert.deepEqual(block.columns, [
    { key: "no", label: "no" },
    { key: "name", label: "name" },
    { key: "extra", label: "extra" }
  ]);
  assert.deepEqual(block.rows, [{
    key: "0",
    status: "changed",
    headIndex: 0,
    cells: [
      { column: "no", status: "unchanged", before: "1", after: "1" },
      { column: "name", status: "changed", before: "before", after: "after" },
      { column: "extra", status: "added", before: undefined, after: "new" }
    ]
  }]);
});

test("cell diff report exposes RawRows columns and added row status", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "case1:",
      "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
      "    - [ \"001\", \"Tokyo\" ]",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
      "    - [ \"001\", \"Tokyo\" ]",
      "    - [ \"002\", \"Osaka\" ]",
      ""
    ].join("\n")
  });

  const block = report.files[0].sheets[0].blocks[0];

  assert.deepEqual(block.columns, [
    { key: "0", label: "0" },
    { key: "1", label: "1" }
  ]);
  assert.equal(block.rows.length, 1);
  assert.equal(block.rows[0].status, "added");
  assert.equal(block.rows[0].headIndex, 1);
});

test("cell diff report exposes exact RawRows cell values", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "case1:",
      "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
      "    - [ \"001\", \"Tokyo\" ]",
      "    - [ \"002\", \"Osaka\" ]",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
      "    - [ \"001\", \"Tokyo\" ]",
      "    - [ \"002\", \"Kyoto\" ]",
      "    - [ \"003\", \"Nara\" ]",
      ""
    ].join("\n")
  });

  const block = report.files[0].sheets[0].blocks[0];

  assert.deepEqual(block.rows, [
    {
      key: "1",
      status: "changed",
      headIndex: 1,
      cells: [
        { column: "0", status: "unchanged", before: "002", after: "002" },
        { column: "1", status: "changed", before: "Osaka", after: "Kyoto" }
      ]
    },
    {
      key: "2",
      status: "added",
      headIndex: 2,
      cells: [
        { column: "0", status: "added", before: undefined, after: "003" },
        { column: "1", status: "added", before: undefined, after: "Nara" }
      ]
    }
  ]);
});

test("cell diff report treats fixed-length blocks as file rows", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "case1:",
      "  EXPECTED_FIXED[1]=./tmp/result.dat: #FixedLengthFile",
      "    - [ \"text-encoding\", \"ms932\" ]",
      "    - [ \"record-length\", \"12\" ]",
      "    - [ \"data\", \"001\", \"Tokyo\" ]",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  EXPECTED_FIXED[1]=./tmp/result.dat: #FixedLengthFile",
      "    - [ \"text-encoding\", \"ms932\" ]",
      "    - [ \"record-length\", \"12\" ]",
      "    - [ \"data\", \"001\", \"Kyoto\" ]",
      "    - [ \"data\", \"002\", \"Nara\" ]",
      ""
    ].join("\n")
  });

  const block = report.files[0].sheets[0].blocks[0];

  assert.equal(block.kind, "FixedLengthFile");
  assert.deepEqual(block.columns, [
    { key: "0", label: "0" },
    { key: "1", label: "1" },
    { key: "2", label: "2" }
  ]);
  assert.equal(block.rows[0].status, "changed");
  assert.equal(block.rows[0].cells[2].before, "Tokyo");
  assert.equal(block.rows[0].cells[2].after, "Kyoto");
  assert.equal(block.rows[1].status, "added");
  assert.equal(block.rows[1].headIndex, 3);
});

test("cell diff report exposes deleted RawRows cell values", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "case1:",
      "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
      "    - [ \"id\", \"city\" ]",
      "    - [ \"001\", \"Tokyo\" ]",
      "    - [ \"002\", \"Osaka\" ]",
      "    - [ \"003\", \"Nara\" ]",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
      "    - [ \"id\", \"city\" ]",
      "    - [ \"001\", \"Tokyo\" ]",
      "    - [ \"003\", \"Nara\" ]",
      ""
    ].join("\n")
  });

  const block = report.files[0].sheets[0].blocks[0];
  const deletedRow = block.rows.find(row => row.status === "deleted");

  assert.deepEqual(deletedRow, {
    key: "2",
    status: "deleted",
    headIndex: null,
    cells: [
      { column: "0", status: "deleted", before: "002", after: undefined },
      { column: "1", status: "deleted", before: "Osaka", after: undefined }
    ]
  });
});

test("cell diff report preserves added and deleted sheet/block status", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "deletedSheet:",
      "  LIST_MAP=rows: #ListMap",
      "    - no: \"1\"",
      "      name: \"before\"",
      "",
      "changedSheet:",
      "  LIST_MAP=rows: #ListMap",
      "    - no: \"1\"",
      "      name: \"before\"",
      ""
    ].join("\n"),
    headText: [
      "changedSheet:",
      "  LIST_MAP=rows: #ListMap",
      "    - no: \"1\"",
      "      name: \"after\"",
      "",
      "  SETUP_TABLE=ADDED: #ListMap",
      "    - ID: \"1\"",
      "",
      "addedSheet:",
      "  LIST_MAP=rows: #ListMap",
      "    - no: \"1\"",
      "      name: \"after\"",
      ""
    ].join("\n")
  });
  const file = report.files[0];
  const sheets = Object.fromEntries(file.sheets.map(sheet => [sheet.name, sheet]));
  assert.equal(sheets.deletedSheet.status, "deleted");
  assert.equal(sheets.addedSheet.status, "added");
  assert.equal(sheets.changedSheet.status, "changed");
  assert.equal(sheets.changedSheet.blocks.find(block => block.name === "SETUP_TABLE=ADDED").status, "added");
});

test("document diff report compares working tree files against HEAD", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-document-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  fs.writeFileSync(file, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n"));
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);

  const headText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"after\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, headText);

  const report = createDocumentDiffReport({
    uri: { scheme: "file", fsPath: file },
    text: headText,
    workspaceFolder: dir
  });

  assert.equal(report.baseRef, "HEAD");
  assert.equal(report.headRef, "working tree");
  assert.equal(report.files[0].path, "case.ntf.yaml");
  assert.equal(report.summary.cells.changed, 1);
});

test("document diff report resolves the git root when workspace folder is not the repository root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-nested-git-root-"));
  const nested = path.join(dir, "sub", "module");
  fs.mkdirSync(nested, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(nested, "case.ntf.yaml");
  fs.writeFileSync(file, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n"));
  git(dir, ["add", "sub/module/case.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);

  const headText = fs.readFileSync(file, "utf8").replace("before", "after");
  fs.writeFileSync(file, headText);

  const report = createDocumentDiffReport({
    uri: { scheme: "file", fsPath: file },
    text: headText,
    workspaceFolder: nested
  });

  assert.equal(report.repositoryPath, dir);
  assert.equal(report.files[0].path, "sub/module/case.ntf.yaml");
  assert.equal(report.summary.cells.changed, 1);
});

test("document diff report compares git URI text against the working tree file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-git-uri-diff-"));
  const file = path.join(dir, "case.ntf.yaml");
  const baseText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n");
  const headText = baseText.replace("before", "after");
  fs.writeFileSync(file, headText);
  const query = encodeURIComponent(JSON.stringify({ path: file, ref: "HEAD" }));

  const report = createDocumentDiffReport({
    uri: { scheme: "git", fsPath: file, query },
    text: baseText,
    workspaceFolder: dir
  });

  assert.deepEqual(parseGitQuery(query), { path: file, ref: "HEAD" });
  assert.equal(report.baseRef, "HEAD");
  assert.equal(report.headRef, "working tree");
  assert.equal(report.summary.cells.changed, 1);
});

test("ref diff report compares a file between arbitrary git refs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-ref-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  fs.writeFileSync(file, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n"));
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);
  const baseSha = git(dir, ["rev-parse", "--short", "HEAD"]).trim();

  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("before", "after"));
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "head"]);
  const headSha = git(dir, ["rev-parse", "--short", "HEAD"]).trim();

  const report = createRefDiffReport({
    repositoryPath: dir,
    relativePath: "case.ntf.yaml",
    baseRef: baseSha,
    headRef: headSha
  });

  assert.equal(report.baseRef, baseSha);
  assert.equal(report.headRef, headSha);
  assert.equal(report.summary.cells.changed, 1);
});

test("ref diff report accepts working tree on the left side", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-left-working-tree-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  fs.writeFileSync(file, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n"));
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);
  const commitSha = git(dir, ["rev-parse", "--short", "HEAD"]).trim();

  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("before", "after"));

  const report = createRefDiffReport({
    repositoryPath: dir,
    relativePath: "case.ntf.yaml",
    baseRef: "working tree",
    headRef: commitSha
  });

  assert.equal(report.baseRef, "working tree");
  assert.equal(report.headRef, commitSha);
  assert.match(report.baseText, /after/);
  assert.match(report.headText, /before/);
  assert.equal(report.summary.cells.changed, 1);
});

test("ref diff report treats '~' as the git index and displays it as 'index'", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-index-ref-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const committedText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, committedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "initial"]);

  // Stage a modification (different from committed)
  const stagedText = committedText.replace("committed", "staged");
  fs.writeFileSync(file, stagedText);
  git(dir, ["add", "case.ntf.yaml"]);

  // Also modify working tree (different from staged)
  const worktreeText = committedText.replace("committed", "worktree");
  fs.writeFileSync(file, worktreeText);

  // "~" should read from the staging area and display as "index"
  const report = createRefDiffReport({
    repositoryPath: dir,
    relativePath: "case.ntf.yaml",
    baseRef: "~",
    headRef: "working tree"
  });

  assert.equal(report.baseRef, "index");
  assert.equal(report.headRef, "working tree");
  assert.match(report.baseText, /staged/);
  assert.match(report.headText, /worktree/);
  assert.equal(report.summary.cells.changed, 1);
});

test("ref diff report treats 'index' (display label) as the git index for re-querying", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-index-label-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const committedText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, committedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "initial"]);

  const stagedText = committedText.replace("committed", "staged");
  fs.writeFileSync(file, stagedText);
  git(dir, ["add", "case.ntf.yaml"]);

  const worktreeText = committedText.replace("committed", "worktree");
  fs.writeFileSync(file, worktreeText);

  // "index" (the display label returned by a previous createRefDiffReport with "~")
  // must also read from the staging area
  const report = createRefDiffReport({
    repositoryPath: dir,
    relativePath: "case.ntf.yaml",
    baseRef: "index",
    headRef: "working tree"
  });

  assert.equal(report.baseRef, "index");
  assert.equal(report.headRef, "working tree");
  assert.match(report.baseText, /staged/);
  assert.match(report.headText, /worktree/);
  assert.equal(report.summary.cells.changed, 1);
});

test("document diff report uses '~' git URI ref and displays it as 'index' when staged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-git-uri-index-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const committedText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, committedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "initial"]);

  const stagedText = committedText.replace("committed", "staged");
  fs.writeFileSync(file, stagedText);
  git(dir, ["add", "case.ntf.yaml"]);

  const worktreeText = committedText.replace("committed", "worktree");
  fs.writeFileSync(file, worktreeText);

  // VSCode's git extension passes ref="~" for the index side of the diff
  const query = encodeURIComponent(JSON.stringify({ path: file, ref: "~" }));
  const report = createDocumentDiffReport({
    uri: { scheme: "git", fsPath: file, query },
    text: worktreeText,
    workspaceFolder: dir,
    repositoryPath: dir
  });

  assert.equal(report.baseRef, "index");
  assert.equal(report.headRef, "working tree");
  assert.match(report.baseText, /staged/);
  assert.match(report.headText, /worktree/);
  assert.equal(report.summary.cells.changed, 1);
});

test("document diff report treats empty git URI ref as the staged index side", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-git-uri-empty-ref-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const committedText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, committedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "initial"]);

  const stagedText = committedText.replace("committed", "staged");
  fs.writeFileSync(file, stagedText);
  git(dir, ["add", "case.ntf.yaml"]);

  const worktreeText = committedText.replace("committed", "worktree");
  fs.writeFileSync(file, worktreeText);

  // VS Code's git extension uses ref="" for the right side of staged diffs.
  const query = JSON.stringify({ path: file, ref: "" });
  const report = createDocumentDiffReport({
    uri: { scheme: "git", fsPath: file, query },
    text: worktreeText,
    workspaceFolder: dir,
    repositoryPath: dir
  });

  assert.equal(report.baseRef, "HEAD");
  assert.equal(report.headRef, "index");
  assert.match(report.baseText, /committed/);
  assert.match(report.headText, /staged/);
  assert.doesNotMatch(report.headText, /worktree/);
  assert.equal(report.summary.cells.changed, 1);
});

test("document diff report refreshes stale empty-ref git URI against working tree after unstage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-git-uri-empty-ref-unstaged-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const committedText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, committedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "initial"]);

  const stagedText = committedText.replace("committed", "staged");
  fs.writeFileSync(file, stagedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["restore", "--staged", "case.ntf.yaml"]);

  const worktreeText = committedText.replace("committed", "worktree");
  fs.writeFileSync(file, worktreeText);

  const query = JSON.stringify({ path: file, ref: "" });
  const report = createDocumentDiffReport({
    uri: { scheme: "git", fsPath: file, query },
    text: stagedText,
    workspaceFolder: dir,
    repositoryPath: dir
  });

  assert.equal(report.baseRef, "HEAD");
  assert.equal(report.headRef, "working tree");
  assert.match(report.baseText, /committed/);
  assert.match(report.headText, /worktree/);
  assert.doesNotMatch(report.headText, /staged/);
  assert.equal(report.summary.cells.changed, 1);
});

test("document diff report compares HEAD git URI against index when staged changes exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-git-uri-head-index-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);
  const file = path.join(dir, "case.ntf.yaml");
  const committedText = [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n");
  fs.writeFileSync(file, committedText);
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "initial"]);

  const stagedText = committedText.replace("committed", "staged");
  fs.writeFileSync(file, stagedText);
  git(dir, ["add", "case.ntf.yaml"]);

  const worktreeText = committedText.replace("committed", "worktree");
  fs.writeFileSync(file, worktreeText);

  const query = JSON.stringify({ path: file, ref: "HEAD" });
  const report = createDocumentDiffReport({
    uri: { scheme: "git", fsPath: file, query },
    text: committedText,
    workspaceFolder: dir,
    repositoryPath: dir
  });

  assert.equal(report.baseRef, "HEAD");
  assert.equal(report.headRef, "index");
  assert.match(report.baseText, /committed/);
  assert.match(report.headText, /staged/);
  assert.doesNotMatch(report.headText, /worktree/);
  assert.equal(report.summary.cells.changed, 1);
});

test("working tree all-files diff reports modified, deleted, and untracked NTF YAML files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-all-files-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);

  const modified = path.join(dir, "modified.ntf.yaml");
  const deleted = path.join(dir, "deleted.ntf.yaml");
  fs.writeFileSync(modified, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n"));
  fs.writeFileSync(deleted, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"gone\"",
    ""
  ].join("\n"));
  git(dir, ["add", "modified.ntf.yaml", "deleted.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);

  fs.writeFileSync(modified, fs.readFileSync(modified, "utf8").replace("before", "after"));
  fs.unlinkSync(deleted);
  fs.writeFileSync(path.join(dir, "untracked.ntf.yaml"), [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"new\"",
    ""
  ].join("\n"));

  const reports = diffWorkingTreeAllFiles({
    repositoryPath: dir,
    baseRef: "HEAD",
    headRef: "working tree"
  }).filter(Boolean);
  const byPath = Object.fromEntries(reports.map(report => [report.files[0].path, report.files[0]]));

  assert.deepEqual(Object.keys(byPath).sort(), [
    "deleted.ntf.yaml",
    "modified.ntf.yaml",
    "untracked.ntf.yaml"
  ]);
  assert.equal(byPath["modified.ntf.yaml"].status, "changed");
  assert.equal(byPath["deleted.ntf.yaml"].status, "deleted");
  assert.equal(byPath["untracked.ntf.yaml"].status, "added");
});

test("working tree all-files diff preserves renamed NTF YAML paths and base content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-all-files-rename-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);

  fs.writeFileSync(path.join(dir, "old.ntf.yaml"), [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"before\"",
    ""
  ].join("\n"));
  git(dir, ["add", "old.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);

  git(dir, ["mv", "old.ntf.yaml", "new.ntf.yaml"]);
  fs.writeFileSync(path.join(dir, "new.ntf.yaml"), [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"after\"",
    ""
  ].join("\n"));

  const reports = diffWorkingTreeAllFiles({
    repositoryPath: dir,
    baseRef: "HEAD",
    headRef: "working tree"
  }).filter(Boolean);
  const report = reports.find(item => item.files[0].path === "new.ntf.yaml");

  assert.ok(report, "renamed file should be reported at the new path");
  assert.equal(report.files[0].oldPath, "old.ntf.yaml");
  assert.equal(report.files[0].status, "changed");
  assert.match(report.baseText, /before/);
  assert.match(report.headText, /after/);
});

test("working tree all-files diff can compare HEAD against the git index without untracked files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ntf-yaml-all-files-index-diff-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "ntf-yaml@example.test"]);
  git(dir, ["config", "user.name", "NTF YAML Test"]);

  const file = path.join(dir, "case.ntf.yaml");
  fs.writeFileSync(file, [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"committed\"",
    ""
  ].join("\n"));
  git(dir, ["add", "case.ntf.yaml"]);
  git(dir, ["commit", "-m", "base"]);

  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("committed", "staged"));
  git(dir, ["add", "case.ntf.yaml"]);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("staged", "worktree"));
  fs.writeFileSync(path.join(dir, "untracked.ntf.yaml"), [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - no: \"1\"",
    "      name: \"untracked\"",
    ""
  ].join("\n"));

  const reports = diffWorkingTreeAllFiles({
    repositoryPath: dir,
    baseRef: "HEAD",
    headRef: "index"
  }).filter(Boolean);
  const byPath = Object.fromEntries(reports.map(report => [report.files[0].path, report]));

  assert.deepEqual(Object.keys(byPath), ["case.ntf.yaml"]);
  assert.equal(byPath["case.ntf.yaml"].headRef, "index");
  assert.match(byPath["case.ntf.yaml"].baseText, /committed/);
  assert.match(byPath["case.ntf.yaml"].headText, /staged/);
  assert.doesNotMatch(byPath["case.ntf.yaml"].headText, /worktree/);
});

test("cell diff detects middle-row deletion and insertion without misidentifying as changed", () => {
  // Regression: before LCS, removing a middle row shifted subsequent rows by index,
  // causing the row after the deleted one to show as "changed" instead of "unchanged".
  const baseText = [
    "case1:",
    "  LIST_MAP=project1: #ListMap",
    "    - name: projectName",
    "      get: before",
    "    - name: projectType",
    "      get: development",
    "    - name: projectClass",
    "      get: s",
    "    - name: clientId",
    "      get: \"1\"",
    ""
  ].join("\n");
  const headText = [
    "case1:",
    "  LIST_MAP=project1: #ListMap",
    "    - name: projectName",
    "      get: after",
    "    - name: projectType",
    "      get: development",
    "    - name: clientId",
    "      get: \"1\"",
    ""
  ].join("\n");

  const report = createDiffReport({ path: "test.ntf.yaml", baseText, headText });
  const block = report.files[0].sheets[0].blocks[0];
  const byStatus = block.rows.reduce((acc, row) => {
    (acc[row.status] = acc[row.status] || []).push(
      row.cells.find(c => c.column === "name")?.before ?? row.cells.find(c => c.column === "name")?.after
    );
    return acc;
  }, {});

  // projectName row changed (get value differs), projectClass row deleted
  assert.deepEqual(byStatus.changed?.map(n => String(n)), ["projectName"]);
  assert.deepEqual(byStatus.deleted?.map(n => String(n)), ["projectClass"]);
  // projectType and clientId rows are unchanged — must not appear in block.rows
  assert.ok(!block.rows.some(r => {
    const nameCell = r.cells.find(c => c.column === "name");
    return (nameCell?.before ?? nameCell?.after) === "projectType"
      || (nameCell?.before ?? nameCell?.after) === "clientId";
  }), "unchanged rows should not appear in diff output");
});

test("diff report stores baseText and headText", () => {
  const baseText = "case1:\n  LIST_MAP=rows: #ListMap\n    - no: \"1\"\n      name: \"before\"\n";
  const headText = "case1:\n  LIST_MAP=rows: #ListMap\n    - no: \"1\"\n      name: \"after\"\n";
  const report = createDiffReport({ path: "test.ntf.yaml", baseText, headText });
  assert.equal(report.baseText, baseText);
  assert.equal(report.headText, headText);
});

test("diff rows carry headIndex for head-side matching, null for deleted rows", () => {
  const report = createDiffReport({
    path: "test.ntf.yaml",
    baseText: [
      "case1:",
      "  LIST_MAP=project1: #ListMap",
      "    - name: projectName",
      "      get: before",
      "    - name: projectClass",
      "      get: s",
      "    - name: clientId",
      "      get: \"1\"",
      ""
    ].join("\n"),
    headText: [
      "case1:",
      "  LIST_MAP=project1: #ListMap",
      "    - name: projectName",
      "      get: after",
      "    - name: clientId",
      "      get: \"1\"",
      ""
    ].join("\n")
  });
  const block = report.files[0].sheets[0].blocks[0];
  const changedRow = block.rows.find(r => r.status === "changed");
  const deletedRow = block.rows.find(r => r.status === "deleted");

  // changed row (projectName): head position = 0
  assert.equal(changedRow.headIndex, 0);
  // deleted row (projectClass): not present in head
  assert.equal(deletedRow.headIndex, null);
});

test("CLI diff args require explicit base and head refs", () => {
  assert.deepEqual(parseDiffArgs(["--base", "HEAD~1", "--head", "HEAD", "-o", "report.html"]), {
    baseRef: "HEAD~1",
    headRef: "HEAD",
    output: "report.html"
  });
  assert.equal(runCli(["diff", "--base", "HEAD~1"]), 2);
});

test("package contributes cell diff to SCM resources and NTF YAML file menus", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
  const commandTitles = Object.fromEntries(pkg.contributes.commands.map(item => [item.command, item.title]));
  const menus = pkg.contributes.menus;
  const cellDiffCommand = "ntfYaml.openCellDiff";
  const ntfYamlPattern = "resourceFilename =~ /\\.ntf\\.ya?ml$/";

  assert.equal(commandTitles["ntfYaml.openAsTable"], "NTF YAML Editor: NTF データとして開く");
  assert.equal(commandTitles["ntfYaml.generateDiffReport"], "NTF YAML Editor: NTF データ差分レポートの出力");
  assert.equal(commandTitles[cellDiffCommand], "NTF YAML Editor: NTF データ差分を表示");

  const scmEntries = menus["scm/resourceState/context"].filter(item => item.command === cellDiffCommand);
  assert.equal(scmEntries.length, 4);
  assert.ok(scmEntries.every(item => item.when.includes("scmProvider == git")));
  assert.ok(scmEntries.every(item => !item.when.includes("resourceFilename")));
  assert.ok(scmEntries.every(item => !item.when.includes("resource =~")));
  assert.deepEqual(
    scmEntries.map(item => item.when.match(/scmResourceGroup == (\w+)/)?.[1]).sort(),
    ["index", "merge", "untracked", "workingTree"]
  );

  assert.equal(menus["scm/resourceGroup/context"], undefined);
  assert.equal(menus["scm/resourceFolder/context"], undefined);

  const explorerEntry = menus["explorer/context"].find(item => item.command === cellDiffCommand);
  assert.equal(explorerEntry.when, ntfYamlPattern);

  const editorTitleEntry = menus["editor/title"].find(item => item.command === cellDiffCommand);
  assert.equal(editorTitleEntry.when, ntfYamlPattern);
  assert.equal(editorTitleEntry.group, "1_modification@9");
});

test("package splits NTF YAML default editor from generic YAML optional editor", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
  const customEditors = pkg.contributes.customEditors;
  const primary = customEditors.find(editor => editor.viewType === "ntfYaml.editor");
  const generic = customEditors.find(editor => editor.viewType === "ntfYaml.editor.generic");

  assert.ok(primary, "existing viewType should remain registered");
  assert.equal(primary.displayName, "NTF YAML Table Editor");
  assert.deepEqual(primary.selector, [{ filenamePattern: "*.ntf.yaml" }]);
  assert.equal(primary.priority, "default");

  assert.ok(generic, "generic YAML viewType should be registered");
  assert.equal(generic.displayName, "NTF YAML Table Editor (Generic YAML)");
  assert.deepEqual(generic.selector, [{ filenamePattern: "*.yaml" }]);
  assert.equal(generic.priority, "option");

  assert.ok(pkg.activationEvents.includes("onCustomEditor:ntfYaml.editor"));
  assert.ok(pkg.activationEvents.includes("onCustomEditor:ntfYaml.editor.generic"));
});
