const path = require("path");
const { parseGitQuery } = require("./gitUri");

function collectResourceUris(items) {
  const result = [];
  for (const item of items || []) {
    collectResourceUrisInto(item, result);
  }
  return result;
}

function collectResourceUrisInto(item, result) {
  if (!item) return;
  if (Array.isArray(item)) {
    for (const child of item) collectResourceUrisInto(child, result);
    return;
  }
  if (item.resourceUri || item.uri || item.scheme) {
    result.push(item.resourceUri || item.uri || item);
  }
  if (Array.isArray(item.resourceStates)) {
    for (const state of item.resourceStates) collectResourceUrisInto(state, result);
  }
}

function isNtfYamlUri(uri) {
  const fsPath = uri?.fsPath || uri?.path || "";
  const lower = fsPath.toLowerCase();
  return lower.endsWith(".ntf.yaml") || lower.endsWith(".ntf.yml");
}

function backingFilePath(uri) {
  if (!uri) return "";
  if (uri.scheme === "git") {
    return parseGitQuery(uri.query).path || uri.fsPath || "";
  }
  return uri.fsPath || "";
}

function isInsidePath(filePath, rootPath) {
  if (!filePath || !rootPath) return false;
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

module.exports = {
  collectResourceUris,
  collectResourceUrisInto,
  isNtfYamlUri,
  backingFilePath,
  isInsidePath
};
