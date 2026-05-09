const assert = require("assert");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const model = require("../lib/ntfYamlModel");
const { createNtfYamlEditorApp } = require("../media/ntfYamlEditorWebview");

function createHarness(initialText = sampleYaml(), options = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://ntf-yaml-editor.test/"
  });
  const messages = [];
  const root = dom.window.document.getElementById("root");
  const app = createNtfYamlEditorApp({
    root,
    initialText,
    initialDiffReport: options.initialDiffReport,
    readOnly: options.readOnly,
    diffSide: options.diffSide,
    allowDiffControls: options.allowDiffControls,
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

function dragDrop(dom, from, to) {
  const data = new Map();
  const dataTransfer = {
    setData(type, value) {
      data.set(type, value);
    },
    getData(type) {
      return data.get(type) || "";
    }
  };
  for (const [target, type] of [[from, "dragstart"], [to, "dragover"], [to, "drop"], [from, "dragend"]]) {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    target.dispatchEvent(event);
  }
}

function pointerEvent(dom, type, clientX) {
  return new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX });
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

test("webview resizes the sheet list without adding visible divider markup", () => {
  const { dom, root, messages } = createHarness();
  const resizer = root.querySelector(".sidebar-resizer");
  assert.ok(resizer, "sidebar resize handle should exist");
  assert.equal(resizer.textContent, "");

  resizer.dispatchEvent(pointerEvent(dom, "pointerdown", 240));
  dom.window.dispatchEvent(pointerEvent(dom, "pointermove", 300));
  dom.window.dispatchEvent(pointerEvent(dom, "pointerup", 300));

  assert.equal(
    dom.window.document.documentElement.style.getPropertyValue("--ntf-sidebar-width"),
    "300px"
  );
  assert.deepEqual(messages.at(-1), { type: "sidebarResize", width: 300 });
});

test("webview applies sidebar resize messages from another pane", () => {
  const { dom } = createHarness();

  dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    data: { type: "setSidebarWidth", width: 180 }
  }));

  assert.equal(
    dom.window.document.documentElement.style.getPropertyValue("--ntf-sidebar-width"),
    "180px"
  );
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

test("webview renders a read-only cell diff overlay", () => {
  const initialDiffReport = {
    baseRef: "HEAD",
    headRef: "working tree",
    summary: {
      rows: { changed: 1, added: 0, deleted: 0 },
      cells: { changed: 1, added: 0, deleted: 0 }
    },
    files: [{
      path: "case.ntf.yaml",
      sheets: [{
        name: "case1",
        status: "changed",
        blocks: [{
          name: "LIST_MAP=requestParams",
          status: "changed",
          rows: [{
            key: "0",
            headIndex: 0,
            status: "changed",
            cells: [{
              column: "form.projectName",
              status: "changed",
              before: "プロジェクト０００",
              after: "プロジェクト００１"
            }]
          }]
        }]
      }]
    }]
  };

  const { root, messages } = createHarness(sampleYaml(), { initialDiffReport, readOnly: true });
  const requestParams = block(root, "LIST_MAP=requestParams");
  const projectName = requestParams.querySelector('[data-column="form.projectName"]');

  assert.ok(root.querySelector(".app").classList.contains("diff-app"));
  assert.equal(root.querySelector('[data-action="save"]'), null);
  assert.equal(root.querySelector('[data-action="add-sheet"]'), null);
  assert.equal(requestParams.querySelector('[data-action="add-row"]'), null);
  assert.equal(projectName.readOnly, true);
  assert.equal(root.querySelector(".diff-summary"), null);
  assert.ok(root.querySelector(".diff-legend"));
  assert.equal(root.querySelector(".diff-status"), null);
  assert.ok(root.querySelector(".sheet-header").classList.contains("diff-sheet-changed"));
  assert.ok(requestParams.classList.contains("diff-block-changed"));
  assert.ok(projectName.closest("td").classList.contains("diff-cell-changed"));
  assert.equal(projectName.closest("td").dataset.diffStatus, "changed");
  assert.ok(projectName.closest("tr").classList.contains("diff-row-changed"));
  assert.equal(projectName.title, "before: プロジェクト０００");
  assert.deepEqual(messages, []);
});

test("webview hides diff controls when requested for exported HTML", () => {
  const initialDiffReport = {
    baseRef: "HEAD",
    headRef: "working tree",
    files: [{
      path: "case.ntf.yaml",
      sheets: [{
        name: "case1",
        status: "changed",
        blocks: [{
          name: "LIST_MAP=requestParams",
          status: "changed",
          rows: []
        }]
      }]
    }]
  };

  const { root } = createHarness(sampleYaml(), {
    initialDiffReport,
    readOnly: true,
    diffSide: "head",
    allowDiffControls: false
  });

  assert.equal(root.querySelector(".diff-controls"), null);
  assert.ok(root.querySelector(".diff-legend"));
});

test("webview only renders added and deleted sheets and blocks on the side where they exist", () => {
  const initialDiffReport = {
    files: [{
      path: "case.ntf.yaml",
      sheets: [
        {
          name: "deletedSheet",
          status: "deleted",
          blocks: [{
            name: "LIST_MAP=deletedBlock",
            status: "deleted",
            rows: []
          }]
        },
        {
          name: "addedSheet",
          status: "added",
          blocks: [{
            name: "LIST_MAP=addedBlock",
            status: "added",
            rows: []
          }]
        },
        {
          name: "case1",
          status: "changed",
          blocks: [{
            name: "LIST_MAP=addedBlockInExistingSheet",
            status: "added",
            rows: []
          }]
        }
      ]
    }]
  };
  const leftText = [
    "deletedSheet:",
    "  LIST_MAP=deletedBlock: #ListMap",
    "    - no: \"1\"",
    "      name: \"gone\"",
    "",
    "case1:",
    "  LIST_MAP=requestParams: #ListMap",
    "    - \"[no]\": \"1\"",
    "      form.projectName: \"プロジェクト００１\"",
    ""
  ].join("\n");

  const { root, app } = createHarness(leftText, { initialDiffReport, readOnly: true });

  assert.ok(root.querySelector('[data-sheet-name="deletedSheet"]').classList.contains("diff-sheet-deleted"));
  assert.equal(root.querySelector('[data-sheet-name="addedSheet"]'), null);
  root.querySelector('[data-sheet-name="case1"]').click();
  assert.equal(app.getActiveSheet(), "case1");
  assert.equal(root.querySelector('[data-block-name="LIST_MAP=addedBlockInExistingSheet"]'), null);
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

  requestParams.querySelector('[data-action="add-column"]').click();
  let added = block(root, "LIST_MAP=requestParams");
  const newColHeader = Array.from(added.querySelectorAll('[data-role="column-name"]'))
    .find(input => input.value === "col");
  assert.ok(newColHeader, "auto-named column header should render");

  newColHeader.value = "form.clientId";
  newColHeader.dispatchEvent(changeEvent(dom));
  const colInput = block(root, "LIST_MAP=requestParams").querySelector('[data-column="form.clientId"]');
  assert.ok(colInput, "renamed column input should render");

  colInput.value = "12345";
  colInput.dispatchEvent(inputEvent(dom));
  save(root);

  assert.match(messages[0].text, /form\.clientId: "12345"/);
});

test("webview adds a column to an empty table block", () => {
  const { root, messages } = createHarness([
    "case1:",
    "  SETUP_TABLE=PROJECT: #ListMap",
    ""
  ].join("\n"));
  const setupTable = block(root, "SETUP_TABLE=PROJECT");

  setupTable.querySelector('[data-action="add-column"]').click();
  save(root);

  assert.match(messages[0].text, /SETUP_TABLE=PROJECT: #ListMap/);
  assert.match(messages[0].text, /    - col: ""/);
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

test("webview adds and deletes RawRows rows and columns", () => {
  const { dom, root, messages } = createHarness();
  let rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");

  rawRows.querySelector('[data-action="add-row"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelector('[data-action="add-column"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  rawRows.querySelector('[title="Delete raw column"]').click();
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  dragDrop(dom, rawRows.querySelectorAll("tbody tr")[1], rawRows.querySelectorAll("tbody tr")[0]);
  rawRows = block(root, "EXPECTED_VARIABLE=./tmp/result.csv");
  dragDrop(dom, rawRows.querySelectorAll("thead th")[2], rawRows.querySelectorAll("thead th")[1]);
  save(root);

  assert.match(messages[0].text, /EXPECTED_VARIABLE=\.\/tmp\/result\.csv: #RawRows/);
  assert.match(messages[0].text, /    - \[ "", "", "" \]\n    - \[ "", "東京", "" \]/);
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

  root.querySelector('[data-action="add-sheet"]').click();

  assert.equal(app.getActiveSheet(), "");
  const sheetInput = root.querySelector('[data-role="sheet-name"]');
  sheetInput.value = "case3";
  sheetInput.dispatchEvent(changeEvent(dom));
  root.querySelector('[data-action="add-block"]').click();
  let listMap = block(root, "LIST_MAP=");
  const blockInput = listMap.querySelector('[data-role="block-name"]');
  blockInput.value = "LIST_MAP=items";
  blockInput.dispatchEvent(changeEvent(dom));
  listMap = block(root, "LIST_MAP=items");
  const noInput = listMap.querySelector('[data-column="no"]');
  noInput.value = "1";
  noInput.dispatchEvent(inputEvent(dom));
  save(root);

  assert.match(messages[0].text, /case3:/);
  assert.match(messages[0].text, /LIST_MAP=items: #ListMap/);
  assert.match(messages[0].text, /    - no: "1"/);
});

test("webview renders RawRows without column numbers and highlights structural cells", () => {
  const { root } = createHarness([
    "case1:",
    "  SETUP_VARIABLE[1]=data.csv: #RawRows",
    "    - [ \"text-encoding\", \"UTF-8\" ]",
    "    - [ \"quoting-delimiter\", \"\\\"\" ]",
    "    - [ \"header\", \"name\", \"value\" ]",
    "    - [ \"\", \"全角\", \"半角\" ]",
    "    - [ \"\", \"1\", \"\" ]",
    ""
  ].join("\n"));
  const rawRows = block(root, "SETUP_VARIABLE[1]=data.csv");

  assert.ok(rawRows.querySelector("thead th:nth-child(2) [title='Delete raw column'], thead th:nth-child(2) button[title='Delete raw column']") || rawRows.querySelector("thead th:nth-child(2)").querySelector("button"));
  assert.ok(rawRows.querySelector(".raw-metadata-row"));
  assert.ok(rawRows.querySelector(".raw-section-header-row"));
  assert.ok(rawRows.querySelector(".raw-key-cell"));
  assert.ok(rawRows.querySelector(".raw-section-header-row .table-header-cell"));
  assert.ok(rawRows.querySelector(".raw-type-row .table-header-cell"));
  assert.equal(rawRows.querySelector('[data-raw-row="0"][data-raw-column="1"]').closest("td").classList.contains("table-header-cell"), false);
  assert.equal(rawRows.querySelector('[data-raw-row="0"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), true);
  assert.equal(rawRows.querySelector('[data-raw-row="1"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), true);
  assert.equal(rawRows.querySelector('[data-raw-row="0"][data-raw-column="2"]'), null);
  assert.ok(rawRows.querySelector(".raw-filler-cell"));
  assert.equal(rawRows.querySelector('[data-raw-row="3"][data-raw-column="0"]'), null);
  assert.equal(rawRows.querySelector(".raw-type-row .raw-row-label"), null);
  assert.equal(rawRows.querySelector(".raw-value-row .raw-row-label"), null);
  assert.ok(rawRows.querySelector(".raw-type-row"));
  assert.ok(rawRows.querySelector(".raw-value-row"));
});

test("webview only treats NTF file generation directives as RawRows metadata", () => {
  const { root } = createHarness([
    "case1:",
    "  SETUP_VARIABLE[1]=data.csv: #RawRows",
    "    - [ \"field-separator\", \",\" ]",
    "    - [ \"positive-zone-sign-nibble\", \"C\" ]",
    "    - [ \"file-type\", \"Variable\" ]",
    "    - [ \"record-length\", \"120\" ]",
    "    - [ \"ignore-blank-lines\", \"true\" ]",
    ""
  ].join("\n"));
  const rawRows = block(root, "SETUP_VARIABLE[1]=data.csv");

  assert.equal(rawRows.querySelector('[data-raw-row="0"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), true);
  assert.equal(rawRows.querySelector('[data-raw-row="1"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), true);
  assert.equal(rawRows.querySelector('[data-raw-row="2"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), false);
  assert.equal(rawRows.querySelector('[data-raw-row="3"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), false);
  assert.equal(rawRows.querySelector('[data-raw-row="4"][data-raw-column="0"]').closest("tr").classList.contains("raw-metadata-row"), false);
});

test("webview reorders sheets, blocks, rows, and columns with drag and drop", () => {
  const { dom, root, messages } = createHarness([
    "case1:",
    "  LIST_MAP=first: #ListMap",
    "    - no: \"1\"",
    "      name: \"first-row\"",
    "    - no: \"2\"",
    "      name: \"second-row\"",
    "",
    "  LIST_MAP=second: #ListMap",
    "    - no: \"3\"",
    "      name: \"other\"",
    "",
    "case2:",
    "  LIST_MAP=third: #ListMap",
    "    - no: \"4\"",
    "      name: \"third\"",
    ""
  ].join("\n"));

  dragDrop(dom, root.querySelector('[data-sheet-name="case2"]'), root.querySelector('[data-sheet-name="case1"]'));
  root.querySelector('[data-sheet-name="case1"]').click();
  dragDrop(dom, block(root, "LIST_MAP=second"), block(root, "LIST_MAP=first"));

  let first = block(root, "LIST_MAP=first");
  dragDrop(dom, first.querySelectorAll("tbody tr")[1], first.querySelectorAll("tbody tr")[0]);
  first = block(root, "LIST_MAP=first");
  const headerCells = Array.from(first.querySelectorAll("thead th")).slice(1);
  dragDrop(dom, headerCells[1], headerCells[0]);
  save(root);

  assert.ok(messages[0].text.indexOf("case2:") < messages[0].text.indexOf("case1:"));
  assert.ok(messages[0].text.indexOf("LIST_MAP=second") < messages[0].text.indexOf("LIST_MAP=first"));
  assert.ok(messages[0].text.indexOf('name: "second-row"') < messages[0].text.indexOf('name: "first-row"'));
  assert.match(messages[0].text, /    - name: "second-row"\n      no: "2"/);
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

test("webview deletes table rows and columns", () => {
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

  Array.from(requestParams.querySelectorAll('[title="Delete column"]'))
    .find(button => button.closest("th").querySelector('[data-role="column-name"]').value === "extra")
    .click();
  requestParams = block(root, "LIST_MAP=requestParams");
  requestParams.querySelector('[title="Delete row"]').click();
  save(root);

  assert.match(messages[0].text, /name: "second"/);
  assert.doesNotMatch(messages[0].text, /extra:/);
  assert.doesNotMatch(messages[0].text, /\[no\]": "1"/);
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

test("webview highlights diff on head side using headIndex", () => {
  // head side (diffSide: "head") should match rows by headIndex, not by key
  const initialDiffReport = {
    files: [{
      path: "case.ntf.yaml",
      sheets: [{
        name: "case1",
        status: "changed",
        blocks: [{
          name: "LIST_MAP=requestParams",
          status: "changed",
          rows: [{
            key: "0",
            headIndex: 0,
            status: "changed",
            cells: [{
              column: "form.projectName",
              status: "changed",
              before: "プロジェクト０００",
              after: "プロジェクト００１"
            }]
          }]
        }]
      }]
    }]
  };

  const { root } = createHarness(sampleYaml(), { initialDiffReport, readOnly: false, diffSide: "head" });
  const requestParams = block(root, "LIST_MAP=requestParams");
  const projectName = requestParams.querySelector('[data-column="form.projectName"]');

  assert.ok(projectName.closest("tr").classList.contains("diff-row-changed"));
  assert.ok(projectName.closest("td").classList.contains("diff-cell-changed"));
  assert.equal(projectName.title, "before: プロジェクト０００");
});

test("webview does not highlight deleted rows on head side (headIndex is null)", () => {
  // deleted rows have headIndex=null and must not match any head row
  const initialDiffReport = {
    files: [{
      path: "case.ntf.yaml",
      sheets: [{
        name: "case1",
        status: "changed",
        blocks: [{
          name: "LIST_MAP=requestParams",
          status: "changed",
          rows: [{
            key: "0",
            headIndex: null,
            status: "deleted",
            cells: [{
              column: "form.projectName",
              status: "deleted",
              before: "プロジェクト０００",
              after: undefined
            }]
          }]
        }]
      }]
    }]
  };

  const { root } = createHarness(sampleYaml(), { initialDiffReport, readOnly: false, diffSide: "head" });
  const requestParams = block(root, "LIST_MAP=requestParams");
  const tr = requestParams.querySelector("tbody tr");

  // row exists in head but must not carry any diff highlight
  assert.ok(tr);
  assert.ok(!tr.classList.contains("diff-row-deleted"));
  assert.ok(!tr.classList.contains("diff-row-changed"));
});
