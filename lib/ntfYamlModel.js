(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NtfYamlModel = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function parseYaml(text) {
    const sheets = [];
    let currentSheet = null;
    let currentBlock = null;
    let currentRow = null;
    let rawBuffer = [];

    function flushRaw() {
      if (currentBlock && rawBuffer.length) {
        currentBlock.raw = rawBuffer.join("\n");
        rawBuffer = [];
      }
    }

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith("#")) {
        continue;
      }
      const top = line.match(/^([^\s][^:]*):(?:\s*#.*)?$/);
      if (top) {
        flushRaw();
        currentSheet = { name: top[1].trim(), blocks: [] };
        sheets.push(currentSheet);
        currentBlock = null;
        currentRow = null;
        continue;
      }
      if (!currentSheet) {
        continue;
      }
      const block = line.match(/^\s{2}([^:]+):(?:\s*#(.*))?$/);
      if (block) {
        flushRaw();
        currentBlock = {
          name: block[1].trim(),
          kind: block[2]?.trim() || inferKind(block[1].trim()),
          rows: [],
          raw: ""
        };
        currentSheet.blocks.push(currentBlock);
        currentRow = null;
        continue;
      }
      if (!currentBlock) {
        continue;
      }
      if (!isTableBlock(currentBlock.name) && !isRawRowsBlock(currentBlock.name)) {
        rawBuffer.push(line.replace(/^\s{4}/, ""));
        continue;
      }
      if (isRawRowsBlock(currentBlock.name)) {
        const singleLine = line.match(/^\s{4}-?\s*\[(.*)\]\s*,?$/);
        if (singleLine) {
          currentBlock.rows.push(parseInlineArray("[" + singleLine[1] + "]"));
        } else {
          const startArr = line.match(/^\s{4}-?\s*\[(.*)$/);
          if (startArr) {
            rawBuffer._arr = [startArr[1]];
          } else if (rawBuffer._arr) {
            const endArr = line.match(/^\s*(.*?)\]\s*,?$/);
            if (endArr) {
              rawBuffer._arr.push(endArr[1]);
              currentBlock.rows.push(parseInlineArray("[" + rawBuffer._arr.join(",") + "]"));
              delete rawBuffer._arr;
            } else {
              rawBuffer._arr.push(line.trim());
            }
          }
        }
        continue;
      }
      const rowStart = line.match(/^\s{4}-\s*(.*)$/);
      if (rowStart) {
        currentRow = {};
        currentBlock.rows.push(currentRow);
        const inline = rowStart[1];
        if (inline) {
          const pair = inline.match(/^([^:]+):\s*(.*)$/);
          if (pair) {
            currentRow[unquote(pair[1].trim())] = parseScalar(pair[2].trim());
          }
        }
        continue;
      }
      const pair = line.match(/^\s{6}([^:]+):\s*(.*)$/);
      if (pair && currentRow) {
        currentRow[unquote(pair[1].trim())] = parseScalar(pair[2].trim());
      }
    }
    flushRaw();
    return { sheets };
  }

  function inferKind(name) {
    if (isTableBlock(name)) return "ListMap";
    if (isRawRowsBlock(name)) return "RawRows";
    return "Raw";
  }

  function isTableBlock(name) {
    return /^(LIST_MAP|SETUP_TABLE|EXPECTED_TABLE)(\[\d+\])?=/.test(name);
  }

  function isRawRowsBlock(name) {
    return /^(SETUP_VARIABLE|EXPECTED_VARIABLE)(\[\d+\])?=/.test(name);
  }

  function parseInlineArray(text) {
    const inner = text.trim().replace(/^\[/, "").replace(/\]$/, "");
    const items = [];
    let cur = "", inQ = false, qc = "";
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (!inQ && (c === '"' || c === "'")) { inQ = true; qc = c; continue; }
      if (inQ && qc === '"' && c === "\\" && i + 1 < inner.length) {
        const next = inner[i + 1];
        cur += next === '"' || next === "\\" ? next : c + next;
        i++;
        continue;
      }
      if (inQ && c === qc) { inQ = false; continue; }
      if (!inQ && c === ",") { items.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    items.push(cur.trim());
    return items.map(parseScalar);
  }

  function parseScalar(value) {
    if (value === "~") {
      return null;
    }
    return unquote(value);
  }

  function unquote(value) {
    if (value.startsWith('"') && value.endsWith('"')) {
      return unescapeDoubleQuoted(value.slice(1, -1));
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }
    return value;
  }

  function unescapeDoubleQuoted(value) {
    let out = "";
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (c === "\\" && i + 1 < value.length) {
        const next = value[i + 1];
        out += next === '"' || next === "\\" ? next : c + next;
        i++;
        continue;
      }
      out += c;
    }
    return out;
  }

  function quote(value) {
    if (value === null) {
      return "~";
    }
    const text = String(value ?? "");
    return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function key(value) {
    const text = String(value ?? "");
    if (/^[A-Za-z0-9_.-]+$/.test(text)) {
      return text;
    }
    return quote(text);
  }

  function columns(block) {
    const names = [];
    for (const row of block.rows) {
      for (const key of Object.keys(row)) {
        if (!names.includes(key)) {
          names.push(key);
        }
      }
    }
    return names.length ? names : ["no"];
  }

  function analyzeYaml(text) {
    return analyzeModel(parseYaml(text));
  }

  function analyzeModel(model) {
    const diagnostics = [];
    const sheetNames = new Set();

    if (!model.sheets.length) {
      diagnostics.push(diagnostic("warning", "Document does not contain any NTF sheets.", []));
    }

    for (const sheet of model.sheets) {
      const path = [sheet.name];
      if (sheetNames.has(sheet.name)) {
        diagnostics.push(diagnostic("error", `Duplicate sheet "${sheet.name}".`, path));
      }
      sheetNames.add(sheet.name);

      if (!sheet.blocks.length) {
        diagnostics.push(diagnostic("warning", `Sheet "${sheet.name}" does not contain any blocks.`, path));
      }

      const blockNames = new Set();
      const blockByName = new Map();
      for (const block of sheet.blocks) {
        const blockPath = [sheet.name, block.name];
        if (blockNames.has(block.name)) {
          diagnostics.push(diagnostic("error", `Duplicate block "${block.name}" in sheet "${sheet.name}".`, blockPath));
        }
        blockNames.add(block.name);
        blockByName.set(block.name, block);

        if (isTableBlock(block.name)) {
          analyzeTableBlock(sheet, block, diagnostics);
        } else if (isRawRowsBlock(block.name)) {
          analyzeRawRowsBlock(sheet, block, diagnostics);
        } else if (!block.raw) {
          diagnostics.push(diagnostic("warning", `Block "${block.name}" has no readable content.`, blockPath));
        }
      }
      analyzeTestShotReferences(sheet, blockByName, diagnostics);
    }
    return diagnostics;
  }

  function analyzeTableBlock(sheet, block, diagnostics) {
    const path = [sheet.name, block.name];
    if (!block.rows.length) {
      diagnostics.push(diagnostic("warning", `Table block "${block.name}" has no rows.`, path));
      return;
    }

    const cols = columns(block);
    if (block.name === "LIST_MAP=testShots") {
      for (const required of ["no", "description"]) {
        if (!cols.includes(required)) {
          diagnostics.push(diagnostic("error", `LIST_MAP=testShots is missing required column "${required}".`, path));
        }
      }
    }

    block.rows.forEach((row, index) => {
      const rowPath = path.concat(String(index));
      if (!Object.keys(row).length) {
        diagnostics.push(diagnostic("warning", `Row ${index + 1} in "${block.name}" has no cells.`, rowPath));
      }
      for (const col of cols) {
        if (!Object.hasOwn(row, col)) {
          diagnostics.push(diagnostic("warning", `Row ${index + 1} in "${block.name}" is missing column "${col}".`, rowPath.concat(col)));
        }
      }
    });
  }

  function analyzeRawRowsBlock(sheet, block, diagnostics) {
    if (!block.rows.length) {
      diagnostics.push(diagnostic("warning", `Raw rows block "${block.name}" has no rows.`, [sheet.name, block.name]));
      return;
    }
    const width = block.rows[0].length;
    block.rows.forEach((row, index) => {
      if (row.length !== width) {
        diagnostics.push(diagnostic(
          "warning",
          `Row ${index + 1} in "${block.name}" has ${row.length} cells; expected ${width}.`,
          [sheet.name, block.name, String(index)]
        ));
      }
    });
  }

  function analyzeTestShotReferences(sheet, blockByName, diagnostics) {
    const testShots = blockByName.get("LIST_MAP=testShots");
    if (!testShots || !testShots.rows.length) {
      return;
    }
    const referenceRules = [
      { column: "setUpTable", prefix: "SETUP_TABLE" },
      { column: "expectedTable", prefix: "EXPECTED_TABLE" },
      { column: "expectedFile", prefix: "EXPECTED_VARIABLE" },
      { column: "expectedFixedFile", prefix: "EXPECTED_FIXED" }
    ];

    testShots.rows.forEach((row, index) => {
      for (const rule of referenceRules) {
        const value = row[rule.column];
        if (value === null || value === undefined || String(value).trim() === "") {
          continue;
        }
        const ref = String(value).trim();
        if (!hasNumberedBlock(blockByName, rule.prefix, ref)) {
          diagnostics.push(diagnostic(
            "warning",
            `testShots row ${index + 1} references ${rule.column}="${ref}", but ${rule.prefix}[${ref}]=... is not defined in sheet "${sheet.name}".`,
            [sheet.name, "LIST_MAP=testShots", String(index), rule.column]
          ));
        }
      }
    });
  }

  function hasNumberedBlock(blockByName, prefix, number) {
    const re = new RegExp("^" + escapeRegExp(prefix) + "\\[" + escapeRegExp(number) + "\\]=");
    for (const name of blockByName.keys()) {
      if (re.test(name)) {
        return true;
      }
    }
    return false;
  }

  function diagnostic(severity, message, path) {
    return { severity, message, path };
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function serializeYaml(model) {
    const out = [];
    for (const sheet of model.sheets) {
      out.push(sheet.name + ":");
      for (const block of sheet.blocks) {
        out.push("  " + block.name + ": #" + (block.kind || inferKind(block.name)));
        if (isTableBlock(block.name)) {
          const cols = columns(block);
          for (const row of block.rows) {
            out.push("    - " + key(cols[0]) + ": " + quote(Object.hasOwn(row, cols[0]) ? row[cols[0]] : ""));
            for (const col of cols.slice(1)) {
              out.push("      " + key(col) + ": " + quote(Object.hasOwn(row, col) ? row[col] : ""));
            }
          }
        } else if (isRawRowsBlock(block.name)) {
          for (const row of block.rows) {
            const cells = row.map(quote);
            out.push("    - [ " + cells.join(", ") + " ]");
          }
        } else if (block.raw) {
          for (const rawLine of block.raw.split("\n")) {
            out.push("    " + rawLine);
          }
        }
        out.push("");
      }
    }
    return out.join("\n").replace(/\n+$/, "\n");
  }

  return {
    parseYaml,
    serializeYaml,
    inferKind,
    isTableBlock,
    isRawRowsBlock,
    parseInlineArray,
    quote,
    key,
    columns,
    analyzeYaml,
    analyzeModel
  };
});
