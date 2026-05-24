#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createDiffReport } = require("../out/lib/ntfYamlDiff");
const { parseYaml } = require("../out/lib/ntfYamlModel");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-artifacts", "ui-screenshots");
const htmlDir = path.join(outDir, "html");
const chromium = process.env.CHROME_BIN || findChromium();

if (!chromium) {
  console.error("Chromium was not found. Set CHROME_BIN to a Chromium/Chrome executable.");
  process.exit(1);
}

fs.mkdirSync(htmlDir, { recursive: true });
const helperScript = fs.readFileSync(path.join(root, "media", "ntfYamlEditorHelpers.js"), "utf8");
const diffHelperScript = fs.readFileSync(path.join(root, "media", "ntfYamlEditorDiffHelpers.js"), "utf8");
const webviewScript = fs.readFileSync(path.join(root, "media", "ntfYamlEditorWebview.js"), "utf8");
const editorCss = fs.readFileSync(path.join(root, "media", "ntfYamlEditor.css"), "utf8");

const baseText = [
  "case1:",
  "  LIST_MAP=requestParams: #ListMap",
  "    - no: \"1\"",
  "      name: \"before\"",
  "      note: \"same\"",
  "    - no: \"0\"",
  "      name: \"deleted row\"",
  "      note: \"base only\"",
  "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
  "    - [ \"001\", \"Tokyo\", ~ ]",
  ""
].join("\n");

const headText = [
  "case1:",
  "  LIST_MAP=requestParams: #ListMap",
  "    - no: \"1\"",
  "      name: \"after\"",
  "      note: \"same\"",
  "    - no: \"2\"",
  "      name: \"added row\"",
  "      note: \"head only\"",
  "  EXPECTED_VARIABLE=./tmp/result.csv: #RawRows",
  "    - [ \"001\", \"Tokyo\", ~ ]",
  ""
].join("\n");

const rawRowsBaseText = [
  "case1:",
  "  SETUP_VARIABLE[1]=customer.csv: #RawRows",
  "    - [ \"text-encoding\", \"UTF-8\" ]",
  "    - [ \"field-separator\", \",\" ]",
  "    - [ \"quoting-delimiter\", \"\\\"\" ]",
  "    - [ \"header\", \"recordType\", \"createdAt\" ]",
  "    - [ \"\", \"X\", \"X\" ]",
  "    - [ \"\", \"H\", \"2026-05-09\" ]",
  "    - [ \"data\", \"customerId\", \"city\", \"status\" ]",
  "    - [ \"\", \"9\", \"X\", \"X\" ]",
  "    - [ \"\", \"001\", \"Tokyo\", \"active\" ]",
  "    - [ \"\", \"002\", \"Osaka\", \"inactive\" ]",
  "    - [ \"end\", \"recordType\", \"count\" ]",
  "    - [ \"\", \"X\", \"9\" ]",
  "    - [ \"\", \"E\", \"2\" ]",
  "",
  "  EXPECTED_VARIABLE=./tmp/result-fixed.dat: #RawRows",
  "    - [ \"text-encoding\", \"MS932\" ]",
  "    - [ \"record-separator\", \"CRLF\" ]",
  "    - [ \"record-length\", \"20\" ]",
  "    - [ \"data\", \"code\", \"amount\" ]",
  "    - [ \"\", \"X\", \"9\" ]",
  "    - [ \"\", \"A001\", \"100\" ]",
  ""
].join("\n");

const rawRowsHeadText = [
  "case1:",
  "  SETUP_VARIABLE[1]=customer.csv: #RawRows",
  "    - [ \"text-encoding\", \"UTF-8\" ]",
  "    - [ \"field-separator\", \",\" ]",
  "    - [ \"quoting-delimiter\", \"\\\"\" ]",
  "    - [ \"header\", \"recordType\", \"createdAt\" ]",
  "    - [ \"\", \"X\", \"X\" ]",
  "    - [ \"\", \"H\", \"2026-05-10\" ]",
  "    - [ \"data\", \"customerId\", \"city\", \"status\" ]",
  "    - [ \"\", \"9\", \"X\", \"X\" ]",
  "    - [ \"\", \"001\", \"Tokyo\", \"active\" ]",
  "    - [ \"\", \"002\", \"Kyoto\", \"active\" ]",
  "    - [ \"\", \"003\", \"Nara\", \"active\" ]",
  "    - [ \"end\", \"recordType\", \"count\" ]",
  "    - [ \"\", \"X\", \"9\" ]",
  "    - [ \"\", \"E\", \"3\" ]",
  "",
  "  EXPECTED_VARIABLE=./tmp/result-fixed.dat: #RawRows",
  "    - [ \"text-encoding\", \"MS932\" ]",
  "    - [ \"record-separator\", \"CRLF\" ]",
  "    - [ \"record-length\", \"20\" ]",
  "    - [ \"data\", \"code\", \"amount\" ]",
  "    - [ \"\", \"X\", \"9\" ]",
  "    - [ \"\", \"A001\", \"150\" ]",
  ""
].join("\n");

const diffReport = createDiffReport({
  path: "case.ntf.yaml",
  baseRef: "HEAD",
  headRef: "working tree",
  baseText,
  headText,
  repositoryPath: root
});

const rawRowsDiffReport = createDiffReport({
  path: "rawrows.ntf.yaml",
  baseRef: "HEAD",
  headRef: "working tree",
  baseText: rawRowsBaseText,
  headText: rawRowsHeadText,
  repositoryPath: root
});

const multiSheetText = [
  "sheet1:",
  "  LIST_MAP=params: #ListMap",
  "    - no: \"1\"",
  "      name: \"hello\"",
  "sheet2:",
  "  LIST_MAP=other: #ListMap",
  "    - code: \"A\"",
  "      value: \"x\"",
  ""
].join("\n");

const pages = [
  {
    name: "editor",
    html: renderAppHtml({
      title: "NTF YAML Editor",
      initialText: headText,
      diffReport: null,
      readOnly: false,
      diffSide: "head"
    }),
    checks: {
      visible: [
        "#root .app",
        ".sidebar-content",
        ".side-toolbar [data-action='save']",
        "[data-action='add-row']",
        "[data-action='add-column']",
        ".rawrows-table",
        ".table-scroll--with-row-actions"
      ],
      exists: [
        ".row-action-bar",
        ".col-action-bar",
        "[title='Delete row']",
        "[title='Delete column']",
        "[title='Delete raw row']",
        "[title='Delete raw column']"
      ],
      focusVisible: [
        { focus: "[data-role='column-name']", visible: ".col-action-bar" },
        { focus: "[data-column='name']", visible: ".row-action-bar" }
      ],
      hoverChecks: [
        {
          hover: "[data-column='name']",
          activeColIndex: "1",
          visible: "th.col-active .col-action-bar",
          singleActiveColumn: true
        },
        {
          hover: "th[data-col-index='2']",
          activeColIndex: "2",
          visible: "th.col-active .col-action-bar",
          singleActiveColumn: true
        }
      ],
      geometryChecks: [
        {
          type: "centeredWithin",
          element: "th[data-col-index='1'] .col-action-bar",
          container: "th[data-col-index='1']",
          tolerance: 2,
          activate: { hover: "[data-column='name']" }
        },
        {
          type: "touchesLeftEdge",
          element: "tbody tr:first-child .row-action-bar",
          container: "tbody tr:first-child > td:first-child",
          tolerance: 2,
          activate: { focus: "tbody tr:first-child [data-column='no']" }
        },
        {
          type: "outsideAbove",
          element: "th[data-col-index='1'] .col-action-bar",
          container: "th[data-col-index='1']",
          activate: { hover: "[data-column='name']" }
        },
        {
          type: "outsideLeft",
          element: "tbody tr:first-child .row-action-bar",
          container: "tbody tr:first-child > td:first-child",
          tolerance: 2,
          activate: { focus: "tbody tr:first-child [data-column='no']" }
        }
      ],
      focusChecks: [
        {
          focus: "[data-column='no']",
          rowFocused: true,
          colFocusedIndex: "0"
        },
        {
          focus: "[data-column='name']",
          rowFocused: true,
          colFocusedIndex: "1"
        }
      ],
      styleNot: [
        { selector: ".app aside", property: "overflowY", values: ["auto", "scroll"] },
        { selector: ".sidebar-content", property: "overflowY", values: ["visible", "hidden"] }
      ],
      hidden: [".diff-legend", ".scm-diff-header"]
    }
  },
  {
    name: "editor-focused",
    html: renderAppHtml({
      title: "NTF YAML Editor (focused)",
      initialText: headText,
      diffReport: null,
      readOnly: false,
      diffSide: "head",
      initFocus: "[data-column='name']"
    }),
    checks: {
      visible: [
        "tr.row-focused",
        "tr.row-focused .row-action-bar",
        "tr.row-focused > td:first-child",
        "th.col-focused",
        "th.col-focused .col-action-bar"
      ],
      exists: [
        "th[data-col-index='0']",
        "th[data-col-index='1']",
        "th[data-col-index='2']"
      ]
    }
  },
  {
    name: "editor-multi-sheet",
    html: renderAppHtml({
      title: "NTF YAML Editor (multi-sheet)",
      initialText: multiSheetText,
      diffReport: null,
      readOnly: false,
      diffSide: "head"
    }),
    checks: {
      visible: [
        ".sheet[role='button']",
        ".sheet.active"
      ],
      exists: [
        ".sheet[tabindex='0']"
      ],
      hidden: [
        ".sheet[role='button'] .drag-handle"
      ]
    }
  },
  {
    name: "scm-base",
    html: renderAppHtml({
      title: "NTF YAML SCM Base",
      initialText: baseText,
      diffReport,
      readOnly: true,
      diffSide: "base"
    }),
    checks: {
      visible: [
        ".scm-diff-header",
        "#root .app.diff-app",
        ".diff-legend",
        ".diff-cell-changed"
      ],
      hidden: [
        "[data-action='save']",
        "[data-action='add-row']",
        "[data-action='add-column']"
      ]
    }
  },
  {
    name: "cell-diff",
    html: renderCellDiffHtml(diffReport, { controls: true }),
    checks: {
      visible: [
        ".diff-panel-shell",
        ".diff-panel-container",
        ".diff-panel-pane",
        "#base-root .app.diff-app",
        "#head-root .app.diff-app",
        "#toggle-horizontal.layout-btn-active",
        "#diff-base-ref",
        "#diff-head-ref",
        "#base-root .diff-cell-changed",
        "#head-root .diff-cell-changed"
      ],
      hidden: ["#unified-panel", "#unified-root .app"]
    }
  },
  {
    name: "cell-diff-unified",
    html: renderCellDiffHtml(diffReport, { controls: true, initialLayout: "unified" }),
    checks: {
      visible: [
        "#unified-panel",
        "#unified-root .app.diff-app.unified-view",
        "#toggle-unified.layout-btn-active",
        ".cell-unified-diff",
        ".diff-cell-changed"
      ],
      hoverChecks: [
        {
          hover: "#unified-root .diff-cell-changed",
          activeColIndex: "1",
          singleActiveColumn: true
        }
      ],
      hidden: [".diff-panel-container"]
    }
  },
  {
    name: "export-html",
    html: renderCellDiffHtml(diffReport, { controls: false }),
    checks: {
      visible: [
        ".diff-panel-shell",
        ".diff-panel-container",
        ".layout-toggle-group",
        "#diff-panel-container .diff-ref-label",
        "#base-root .app.diff-app",
        "#head-root .app.diff-app"
      ],
      hidden: [
        "#diff-base-ref",
        "#diff-head-ref"
      ],
      textAbsent: ["Export HTML", "Export All"]
    }
  },
  {
    name: "rawrows-cell-diff",
    html: renderCellDiffHtml(rawRowsDiffReport, { controls: true }),
    checks: {
      visible: [
        ".diff-panel-shell",
        "#base-root .rawrows-table",
        "#head-root .rawrows-table",
        "#head-root .raw-metadata-row",
        "#head-root .raw-section-header-row",
        "#head-root .diff-cell-changed",
        "#head-root .diff-row-changed",
        "#head-root .diff-row-added"
      ],
      styleNot: [
        {
          selector: "#head-root .diff-row-changed td:not(.diff-cell-changed)",
          property: "backgroundColor",
          values: ["rgba(0, 0, 0, 0)", "rgb(255, 255, 255)"]
        }
      ],
      textPresent: ["text-encoding", "field-separator", "header", "data", "end", "Osaka", "Kyoto", "Nara", "record-length", "A001", "150"]
    }
  },
  {
    name: "rawrows-cell-diff-unified",
    html: renderCellDiffHtml(rawRowsDiffReport, { controls: true, initialLayout: "unified" }),
    checks: {
      visible: [
        "#unified-panel",
        "#unified-root .app.diff-app.unified-view",
        "#unified-root .block"
      ],
      exists: [
        "#unified-root .rawrows-table",
        "#unified-root [data-raw-column]",
        "#unified-root .diff-cell-changed",
        "#unified-root .diff-row-changed",
        "#unified-root .diff-row-added"
      ],
      hidden: [".diff-panel-container"],
      textPresent: ["text-encoding", "header", "data", "end", "Osaka", "Kyoto", "Nara", "record-length", "A001", "150"]
    }
  }
];

for (const page of pages) {
  const htmlPath = path.join(htmlDir, `${page.name}.html`);
  const pngPath = path.join(outDir, `${page.name}.png`);
  fs.writeFileSync(htmlPath, injectUiRegressionScript(page.html, page.checks), "utf8");
  screenshot(htmlPath, pngPath);
  validatePage(htmlPath, page.checks);
  console.log(`wrote ${path.relative(root, pngPath)}`);
}

function renderAppHtml(options) {
  const scmRef = options.diffReport
    ? (options.diffSide === "head" ? options.diffReport.headRef : options.diffReport.baseRef)
    : "";
  const scmHeader = options.diffReport && scmRef
    ? `<div class="scm-diff-header"><input class="diff-ref-input" type="text" value="${escapeHtml(scmRef)}" readonly aria-label="Git ref" title="Git ref"></div>`
    : "";
  const initFocusScript = options.initFocus
    ? `document.querySelector(${json(options.initFocus)})?.focus();`
    : "";
  return htmlDocument(options.title, `
    ${scmHeader}
    <div id="root"></div>
    <script>
      ${runtimeScript()}
      globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
        root: document.getElementById("root"),
        initialModel: ${json(parseYaml(options.initialText))},
        initialDiffReport: ${json(options.diffReport || null)},
        readOnly: ${options.readOnly ? "true" : "false"},
        diffSide: ${json(options.diffSide)},
        vscode: acquireVsCodeApi(),
        window
      });
      ${initFocusScript}
    </script>
  `, {
    htmlClass: options.diffReport ? "scm-diff-html" : "",
    bodyClass: options.diffReport ? "scm-diff-body" : ""
  });
}

function renderCellDiffHtml(report, options) {
  const baseHeader = options.controls
    ? `<input id="diff-base-ref" class="diff-ref-input" type="text" value="${escapeHtml(report.baseRef)}" aria-label="Base ref" title="Base ref">`
    : `<span class="diff-ref-label">${escapeHtml(report.baseRef)}</span>`;
  const headHeader = options.controls
    ? `<input id="diff-head-ref" class="diff-ref-input" type="text" value="${escapeHtml(report.headRef)}" aria-label="Head ref" title="Head ref">`
    : `<span class="diff-ref-label">${escapeHtml(report.headRef)}</span>`;
  const unifiedRefBar = options.controls
    ? `<div class="unified-ref-bar"><input id="diff-unified-base-ref" class="diff-ref-input" type="text" value="${escapeHtml(report.baseRef)}" aria-label="Base ref" title="Base ref"><span class="unified-ref-arrow">→</span><input id="diff-unified-head-ref" class="diff-ref-input" type="text" value="${escapeHtml(report.headRef)}" aria-label="Head ref" title="Head ref"></div>`
    : `<div class="unified-ref-bar"><span class="diff-ref-label" style="padding:4px 12px">${escapeHtml(report.baseRef)}</span><span class="unified-ref-arrow">→</span><span class="diff-ref-label" style="padding:4px 12px">${escapeHtml(report.headRef)}</span></div>`;
  const layoutToggle = '<div class="layout-toggle-group">'
    + '<button id="toggle-horizontal" class="diff-control-btn secondary layout-btn-active" title="横分割">横</button>'
    + '<button id="toggle-vertical" class="diff-control-btn secondary" title="縦分割">縦</button>'
    + '<button id="toggle-unified" class="diff-control-btn secondary" title="1枚表示">1枚</button>'
    + '</div>';
  const actions = options.controls
    ? `${layoutToggle}<button class="diff-control-btn secondary">Export HTML</button><button class="diff-control-btn secondary">Export All</button>`
    : layoutToggle;
  const panelHeader = `<div class="diff-panel-header">
        <div class="diff-panel-actions">${actions}</div>
      </div>`;

  return htmlDocument("NTF YAML Cell Diff", `
    <div class="diff-panel-shell">
      ${panelHeader}
      <div id="unified-panel" class="unified-panel" style="display:none">${unifiedRefBar}<div id="unified-root"></div></div>
      <div id="diff-panel-container" class="diff-panel-container">
        <div class="diff-panel-pane">
          <div class="diff-panel-label">${baseHeader}</div>
          <div id="base-root"></div>
        </div>
        <div class="diff-panel-pane">
          <div class="diff-panel-label">${headHeader}</div>
          <div id="head-root"></div>
        </div>
      </div>
    </div>
    <script>
      ${runtimeScript()}
      const diffReport = ${json(report)};
      globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
        root: document.getElementById("base-root"),
        initialModel: ${json(parseYaml(report.baseText))},
        initialDiffReport: diffReport,
        readOnly: true,
        diffSide: "base",
        vscode: acquireVsCodeApi(),
        window
      });
      globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
        root: document.getElementById("head-root"),
        initialModel: ${json(parseYaml(report.headText))},
        initialDiffReport: diffReport,
        readOnly: true,
        diffSide: "head",
        vscode: acquireVsCodeApi(),
        window
      });
      globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
        root: document.getElementById("unified-root"),
        initialModel: ${json(parseYaml(report.headText))},
        initialDiffReport: diffReport,
        readOnly: true,
        diffSide: "unified",
        vscode: acquireVsCodeApi(),
        window
      });
      document.getElementById("toggle-horizontal").addEventListener("click", function() { setLayout("horizontal"); });
      document.getElementById("toggle-vertical").addEventListener("click", function() { setLayout("vertical"); });
      document.getElementById("toggle-unified").addEventListener("click", function() { setLayout("unified"); });
      function setLayout(mode) {
        document.getElementById("unified-panel").style.display = mode === "unified" ? "" : "none";
        var container = document.getElementById("diff-panel-container");
        container.style.display = mode === "unified" ? "none" : "";
        container.classList.toggle("split-column", mode === "vertical");
        ["horizontal", "vertical", "unified"].forEach(function(m) {
          document.getElementById("toggle-" + m).classList.toggle("layout-btn-active", m === mode);
        });
      }
      setLayout(${json(options.initialLayout || "horizontal")});
    </script>
  `, { htmlClass: "diff-panel-html", bodyClass: "diff-panel-body" });
}

function htmlDocument(title, body, options = {}) {
  const htmlClass = options.htmlClass || "";
  const bodyClass = options.bodyClass || "";
  return [
    "<!doctype html>",
    htmlClass ? `<html lang="en" class="${escapeHtml(htmlClass)}">` : '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    editorCss,
    "</style>",
    "</head>",
    bodyClass ? `<body class="${escapeHtml(bodyClass)}">` : "<body>",
    body,
    "</body>",
    "</html>"
  ].join("\n");
}

function runtimeScript() {
  return [
    "window.acquireVsCodeApi = window.acquireVsCodeApi || function() { return { postMessage() {} }; };",
    helperScript,
    diffHelperScript,
    webviewScript
  ].join("\n");
}

function injectUiRegressionScript(html, checks) {
  const script = `
<script>
(function() {
  const checks = ${json(checks || {})};
  function visibleElement(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0;
  }
  function visible(selector) {
    return visibleElement(document.querySelector(selector));
  }
  function hidden(selector) {
    const element = document.querySelector(selector);
    if (!element) return true;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display === "none"
      || style.visibility === "hidden"
      || rect.width === 0
      || rect.height === 0;
  }
  function trigger(item) {
    if (!item) return;
    if (item.focusBeforeHover) {
      const target = document.querySelector(item.focusBeforeHover);
      if (target) {
        target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        target.focus();
        target.dispatchEvent(new FocusEvent("focus", { bubbles: false, relatedTarget: null }));
        target.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: null }));
        const table = target.closest("table");
        const cell = target.closest("td");
        const row = target.closest("tr");
        if (table && cell && row) {
          table.classList.add("has-focused-cell");
          table.dataset.focusLocked = "true";
          row.classList.add("row-focused");
          const header = table.querySelectorAll("thead th")[cell.cellIndex];
          if (header) {
            header.classList.add("col-focused", "col-active");
          }
        }
      }
    }
    if (item.hover) {
      const target = document.querySelector(item.hover);
      if (target) {
        target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true, view: window }));
      }
    }
    if (item.focus) {
      const target = document.querySelector(item.focus);
      if (target) target.focus();
    }
  }
  function cleanupInteractionState() {
    document.querySelectorAll(".row-focused, .col-focused, .col-active").forEach(function(el) {
      el.classList.remove("row-focused", "col-focused", "col-active");
    });
    document.querySelectorAll(".has-focused-cell").forEach(function(el) {
      el.classList.remove("has-focused-cell");
      delete el.dataset.focusLocked;
    });
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }
  function report() {
    const failures = [];
    const visibleTextRoot = document.body.cloneNode(true);
    visibleTextRoot.querySelectorAll("script,style,#ui-regression-result").forEach(function(element) {
      element.remove();
    });
    const inputValues = Array.from(document.querySelectorAll("input,textarea"))
      .map(function(element) { return element.value || ""; })
      .join("\\n");
    const visibleText = visibleTextRoot.textContent + "\\n" + inputValues;
    for (const selector of checks.visible || []) {
      if (!visible(selector)) failures.push("expected visible: " + selector);
    }
    for (const selector of checks.exists || []) {
      if (!document.querySelector(selector)) failures.push("expected present: " + selector);
    }
    for (const item of checks.focusVisible || []) {
      const target = document.querySelector(item.focus);
      if (!target) {
        failures.push("expected focus target: " + item.focus);
        continue;
      }
      target.focus();
      if (!visible(item.visible)) failures.push("expected visible after focus " + item.focus + ": " + item.visible);
      cleanupInteractionState();
    }
    for (const item of checks.hoverChecks || []) {
      const target = document.querySelector(item.hover);
      if (!target) {
        failures.push("expected hover target: " + item.hover);
        continue;
      }
      trigger({ hover: item.hover });
      if (item.visible && !visible(item.visible)) {
        failures.push("expected visible after hover " + item.hover + ": " + item.visible);
      }
      if (item.focusedColIndex !== undefined) {
        const focused = document.querySelector("th.col-focused");
        if (!focused) {
          failures.push("expected th.col-focused after hover on: " + item.hover);
        } else if (String(focused.dataset.colIndex) !== String(item.focusedColIndex)) {
          failures.push("expected th.col-focused[data-col-index=" + item.focusedColIndex + "] but got " + focused.dataset.colIndex + " (hover: " + item.hover + ")");
        }
      }
      if (item.focusedRowCount !== undefined && document.querySelectorAll("tr.row-focused").length !== Number(item.focusedRowCount)) {
        failures.push("expected " + item.focusedRowCount + " tr.row-focused after hover on: " + item.hover);
      }
      if (item.activeRowActionCount !== undefined) {
        const count = Array.from(document.querySelectorAll(".row-action-bar")).filter(function(element) {
          return visibleElement(element);
        }).length;
        if (count !== Number(item.activeRowActionCount)) {
          failures.push("expected " + item.activeRowActionCount + " visible .row-action-bar after hover on " + item.hover + " but got " + count);
        }
      }
      if (item.singleActiveColumn && document.querySelectorAll("th.col-active").length !== 1) {
        failures.push("expected exactly one th.col-active after hover on: " + item.hover);
      }
      if (item.activeColIndex !== undefined) {
        const active = document.querySelector("th.col-active");
        if (!active) {
          failures.push("expected th.col-active after hover on: " + item.hover);
        } else if (String(active.dataset.colIndex) !== String(item.activeColIndex)) {
          failures.push("expected th.col-active[data-col-index=" + item.activeColIndex + "] but got " + active.dataset.colIndex + " (hover: " + item.hover + ")");
        }
      }
      cleanupInteractionState();
    }
    for (const item of checks.focusChecks || []) {
      const target = document.querySelector(item.focus);
      if (!target) {
        failures.push("expected focusCheck target: " + item.focus);
        continue;
      }
      target.focus();
      if (item.rowFocused && !document.querySelector("tr.row-focused")) {
        failures.push("expected tr.row-focused after focus on: " + item.focus);
      }
      if (item.colFocusedIndex !== undefined) {
        const cf = document.querySelector("th.col-focused");
        if (!cf) {
          failures.push("expected th.col-focused after focus on: " + item.focus);
        } else if (String(cf.dataset.colIndex) !== String(item.colFocusedIndex)) {
          failures.push("expected th.col-focused[data-col-index=" + item.colFocusedIndex + "] but got " + cf.dataset.colIndex + " (focus: " + item.focus + ")");
        }
      }
      cleanupInteractionState();
    }
    for (const item of checks.geometryChecks || []) {
      trigger(item.activate);
      const element = document.querySelector(item.element);
      const container = document.querySelector(item.container);
      if (!element || !container) {
        failures.push("expected geometry targets: " + item.element + " / " + item.container);
        cleanupInteractionState();
        continue;
      }
      const er = element.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      const tolerance = item.tolerance == null ? 1 : Number(item.tolerance);
      if (item.type === "centeredWithin") {
        const ec = er.left + er.width / 2;
        const cc = cr.left + cr.width / 2;
        if (Math.abs(ec - cc) > tolerance) {
          failures.push("expected " + item.element + " centered within " + item.container + " (delta " + Math.abs(ec - cc).toFixed(2) + ")");
        }
      } else if (item.type === "touchesLeftEdge") {
        if (Math.abs(er.right - cr.left) > tolerance) {
          failures.push("expected " + item.element + " right edge to touch " + item.container + " left edge");
        }
      } else if (item.type === "outsideAbove") {
        if (!(er.top < cr.top - tolerance)) {
          failures.push("expected " + item.element + " outside above " + item.container);
        }
      } else if (item.type === "outsideLeft") {
        if (!(er.right <= cr.left + tolerance)) {
          failures.push("expected " + item.element + " outside left of " + item.container);
        }
      }
      cleanupInteractionState();
    }
    for (const item of checks.styleNot || []) {
      const target = document.querySelector(item.selector);
      if (!target) {
        failures.push("expected style target: " + item.selector);
        continue;
      }
      const actual = window.getComputedStyle(target)[item.property];
      if ((item.values || []).includes(actual)) {
        failures.push("expected " + item.selector + " " + item.property + " not to be " + actual);
      }
    }
    for (const selector of checks.hidden || []) {
      if (!hidden(selector)) failures.push("expected hidden or absent: " + selector);
    }
    for (const text of checks.textPresent || []) {
      if (!visibleText.includes(text)) failures.push("expected text: " + text);
    }
    for (const text of checks.textAbsent || []) {
      if (visibleText.includes(text)) failures.push("unexpected text: " + text);
    }
    const marker = document.createElement("pre");
    marker.id = "ui-regression-result";
    marker.hidden = true;
    marker.textContent = failures.length ? "FAIL\\n" + failures.join("\\n") : "PASS";
    document.body.append(marker);
  }
  if (document.readyState === "complete") {
    setTimeout(report, 0);
  } else {
    window.addEventListener("load", function() { setTimeout(report, 0); });
  }
})();
</script>`;
  return html.replace("</body>", `${script}\n</body>`);
}

function screenshot(htmlPath, pngPath) {
  const result = spawnSync(chromium, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1365,900",
    `--screenshot=${pngPath}`,
    pathToFileUrl(htmlPath)
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Chromium exited with ${result.status}`);
  }
}

function validatePage(htmlPath, checks) {
  const result = spawnSync(chromium, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1365,900",
    "--virtual-time-budget=1000",
    "--dump-dom",
    pathToFileUrl(htmlPath)
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Chromium exited with ${result.status}`);
  }
  const match = result.stdout.match(/<pre id="ui-regression-result"[^>]*>([\s\S]*?)<\/pre>/);
  const text = match ? unescapeHtml(match[1]) : "";
  if (!text.startsWith("PASS")) {
    throw new Error(`UI regression check failed for ${path.basename(htmlPath)}:\n${text || result.stdout.slice(-2000)}`);
  }
}

function findChromium() {
  for (const candidate of ["/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function pathToFileUrl(filePath) {
  return "file://" + path.resolve(filePath).split(path.sep).map(encodeURIComponent).join("/");
}

function json(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(value) {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
