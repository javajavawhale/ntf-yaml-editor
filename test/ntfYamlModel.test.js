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
  isRawRowsBlock,
  isTableBlock
} = require("../lib/ntfYamlModel");
const {
  convert,
  main: runCli,
  selectConverter
} = require("../bin/ntf-yaml");

const extensionRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionRoot, "..");
const sampleFixtures = {
  webProjectAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-action-request.yaml"),
  webProjectBulkAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-bulk-action-request.yaml"),
  batchImportZipCodeDataFormat: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "batch-import-zip-code-data-format-action-request.yaml"),
  restProjectAction: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "rest-project-action.yaml"),
  webProjectForm: path.join(extensionRoot, "test", "fixtures", "ntf-samples", "web-project-form.yaml")
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
  assert.equal(isRawRowsBlock("SETUP_VARIABLE[1]=work/input.csv"), true);
  assert.equal(isRawRowsBlock("EXPECTED_VARIABLE=./tmp/result.csv"), true);
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

test("preserves unsupported fixed-length blocks as raw text", () => {
  const yaml = [
    "case1:",
    "  EXPECTED_FIXED[1]=./path/to/fixedFile: #FixedLengthFile",
    "    text-encoding: \"ms932\"",
    "    ヘッダレコード:",
    "      - [one, 半角数字, \"1\"]: \"1\"",
    ""
  ].join("\n");

  const model = parseYaml(yaml);
  const block = getBlock(model, "case1", "EXPECTED_FIXED[1]=./path/to/fixedFile");

  assert.equal(block.raw.includes("text-encoding"), true);
  assert.match(serializeYaml(model), /EXPECTED_FIXED\[1\]=\.\/path\/to\/fixedFile: #FixedLengthFile/);
  assert.match(serializeYaml(model), /    text-encoding: "ms932"/);
});

test("loads representative sample fixtures and keeps key editor targets", () => {
  const model = parseYaml(readSampleFixture("webProjectAction"));
  const serialized = serializeYaml(model);

  assert.deepEqual(model.sheets.map(sheet => sheet.name), ["confirmOfCreateNormal", "downloadNormal"]);
  assert.ok(getBlock(model, "confirmOfCreateNormal", "LIST_MAP=testShots"));
  assert.ok(getBlock(model, "confirmOfCreateNormal", "LIST_MAP=requestParams"));
  assert.ok(getBlock(model, "downloadNormal", "EXPECTED_VARIABLE=./tmp/html_dump/ProjectActionRequestTest/downloadNormal_Shot1_プロジェクト一覧ダウンロード_プロジェクト一覧.csv"));
  assert.match(serialized, /"\[no\]": "1"/);
  assert.match(serialized, /EXPECTED_VARIABLE=\.\/tmp\/html_dump\/ProjectActionRequestTest\/downloadNormal_Shot1_/);
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
  assert.ok(getBlock(restAction, "プロジェクトを新規登録できること", "SETUP_TABLE=PROJECT"));
  assert.ok(getBlock(restAction, "プロジェクトを新規登録できること", "EXPECTED_TABLE=PROJECT"));

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
