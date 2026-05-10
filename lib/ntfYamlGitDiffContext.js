(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("fs"),
      require("path"),
      require("child_process"),
      require("./ntfYamlModel"),
      require("./ntfYamlDiff"),
      require("./gitUri")
    );
  } else {
    root.NtfYamlGitDiffContext = factory(
      null,
      null,
      null,
      root.NtfYamlModel,
      root.NtfYamlDiff,
      { parseGitQuery: function(query) {
        try {
          return query ? JSON.parse(decodeURIComponent(query)) : {};
        } catch {
          return {};
        }
      } }
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(fs, path, childProcess, ntfModel, ntfDiff, gitUri) {
  const parseGitQuery = gitUri.parseGitQuery;
  function createDocumentDiffReport(options) {
    const uri = options.uri;
    if (!uri || !isYamlPath(uri.fsPath || uri.path || "")) return null;
    if (uri.scheme === "git") {
      return createGitUriReport(options);
    }
    if (uri.scheme === "file") {
      return createWorkingTreeReport(options);
    }
    return null;
  }

  function createGitUriReport(options) {
    const query = parseGitQuery(options.uri.query);
    const filePath = query.path || options.uri.fsPath;
    if (!filePath || !fs || !fs.existsSync(filePath)) return null;
    const repositoryPath = resolveRepositoryPath(options.repositoryPath || options.workspaceFolder, filePath);
    const baseText = options.text || "";
    const headText = fs.readFileSync(filePath, "utf8");
    return ntfDiff.createDiffReport({
      path: workspaceRelativePath(repositoryPath, filePath),
      oldPath: workspaceRelativePath(repositoryPath, filePath),
      status: "modified",
      baseRef: displayRefForGitUri(query.ref, repositoryPath, filePath),
      headRef: "working tree",
      baseText,
      headText,
      repositoryPath
    });
  }

  function createWorkingTreeReport(options) {
    const filePath = options.uri.fsPath;
    const repositoryPath = resolveRepositoryPath(options.repositoryPath || options.workspaceFolder, filePath);
    if (!repositoryPath || !isInside(filePath, repositoryPath)) return null;
    const relativePath = normalizeRelative(path.relative(repositoryPath, filePath));
    const status = gitStatus(repositoryPath, relativePath);
    if (!status) return null;
    const baseRef = options.baseRef || "HEAD";
    const headText = options.text ?? fs.readFileSync(filePath, "utf8");
    const baseText = status === "added" ? "" : gitShow(repositoryPath, baseRef, relativePath) || "";
    return ntfDiff.createDiffReport({
      path: relativePath,
      oldPath: relativePath,
      status,
      baseRef,
      headRef: "working tree",
      baseText,
      headText,
      repositoryPath
    });
  }

  function createRefDiffReport(options) {
    const repositoryPath = options.repositoryPath;
    const relativePath = normalizeRelative(options.relativePath || "");
    const oldRelativePath = normalizeRelative(options.oldRelativePath || options.oldPath || relativePath);
    const baseRef = options.baseRef || "HEAD";
    const headRef = options.headRef || "working tree";
    if (!repositoryPath || !relativePath) return null;
    const baseFile = readRefFile(repositoryPath, baseRef, oldRelativePath);
    const headFile = readRefFile(repositoryPath, headRef, relativePath);
    return ntfDiff.createDiffReport({
      path: relativePath,
      oldPath: oldRelativePath,
      status: options.status || statusFromRefFiles(baseFile, headFile),
      baseRef: displayRef(baseRef),
      headRef: displayRef(headRef),
      baseText: baseFile.text,
      headText: headFile.text,
      repositoryPath
    });
  }

  function diffWorkingTreeAllFiles(options) {
    const repositoryPath = options.repositoryPath;
    const baseRef = options.baseRef || "HEAD";
    const headRef = options.headRef || "working tree";
    if (!fs || !path || !childProcess) {
      throw new Error("diffWorkingTreeAllFiles is only available in Node.js.");
    }
    const baseIsWorkingTree = isWorkingTreeRef(baseRef);
    const headIsWorkingTree = isWorkingTreeRef(headRef);
    const baseIsIndex = isIndexRef(baseRef) || baseRef === "index";
    const headIsIndex = isIndexRef(headRef) || headRef === "index";
    const diffArgs = diffNameStatusArgs(baseRef, headRef, {
      baseIsWorkingTree,
      headIsWorkingTree,
      baseIsIndex,
      headIsIndex
    });
    const diffStatus = git(diffArgs, repositoryPath);
    const untracked = baseIsWorkingTree || headIsWorkingTree
      ? git(["ls-files", "--others", "--exclude-standard", "--", "*.yaml", "*.yml"], repositoryPath, true)
      : "";
    const files = [];
    for (const line of (diffStatus || "").split(/\r?\n/).filter(Boolean)) {
      const parts = line.split("\t");
      const code = parts[0];
      if (code.startsWith("R")) {
        files.push({ status: "changed", oldPath: parts[1], path: parts[2] });
      } else if (code === "A") {
        files.push({ status: "added", path: parts[1] });
      } else if (code === "D") {
        files.push({ status: "deleted", path: parts[1] });
      } else {
        files.push({ status: "changed", path: parts[1] });
      }
    }
    for (const line of (untracked || "").split(/\r?\n/).filter(Boolean)) {
      if (isYamlPath(line) && !files.some(f => f.path === line)) {
        files.push({ status: "added", path: line });
      }
    }
    return files.map(file => createRefDiffReport({
      repositoryPath,
      relativePath: file.path,
      oldRelativePath: file.oldPath || file.path,
      status: file.status,
      baseRef,
      headRef
    }));
  }

  function createReportFromResource(resource, options) {
    const uri = resource?.resourceUri || resource?.uri || resource;
    if (!uri) return null;
    return createDocumentDiffReport({
      uri,
      text: uri.scheme === "file" && fs.existsSync(uri.fsPath) ? fs.readFileSync(uri.fsPath, "utf8") : "",
      workspaceFolder: options?.workspaceFolder || findWorkspaceFolder(uri.fsPath),
      repositoryPath: options?.repositoryPath
    });
  }

  function readRefFile(cwd, ref, relativePath) {
    if (isWorkingTreeRef(ref)) {
      const filePath = path.join(cwd, relativePath);
      return {
        exists: fs.existsSync(filePath),
        text: fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""
      };
    }
    if (isIndexRef(ref)) {
      // "~" is VSCode's git extension convention for the staging area (index stage 0)
      const indexObject = ":" + relativePath;
      const exists = gitObjectExists(cwd, indexObject);
      return {
        exists,
        text: exists ? git(["show", indexObject], cwd, true) : ""
      };
    }
    const exists = gitObjectExists(cwd, ref + ":" + relativePath);
    return {
      exists,
      text: exists ? gitShow(cwd, ref, relativePath) : ""
    };
  }

  function diffNameStatusArgs(baseRef, headRef, refs) {
    if (refs.baseIsIndex && refs.headIsWorkingTree) {
      return ["diff", "--name-status", "-M", "--", "*.yaml", "*.yml"];
    }
    if (refs.headIsIndex && !refs.baseIsWorkingTree) {
      return ["diff", "--name-status", "-M", "--cached", baseRef, "--", "*.yaml", "*.yml"];
    }
    if (refs.baseIsWorkingTree || refs.baseIsIndex) {
      return ["diff", "--name-status", "-M", headRef, "--", "*.yaml", "*.yml"];
    }
    if (refs.headIsWorkingTree || refs.headIsIndex) {
      return ["diff", "--name-status", "-M", baseRef, "--", "*.yaml", "*.yml"];
    }
    return ["diff", "--name-status", "-M", baseRef, headRef, "--", "*.yaml", "*.yml"];
  }

  function statusFromRefFiles(baseFile, headFile) {
    if (baseFile.exists && !headFile.exists) return "deleted";
    if (!baseFile.exists && headFile.exists) return "added";
    return "changed";
  }

  function gitObjectExists(cwd, objectRef) {
    return childProcess.spawnSync("git", ["cat-file", "-e", objectRef], { cwd, encoding: "utf8" }).status === 0;
  }

  function isWorkingTreeRef(ref) {
    return !ref || ref === "working tree" || ref === "WORKING_TREE";
  }

  function isIndexRef(ref) {
    return ref === "~" || ref === "index";
  }

  function displayRef(ref) {
    if (isWorkingTreeRef(ref)) return "working tree";
    if (ref === "~") return "index";
    if (/^~\d$/.test(ref || "")) return `stage ${ref[1]}`;
    return ref;
  }

  function gitStatus(cwd, relativePath) {
    const result = git(["status", "--porcelain", "--", relativePath], cwd);
    if (!result.trim()) return "";
    const code = result.slice(0, 2);
    if (code.includes("A") || code.includes("?")) return "added";
    if (code.includes("D")) return "deleted";
    return "modified";
  }

  function displayRefForGitUri(ref, repositoryPath, filePath) {
    if (ref === "~") {
      return hasIndexStatus(repositoryPath, filePath) ? "index" : "HEAD";
    }
    if (/^~\d$/.test(ref || "")) {
      return `stage ${ref[1]}`;
    }
    return ref || "HEAD";
  }

  function hasIndexStatus(repositoryPath, filePath) {
    if (!repositoryPath || !filePath || !isInside(filePath, repositoryPath)) return false;
    const relativePath = normalizeRelative(path.relative(repositoryPath, filePath));
    const result = git(["status", "--porcelain", "--", relativePath], repositoryPath, true);
    if (!result.trim()) return false;
    const indexStatus = result[0];
    return indexStatus !== " " && indexStatus !== "?";
  }

  function gitShow(cwd, ref, relativePath) {
    return git(["show", ref + ":" + relativePath], cwd, true);
  }

  function git(args, cwd, allowFailure) {
    const result = childProcess.spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) {
      if (allowFailure) return "";
      throw new Error((result.stderr || result.stdout || "git command failed").trim());
    }
    return result.stdout;
  }

  function findWorkspaceFolder(filePath) {
    if (!filePath || !fs || !path) return "";
    let dir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
    while (dir && dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, ".git"))) return dir;
      dir = path.dirname(dir);
    }
    return "";
  }

  function resolveRepositoryPath(candidate, filePath) {
    const candidates = [
      candidate,
      filePath ? path.dirname(filePath) : "",
      findWorkspaceFolder(filePath)
    ].filter(Boolean);
    for (const dir of candidates) {
      const root = gitRoot(dir);
      if (root) return root;
    }
    return "";
  }

  function gitRoot(cwd) {
    return normalizeAbsolute(git(["rev-parse", "--show-toplevel"], cwd, true).trim());
  }

  function normalizeAbsolute(value) {
    return value ? path.resolve(value) : "";
  }

  function workspaceRelativePath(workspaceFolder, filePath) {
    return workspaceFolder && isInside(filePath, workspaceFolder)
      ? normalizeRelative(path.relative(workspaceFolder, filePath))
      : filePath;
  }

  function isInside(filePath, dir) {
    const relative = path.relative(dir, filePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }

  function normalizeRelative(value) {
    return String(value || "").replace(/\\/g, "/");
  }

  function isYamlPath(filePath) {
    const lower = String(filePath || "").toLowerCase();
    return lower.endsWith(".yaml") || lower.endsWith(".yml");
  }

  return {
    createDocumentDiffReport,
    createRefDiffReport,
    createReportFromResource,
    diffWorkingTreeAllFiles,
    parseGitQuery
  };
});
