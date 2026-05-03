const assert = require("assert");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const model = require("../lib/ntfYamlModel");
const { createNtfYamlEditorApp } = require("../media/ntfYamlEditorWebview");

function createHarness(initialText = sampleYaml()) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://ntf-yaml-editor.test/"
  });
  const messages = [];
  const root = dom.window.document.getElementById("root");
  const app = createNtfYamlEditorApp({
    root,
    initialText,
    model,
    vscode: {
      postMessage(message) {
        messages.push(message);
      }
    },
    window: dom.window
  });
  return { dom, root, app, messages };
}

function sampleYaml() {
  return [
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - \"[no]\": \"1\"",
    "      form.projectName: \"プロジェクト００１\"",
    "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
    "    - [ \"001\", \"東京\", ~ ]",
    "",
    "case2:",
    "  LIST_MAP=testShots: #ListMap",
    "    - no: \"1\"",
    "      description: \"second sheet\"",
    ""
  ].join("\n");
}

function block(root, name) {
  const result = root.querySelector(`[data-block-name="${cssEscape(name)}"]`);
  assert.ok(result, `block ${name} should exist`);
  return result;
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function inputEvent(dom) {
  return new dom.window.Event("input", { bubbles: true });
}

function changeEvent(dom) {
  return new dom.window.Event("change", { bubbles: true });
}

function keydownEvent(dom, key) {
  return new dom.window.KeyboardEvent("keydown", { key, bubbles: true });
}

function save(root) {
  root.querySelector('[data-action="save"]').click();
}

function sheetName(root) {
  return root.querySelector('[data-role="sheet-name"]').value;
}

test("webview renders sheets and switches active sheet", () => {
  const { root, app } = createHarness();

  assert.equal(app.getActiveSheet(), "case1");
  assert.equal(sheetName(root), "case1");

  root.querySelector('[data-sheet-name="case2"]').click();

  assert.equal(app.getActiveSheet(), "case2");
  assert.equal(sheetName(root), "case2");
  assert.ok(block(root, "LIST_MAP=testShots"));
});

test("webview edits a table cell and sends serialized YAML on save", () => {
  const { dom, root, messages } = createHarness();
  const requestParams = block(root, "LIST_MAP=requestParams");
  const projectName = requestParams.querySelector('[data-column="form.projectName"]');

  projectName.value = "プロジェクト９９９";
  projectName.dispatchEvent(inputEvent(dom));
  save(root);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "save");
  assert.match(messages[0].text, /form\.projectName: "プロジェクト９９９"/);
  assert.match(messages[0].text, /"\[no\]": "1"/);
});

test("webview adds rows to table blocks", () => {
  const { root, messages } = createHarness();
  const requestParams = block(root, "LIST_MAP=requestParams");

  requestParams.querySelector('[data-action="add-row"]').click();
  save(root);

  assert.match(messages[0].text, /form\.projectName: "プロジェクト００１"/);
  assert.match(messages[0].text, /form\.projectName: ""/);
});

test("webview adds columns to populated table blocks", () => {
  const { dom, root, messages } = createHarness();
  const requestParams = block(root, "LIST_MAP=requestParams");
  const colInput = requestParams.querySelector('[data-role="new-column-name"]');

  colInput.value = "form.clientId";
  requestParams.querySelector('[data-action="add-column"]').click();
  const added = block(root, "LIST_MAP=requestParams").querySelector('[data-column="form.clientId"]');
  assert.ok(added, "new column input should render");

  added.value = "12345";
  added.dispatchEvent(inputEvent(dom));
  save(root);

  assert.match(messages[0].text, /form\.clientId: "12345"/);
});

test("webview adds a column by pressing enter in an empty table block", () => {
  const { dom, root, messages } = createHarness([
    "case1:",
    "  SETUP_TABLE=PROJECT: #ListMap",
    ""
  ].join("\n"));
  const setupTable = block(root, "SETUP_TABLE=PROJECT");
  const colInput = setupTable.querySelector('[data-role="new-column-name"]');

  colInput.value = "PROJECT_ID";
  colInput.dispatchEvent(keydownEvent(dom, "Enter"));
  save(root);

  assert.match(messages[0].text, /SETUP_TABLE=PROJECT: #ListMap/);
  assert.match(messages[0].text, /    - PROJECT_ID: ""/);
});

test("webview renames table columns and keeps cell values", () => {
  const { dom, root, messages } = createHarness();
  const requestParams = block(root, "LIST_MAP=requestParams");
  const header = requestParams.querySelector('[data-role="column-name"][value="form.projectName"]')
    || Array.from(requestParams.querySelectorAll('[data-role="column-name"]'))
      .find(input => input.value === "form.projectName");

  assert.ok(header, "form.projectName header should exist");
  header.value = "form.projectDisplayName";
  header.dispatchEvent(changeEvent(dom));
  save(root);

  assert.match(messages[0].text, /form\.projectDisplayName: "プロジェクト００１"/);
  assert.doesNotMatch(messages[0].text, /form\.projectName:/);
  assert.match(messages[0].text, /"\[no\]": "1"\n      form\.projectDisplayName: "プロジェクト００１"/);
});

test("webview edits raw-row cells and serializes null sentinels", () => {
  const { dom, root, messages } = createHarness();
  const rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  const rawInput = rawRows.querySelector('[data-raw-row="0"][data-raw-column="1"]');

  rawInput.value = "大阪";
  rawInput.dispatchEvent(inputEvent(dom));
  save(root);

  assert.match(messages[0].text, /EXPECTED_VARIABLE=\.\/tmp\/result\.csv: #RawRows/);
  assert.match(messages[0].text, /    - \[ "001", "大阪", ~ \]/);
});

test("webview adds, moves, and deletes RawRows rows and columns", () => {
  const { root, messages } = createHarness();
  let rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");

  rawRows.querySelector('[data-action="add-row"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelector('[data-action="add-column"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelectorAll('[title="Move raw row up"]')[1].click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelector('[title="Move raw column right"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelector('[title="Delete raw column"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelector('[title="Delete raw row"]').click();
  save(root);

  assert.match(messages[0].text, /EXPECTED_VARIABLE=\.\/tmp\/result\.csv: #RawRows/);
  assert.match(messages[0].text, /    - \[ "001", ~, "" \]/);
});


test("webview re-renders on document updates while preserving active sheet when possible", () => {
  const { dom, root, app } = createHarness();

  root.querySelector('[data-sheet-name="case2"]').click();
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    data: {
      type: "update",
      text: [
        "case1:",
        "  LIST_MAP=requestParams: #ListMap",
        "    - \"[no]\": \"2\"",
        "",
        "case2:",
        "  LIST_MAP=testShots: #ListMap",
        "    - no: \"2\"",
        "      description: \"updated\"",
        ""
      ].join("\n")
    }
  }));

  assert.equal(app.getActiveSheet(), "case2");
  assert.equal(root.querySelector('[data-column="description"]').value, "updated");
});

test("webview falls back to first sheet when update removes the active sheet", () => {
  const { dom, root, app } = createHarness();

  root.querySelector('[data-sheet-name="case2"]').click();
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    data: {
      type: "update",
      text: [
        "case3:",
        "  LIST_MAP=testShots: #ListMap",
        "    - no: \"1\"",
        "      description: \"replacement\"",
        ""
      ].join("\n")
    }
  }));

  assert.equal(app.getActiveSheet(), "case3");
  assert.equal(sheetName(root), "case3");
});

test("webview adds sheets and LIST_MAP blocks", () => {
  const { dom, root, messages, app } = createHarness();
  const sheetInput = root.querySelector('[data-role="new-sheet-name"]');

  sheetInput.value = "case3";
  root.querySelector('[data-action="add-sheet"]').click();

  assert.equal(app.getActiveSheet(), "case3");
  const blockInput = root.querySelector('[data-role="new-block-name"]');
  blockInput.value = "items";
  root.querySelector('[data-action="add-block"]').click();
  const listMap = block(root, "LIST_MAP=items");
  const noInput = listMap.querySelector('[data-column="no"]');
  noInput.value = "1";
  noInput.dispatchEvent(inputEvent(dom));
  save(root);

  assert.match(messages[0].text, /case3:/);
  assert.match(messages[0].text, /LIST_MAP=items: #ListMap/);
  assert.match(messages[0].text, /    - no: "1"/);
});

test("webview renames sheets and LIST_MAP blocks", () => {
  const { dom, root, messages } = createHarness();
  const sheetInput = root.querySelector('[data-role="sheet-name"]');
  sheetInput.value = "caseRenamed";
  sheetInput.dispatchEvent(changeEvent(dom));
  const requestParams = block(root, "LIST_MAP=requestParams");
  const blockInput = requestParams.querySelector('[data-role="block-name"]');

  blockInput.value = "LIST_MAP=requestParamsRenamed";
  blockInput.dispatchEvent(changeEvent(dom));
  save(root);

  assert.match(messages[0].text, /caseRenamed:/);
  assert.match(messages[0].text, /LIST_MAP=requestParamsRenamed: #ListMap/);
});

test("webview moves and deletes table rows and columns", () => {
  const { root, messages } = createHarness([
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - \"[no]\": \"1\"",
    "      name: \"first\"",
    "      extra: \"x\"",
    "    - \"[no]\": \"2\"",
    "      name: \"second\"",
    "      extra: \"y\"",
    ""
  ].join("\n"));
  let requestParams = block(root, "LIST_MAP=requestParams");

  requestParams.querySelectorAll('[title="Move row up"]')[1].click();
  requestParams = block(root, "LIST_MAP=requestParams");
  Array.from(requestParams.querySelectorAll('[title="Move column right"]'))
    .find(button => button.closest("th").querySelector('[data-role="column-name"]').value === "[no]")
    .click();
  requestParams = block(root, "LIST_MAP=requestParams");
  Array.from(requestParams.querySelectorAll('[title="Delete column"]'))
    .find(button => button.closest("th").querySelector('[data-role="column-name"]').value === "extra")
    .click();
  requestParams = block(root, "LIST_MAP=requestParams");
  requestParams.querySelector('[title="Delete row"]').click();
  save(root);

  assert.match(messages[0].text, /name: "first"/);
  assert.doesNotMatch(messages[0].text, /extra:/);
  assert.doesNotMatch(messages[0].text, /\[no\]": "2"/);
});

test("webview renders unsupported blocks as preserved raw text", () => {
  const { root } = createHarness([
    "case1:",
    "  EXPECTED_FIXED[1]=./tmp/fixed.txt: #FixedLengthFile",
    "    text-encoding: \"ms932\"",
    ""
  ].join("\n"));

  const fixed = block(root, "EXPECTED_FIXED[1]=./tmp/fixed.txt");
  assert.match(fixed.querySelector("pre").textContent, /text-encoding: "ms932"/);
});
