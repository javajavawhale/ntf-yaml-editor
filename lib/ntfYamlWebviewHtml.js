const fs = require("fs");
const path = require("path");

function renderHtmlDiffPanel(extensionRoot, webview, report, options = {}) {
  const nonce = getNonce();
  const baseState = JSON.stringify(report.baseText || "").replace(/</g, "\\u003c");
  const headState = JSON.stringify(report.headText || "").replace(/</g, "\\u003c");
  const diffReportState = JSON.stringify(report).replace(/</g, "\\u003c");
  const includeHeaderControls = options.allowDiffControls !== false;
  const modelScript = fs.readFileSync(path.join(extensionRoot, "lib", "ntfYamlModel.js"), "utf8");
  const webviewHelpersScript = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditorHelpers.js"), "utf8");
  const webviewDiffHelpersScript = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditorDiffHelpers.js"), "utf8");
  const webviewScript = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditorWebview.js"), "utf8");
  const editorCss = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditor.css"), "utf8");
  const baseRef = report.baseRef || "base";
  const headRef = report.headRef || "head";
  const baseRefValue = escapeHtmlAttribute(baseRef);
  const headRefValue = escapeHtmlAttribute(headRef);
  const baseRefHeaderHtml = includeHeaderControls
    ? `<input id="diff-base-ref" class="diff-ref-input" type="text" value="${baseRefValue}" aria-label="Base ref" title="Base ref">`
    : `<span class="diff-ref-label">${baseRefValue}</span>`;
  const headRefHeaderHtml = includeHeaderControls
    ? `<input id="diff-head-ref" class="diff-ref-input" type="text" value="${headRefValue}" aria-label="Head ref" title="Head ref">`
    : `<span class="diff-ref-label">${headRefValue}</span>`;
  const unifiedRefBarHtml = includeHeaderControls
    ? `<div class="unified-ref-bar"><input id="diff-unified-base-ref" class="diff-ref-input" type="text" value="${baseRefValue}" aria-label="Base ref" title="Base ref"><span class="unified-ref-arrow">→</span><input id="diff-unified-head-ref" class="diff-ref-input" type="text" value="${headRefValue}" aria-label="Head ref" title="Head ref"></div>`
    : `<div class="unified-ref-bar"><span class="diff-ref-label" style="padding:4px 12px">${baseRefValue}</span><span class="unified-ref-arrow">→</span><span class="diff-ref-label" style="padding:4px 12px">${headRefValue}</span></div>`;
  const layoutToggleHtml = '<div class="layout-toggle-group">'
    + '<button id="toggle-horizontal" class="diff-control-btn secondary layout-btn-active" title="横分割">横</button>'
    + '<button id="toggle-vertical" class="diff-control-btn secondary" title="縦分割">縦</button>'
    + '<button id="toggle-unified" class="diff-control-btn secondary" title="1枚表示">1枚</button>'
    + "</div>";
  const actionsHtml = includeHeaderControls
    ? [
      layoutToggleHtml,
      '<button id="diff-export-html" class="diff-control-btn secondary">Export HTML</button>',
      '<button id="diff-export-all" class="diff-control-btn secondary" title="変更のある全YAMLファイルを1ファイル1HTMLで出力">Export All</button>',
      '<span id="diff-ref-error" class="diff-panel-error"></span>'
    ].join("")
    : layoutToggleHtml;
  const panelHeaderHtml = `<div class="diff-panel-header">
      <div class="diff-panel-actions">
        ${actionsHtml}
      </div>
    </div>`;
  const headerScript = (includeHeaderControls ? `
    const baseRefInput = document.getElementById("diff-base-ref");
    const headRefInput = document.getElementById("diff-head-ref");
    const unifiedBaseRefInput = document.getElementById("diff-unified-base-ref");
    const unifiedHeadRefInput = document.getElementById("diff-unified-head-ref");
    const refError = document.getElementById("diff-ref-error");
    let refTimer = 0;
    function scheduleRefChange() {
      clearTimeout(refTimer);
      refError.textContent = "";
      unifiedBaseRefInput.value = baseRefInput.value;
      unifiedHeadRefInput.value = headRefInput.value;
      refTimer = setTimeout(() => {
        vscode.postMessage({
          type: "changeDiffRefs",
          baseRef: baseRefInput.value.trim(),
          headRef: headRefInput.value.trim()
        });
      }, 500);
    }
    function scheduleRefChangeFromUnified() {
      clearTimeout(refTimer);
      refError.textContent = "";
      baseRefInput.value = unifiedBaseRefInput.value;
      headRefInput.value = unifiedHeadRefInput.value;
      refTimer = setTimeout(() => {
        vscode.postMessage({
          type: "changeDiffRefs",
          baseRef: unifiedBaseRefInput.value.trim(),
          headRef: unifiedHeadRefInput.value.trim()
        });
      }, 500);
    }
    baseRefInput.addEventListener("input", scheduleRefChange);
    headRefInput.addEventListener("input", scheduleRefChange);
    unifiedBaseRefInput.addEventListener("input", scheduleRefChangeFromUnified);
    unifiedHeadRefInput.addEventListener("input", scheduleRefChangeFromUnified);
    document.getElementById("diff-export-html").addEventListener("click", () => vscode.postMessage({ type: "exportHtml" }));
    document.getElementById("diff-export-all").addEventListener("click", () => vscode.postMessage({ type: "exportAllHtml" }));
    window.addEventListener("message", event => {
      if (event.data.type === "diffRefError") {
        refError.textContent = event.data.message || "unknown error";
      }
    });
` : "") + `
    function setLayout(mode) {
      document.getElementById("unified-panel").style.display = mode === "unified" ? "" : "none";
      var container = document.getElementById("diff-panel-container");
      container.style.display = mode === "unified" ? "none" : "";
      container.classList.toggle("split-column", mode === "vertical");
      ["horizontal", "vertical", "unified"].forEach(function(m) {
        document.getElementById("toggle-" + m).classList.toggle("layout-btn-active", m === mode);
      });
    }
    document.getElementById("toggle-horizontal").addEventListener("click", function() { setLayout("horizontal"); });
    document.getElementById("toggle-vertical").addEventListener("click", function() { setLayout("vertical"); });
    document.getElementById("toggle-unified").addEventListener("click", function() { setLayout("unified"); });
`;

  return `<!DOCTYPE html>
<html lang="en" class="diff-panel-html">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Cell Diff</title>
  <style nonce="${nonce}">
${editorCss}
.diff-panel-html,.diff-panel-body{width:100%;height:100%;margin:0;padding:0;overflow:hidden}
.diff-panel-shell{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden}
.diff-panel-header{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;padding:6px 10px;background:var(--vscode-editorGroupHeader-tabsBackground);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-actions{display:flex;align-items:center;gap:8px}
.diff-panel-error{color:var(--vscode-errorForeground,#c0392b);font-size:12px}
.diff-ref-label{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-editor-foreground,#202124)}
.diff-panel-container{display:flex;flex:1;min-height:0;overflow:hidden}
.diff-panel-container.split-column{flex-direction:column}
.diff-panel-pane{display:flex;flex:1;flex-direction:column;overflow:hidden;min-width:0}
.diff-panel-pane+.diff-panel-pane{border-left:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-container.split-column .diff-panel-pane+.diff-panel-pane{border-left:none;border-top:1px solid var(--vscode-editorGroup-border,#ccc)}
.diff-panel-label{padding:0;font-size:12px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,#f3f5f4);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.diff-panel-label .diff-ref-label{padding:4px 12px}
.diff-panel-pane>#base-root,.diff-panel-pane>#head-root,.unified-panel>#unified-root{flex:1;min-height:0;overflow:auto}
.unified-panel{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.unified-ref-bar{display:flex;align-items:center;background:var(--vscode-editorWidget-background,#f3f5f4);border-bottom:1px solid var(--vscode-editorGroup-border,#ccc);font-size:12px}
.unified-ref-bar .diff-ref-input{flex:1;min-width:0}
.unified-ref-bar .diff-ref-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-editor-foreground,#202124)}
.unified-ref-arrow{padding:0 8px;color:var(--vscode-descriptionForeground);flex-shrink:0}
.layout-toggle-group{display:flex;gap:0}
.layout-toggle-group .diff-control-btn+.diff-control-btn{border-left:none}
.layout-btn-active{background:var(--vscode-button-background,#0078d4)!important;color:var(--vscode-button-foreground,#fff)!important;border-color:var(--vscode-button-background,#0078d4)!important}
  </style>
</head>
<body class="diff-panel-body">
  <div class="diff-panel-shell">
    ${panelHeaderHtml}
    <div id="unified-panel" class="unified-panel" style="display:none">${unifiedRefBarHtml}<div id="unified-root"></div></div>
    <div id="diff-panel-container" class="diff-panel-container">
      <div class="diff-panel-pane">
        <div class="diff-panel-label">${baseRefHeaderHtml}</div>
        <div id="base-root"></div>
      </div>
      <div class="diff-panel-pane">
        <div class="diff-panel-label">${headRefHeaderHtml}</div>
        <div id="head-root"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    ${modelScript}
    ${webviewHelpersScript}
    ${webviewDiffHelpersScript}
    ${webviewScript}
    const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage() {} };
    const diffReport = ${diffReportState};
    ${headerScript}
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("base-root"),
      initialText: ${baseState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "base",
      allowDiffControls: false,
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("head-root"),
      initialText: ${headState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "head",
      allowDiffControls: false,
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("unified-root"),
      initialText: ${headState},
      initialDiffReport: diffReport,
      readOnly: true,
      diffSide: "unified",
      allowDiffControls: false,
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
  </script>
</body>
</html>`;
}

function renderStandaloneHtmlDiffPanel(extensionRoot, report) {
  return renderHtmlDiffPanel(extensionRoot, undefined, report, { allowDiffControls: false });
}

function renderHtml(extensionRoot, webview, initialText, options = {}) {
  const nonce = getNonce();
  const initialState = JSON.stringify(options.initialText ?? initialText).replace(/</g, "\\u003c");
  const webviewDiffReport = options.webviewDiffReport !== undefined ? options.webviewDiffReport : (options.diffReport || null);
  const initialDiffReport = JSON.stringify(webviewDiffReport).replace(/</g, "\\u003c");
  const initialReadOnly = options.readOnly ? "true" : "false";
  const initialDiffSide = JSON.stringify(options.diffSide || (options.readOnly ? "base" : "head"));
  const initialSidebarWidth = JSON.stringify(options.sidebarWidth || 240);
  const modelScript = fs.readFileSync(path.join(extensionRoot, "lib", "ntfYamlModel.js"), "utf8");
  const webviewHelpersScript = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditorHelpers.js"), "utf8");
  const webviewDiffHelpersScript = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditorDiffHelpers.js"), "utf8");
  const webviewScript = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditorWebview.js"), "utf8");
  const editorCss = fs.readFileSync(path.join(extensionRoot, "media", "ntfYamlEditor.css"), "utf8");
  const scmRef = options.diffReport
    ? (options.diffSide === "head" ? options.diffReport.headRef : options.diffReport.baseRef)
    : "";
  const scmHeader = options.diffReport && scmRef
    ? `<div class="scm-diff-header"><input class="diff-ref-input" type="text" value="${escapeHtmlAttribute(scmRef)}" readonly aria-label="Git ref" title="Git ref"></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" class="${options.diffReport ? "scm-diff-html" : ""}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NTF YAML Editor</title>
  <style nonce="${nonce}">
${editorCss}

  </style>
</head>
<body class="${options.diffReport ? "scm-diff-body" : ""}">
  ${scmHeader}
  <div id="root"></div>
  <script nonce="${nonce}">
    ${modelScript}
    ${webviewHelpersScript}
    ${webviewDiffHelpersScript}
    ${webviewScript}
    const vscode = acquireVsCodeApi();
    globalThis.NtfYamlEditorWebview.createNtfYamlEditorApp({
      root: document.getElementById("root"),
      initialText: ${initialState},
      initialDiffReport: ${initialDiffReport},
      readOnly: ${initialReadOnly},
      diffSide: ${initialDiffSide},
      sidebarWidth: ${initialSidebarWidth},
      model: globalThis.NtfYamlModel,
      vscode,
      window
    });
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  renderHtml,
  renderHtmlDiffPanel,
  renderStandaloneHtmlDiffPanel
};
