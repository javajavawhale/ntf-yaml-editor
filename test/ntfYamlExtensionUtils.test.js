const assert = require("assert");
const test = require("node:test");

const { parseGitQuery } = require("../out/lib/gitUri");
const { locateDiagnosticLine } = require("../out/lib/ntfYamlDiagnostics");
const {
  collectResourceUris,
  isNtfYamlUri,
  backingFilePath,
  hasGitPairForFileUri,
  editorViewContextForUri,
  shouldUseWebviewDiffReport,
  isInsidePath
} = require("../out/lib/ntfYamlExtensionUtils");

test("parseGitQuery handles encoded and malformed query values", () => {
  const encoded = encodeURIComponent(JSON.stringify({ path: "/tmp/case.ntf.yaml", ref: "HEAD" }));
  assert.deepEqual(parseGitQuery(encoded), { path: "/tmp/case.ntf.yaml", ref: "HEAD" });
  assert.deepEqual(parseGitQuery("%E0%A4%A"), {});
  assert.deepEqual(parseGitQuery(""), {});
});

test("collectResourceUris flattens nested SCM resource structures", () => {
  const direct = { scheme: "file", fsPath: "/tmp/direct.ntf.yaml" };
  const uriObject = { uri: { scheme: "file", fsPath: "/tmp/by-uri.ntf.yaml" } };
  const stateObject = {
    resourceStates: [
      { resourceUri: { scheme: "git", fsPath: "/tmp/from-state.ntf.yaml", query: "" } }
    ]
  };
  const nested = [[direct, uriObject], stateObject];

  const result = collectResourceUris(nested);

  assert.deepEqual(result.map(item => item.fsPath), [
    "/tmp/direct.ntf.yaml",
    "/tmp/by-uri.ntf.yaml",
    "/tmp/from-state.ntf.yaml"
  ]);
});

test("isNtfYamlUri accepts only .ntf.yaml/.ntf.yml", () => {
  assert.equal(isNtfYamlUri({ fsPath: "/tmp/a.ntf.yaml" }), true);
  assert.equal(isNtfYamlUri({ fsPath: "/tmp/a.NTF.YML" }), true);
  assert.equal(isNtfYamlUri({ fsPath: "/tmp/a.yaml" }), false);
});

test("backingFilePath prefers git query path and falls back safely", () => {
  const gitPath = encodeURIComponent(JSON.stringify({ path: "/repo/case.ntf.yaml", ref: "HEAD" }));
  assert.equal(backingFilePath({ scheme: "git", fsPath: "/tmp/ignored.ntf.yaml", query: gitPath }), "/repo/case.ntf.yaml");
  assert.equal(backingFilePath({ scheme: "git", fsPath: "/tmp/fallback.ntf.yaml", query: "not-json" }), "/tmp/fallback.ntf.yaml");
  assert.equal(backingFilePath({ scheme: "file", fsPath: "/tmp/file.ntf.yaml" }), "/tmp/file.ntf.yaml");
});

test("hasGitPairForFileUri detects SCM diff head by backing file path", () => {
  const fileUri = { scheme: "file", fsPath: "/repo/case.ntf.yaml" };
  const gitQuery = encodeURIComponent(JSON.stringify({ path: "/repo/case.ntf.yaml", ref: "HEAD" }));
  const gitUri = { scheme: "git", fsPath: "/tmp/git/case.ntf.yaml", query: gitQuery };

  assert.equal(hasGitPairForFileUri(fileUri, [gitUri]), true);
  assert.equal(hasGitPairForFileUri(fileUri, [{ ...gitUri, query: encodeURIComponent(JSON.stringify({ path: "/repo/other.ntf.yaml" })) }]), false);
  assert.equal(hasGitPairForFileUri({ ...fileUri, scheme: "untitled" }, [gitUri]), false);
});

test("editorViewContextForUri derives readonly and diff side from URI scheme", () => {
  assert.deepEqual(editorViewContextForUri({ scheme: "git" }), { diffSide: "base", readOnly: true });
  assert.deepEqual(editorViewContextForUri({ scheme: "file" }), { diffSide: "head", readOnly: false });
  assert.deepEqual(editorViewContextForUri({ scheme: "untitled" }), { diffSide: "head", readOnly: true });
});

test("shouldUseWebviewDiffReport applies diff overlay only to base or paired SCM head", () => {
  const fileUri = { scheme: "file", fsPath: "/repo/case.ntf.yaml" };
  const gitQuery = encodeURIComponent(JSON.stringify({ path: "/repo/case.ntf.yaml", ref: "HEAD" }));
  const gitUri = { scheme: "git", fsPath: "/tmp/git/case.ntf.yaml", query: gitQuery };

  assert.equal(shouldUseWebviewDiffReport(gitUri, []), true);
  assert.equal(shouldUseWebviewDiffReport(fileUri, []), false);
  assert.equal(shouldUseWebviewDiffReport(fileUri, [gitUri]), true);
});

test("isInsidePath checks descendant relationship", () => {
  assert.equal(isInsidePath("/repo/a/b/c.ntf.yaml", "/repo"), true);
  assert.equal(isInsidePath("/repo/a/b/c.ntf.yaml", "/repo/a"), true);
  assert.equal(isInsidePath("/other/a.ntf.yaml", "/repo"), false);
});

test("locateDiagnosticLine resolves best-effort target line by path tokens", () => {
  const text = [
    "case1:",
    "  LIST_MAP=testShots: #ListMap",
    "    - no: \"1\"",
    "      description: \"test\"",
    ""
  ].join("\n");

  const found = locateDiagnosticLine(text, ["LIST_MAP=testShots", "description"]);
  assert.deepEqual(found, { line: 1, length: "  LIST_MAP=testShots: #ListMap".length });

  const fallback = locateDiagnosticLine(text, ["unknown"]);
  assert.deepEqual(fallback, { line: 0, length: 1 });
});
