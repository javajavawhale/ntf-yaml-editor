const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  analyzeYaml,
  parseYaml,
  serializeYaml,
  isRawRowsBlock,
  isTableBlock
} = require("../lib/ntfYamlModel");
const { main: runCli } = require("../bin/ntf-yaml");

const repoRoot = path.resolve(__dirname, "..", "..");

function getBlock(model, sheetName, blockName) {
  const sheet = model.sheets.find(item => item.name === sheetName);
  assert.ok(sheet, `sheet ${sheetName} should exist`);
  const block = sheet.blocks.find(item => item.name === blockName);
  assert.ok(block, `block ${blockName} should exist`);
  return block;
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

test("loads the ProjectActionRequestTest fixture and keeps key editor targets", () => {
  const fixture = fs.readFileSync(
    path.join(repoRoot, "converted", "ProjectActionRequestTest.yaml"),
    "utf8"
  );

  const model = parseYaml(fixture);
  const serialized = serializeYaml(model);

  assert.ok(model.sheets.length > 20, "fixture should contain many action-test sheets");
  assert.ok(getBlock(model, "confirmOfCreateNormal", "LIST_MAP=testShots"));
  assert.ok(getBlock(model, "confirmOfCreateNormal", "LIST_MAP=requestParams"));
  assert.match(serialized, /"\[no\]": "1"/);
  assert.match(serialized, /EXPECTED_VARIABLE=\.\/tmp\/html_dump\/ProjectActionRequestTest\/downloadNormal_Shot1_/);
});

test("loads the migrated web fixture and preserves null sentinel rows", () => {
  const fixture = fs.readFileSync(
    path.join(
      repoRoot,
      "samples",
      "nablarch-example-web",
      "src",
      "test",
      "java",
      "com",
      "nablarch",
      "example",
      "app",
      "web",
      "action",
      "ProjectBulkActionRequestTest.yaml"
    ),
    "utf8"
  );

  const serialized = serializeYaml(parseYaml(fixture));

  assert.match(serialized, /PROJECT_ID: ~/);
  assert.match(serialized, /"\[no\]": "1"/);
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
