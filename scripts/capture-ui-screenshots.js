#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createDiffReport } = require("../lib/ntfYamlDiff");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test-artifacts", "ui-screenshots");
const htmlDir = path.join(outDir, "html");
const chromium = process.env.CHROME_BIN || findChromium();

if (!chromium) {
  console.error("Chromium was not found. Set CHROME_BIN to a Chromium/Chrome executable.");
  process.exit(1);
}

fs.mkdirSync(htmlDir, { recursive: true });

const modelScript = fs.readFileSync(path.join(root, "lib", "ntfYamlModel.js"), "utf8");
const webviewScript = fs.readFileSync(path.join(root, "media", "ntfYamlEditorWebview.js"), "utf8");
const editorCss = fs.readFileSync(path.join(root, "media", "ntfYamlEditor.css"), "utf8");

const baseText = [
  "case1:",
  "  LIST_MAP=requestParams: #ListMap",
  "    - no: \"1\"",
  "      name: \"before\"",
  "      note: \"same\"",
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

const diffReport = createDiffReport({
  path: "case.ntf.yaml",
  baseRef: "HEAD",
  headRef: "working tree",
  baseText,
  headText,
  repositoryPath: root
});

const pages = [
  {
    name: "editor",
    html: renderAppHtml({
      title: "NTF YAML Editor",
      initialText: headText,
      diffReport: null,
      readOnly: false,
      diffSide: "head"
    })
  },
  {
    name: "scm-base",
    html: renderAppHtml({
      title: "NTF YAML SCM Base",
      initialText: baseText,
      diffReport,
      readOnly: true,
      diffSide: "base",
      scmRef: diffReport.baseRef
    })
  },
  {
    name: "cell-diff",
    html: renderCellDiffHtml(diffReport, { controls: true })
  },
  {
    name: "export-html",
    html: renderCellDiffHtml(diffReport, { controls: false })
  }
];

for (const page of pages) {
  const htmlPath = path.join(htmlDir, `${page.name}.html`);
  const pngPath = path.join(outDir, `${page.name}.png`);
  fs.writeFileSync(htmlPath, page.html, "utf8");
  screenshot(htmlPath, pngPath);
  console.log(`wrote ${path.relative(root, pngPath)}`);
}

function renderAppHtml(options) {
  const scmHeader = options.scmRef
    ? `<div class="scm-diff-header"><input class="diff-ref-input" type="text" value="${escapeHtml(options.scmRef)}" readonly aria-label="Git ref" title="Git ref"></div>`
    : "";
  return htmlDocument(options.title, `
    ${scmHeader}
    <div id="root"></div>
    <script>
      ${runtimeScript()}
      globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
        root: document.getElementById("root"),
        initialText: ${json(options.initialText)},
        initialDiffReport: ${json(options.diffReport || null)},
        readOnly: ${options.readOnly ? "true" : "false"},
        diffSide: ${json(options.diffSide)},
        model: globalThis.NtfYamlModel,
        vscode: acquireVsCodeApi(),
        window
      });
    </script>
  `);
}

function renderCellDiffHtml(report, options) {
  const baseHeader = options.controls
    ? `<input id="diff-base-ref" class="diff-ref-input" type="text" value="${escapeHtml(report.baseRef)}" aria-label="Left ref" title="Left ref">`
    : `<span class="diff-ref-label">${escapeHtml(report.baseRef)}</span>`;
  const headHeader = options.controls
    ? `<input id="diff-head-ref" class="diff-ref-input" type="text" value="${escapeHtml(report.headRef)}" aria-label="Right ref" title="Right ref">`
    : `<span class="diff-ref-label">${escapeHtml(report.headRef)}</span>`;
  const actions = options.controls
    ? '<button class="diff-control-btn secondary">Export HTML</button><button class="diff-control-btn secondary">Export All</button>'
    : "";

  return htmlDocument("NTF YAML Cell Diff", `
    <div class="diff-panel-shell">
      <div class="diff-panel-header">
        <div class="diff-panel-actions">${actions}</div>
      </div>
      <div class="diff-panel-container">
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
        initialText: ${json(report.baseText)},
        initialDiffReport: diffReport,
        readOnly: true,
        diffSide: "base",
        model: globalThis.NtfYamlModel,
        vscode: acquireVsCodeApi(),
        window
      });
      globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
        root: document.getElementById("head-root"),
        initialText: ${json(report.headText)},
        initialDiffReport: diffReport,
        readOnly: true,
        diffSide: "head",
        model: globalThis.NtfYamlModel,
        vscode: acquireVsCodeApi(),
        window
      });
    </script>
  `);
}

function htmlDocument(title, body) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    editorCss,
    ".diff-panel-shell{display:flex;flex-direction:column;height:100vh;overflow:hidden}",
    ".diff-panel-header{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;padding:6px 10px;background:var(--vscode-editorGroupHeader-tabsBackground);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc)}",
    ".diff-panel-actions{display:flex;align-items:center;gap:8px}",
    ".diff-panel-container{display:flex;flex:1;min-height:0;overflow:hidden}",
    ".diff-panel-pane{flex:1;overflow:auto;min-width:0}",
    ".diff-panel-pane+.diff-panel-pane{border-left:1px solid var(--vscode-editorGroup-border,#ccc)}",
    ".diff-panel-label{padding:0;font-size:12px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,#f3f5f4);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".diff-panel-label .diff-ref-label{padding:4px 12px}",
    "</style>",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>"
  ].join("\n");
}

function runtimeScript() {
  return [
    "window.acquireVsCodeApi = window.acquireVsCodeApi || function() { return { postMessage() {} }; };",
    modelScript,
    webviewScript
  ].join("\n");
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
