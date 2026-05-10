function locateDiagnosticLine(text, diagnosticPath) {
  const lines = String(text || "").split(/\r?\n/);
  const patterns = (diagnosticPath || []).slice(0, 2).map(escapeForSearch);
  for (let index = 0; index < lines.length; index++) {
    if (patterns.some(pattern => lines[index].includes(pattern))) {
      return { line: index, length: Math.max(lines[index].length, 1) };
    }
  }
  return { line: 0, length: 1 };
}

function escapeForSearch(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

module.exports = {
  locateDiagnosticLine,
  escapeForSearch
};
