(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("fs"), require("path"), require("child_process"), require("./ntfYamlModel"), require("./ntfYamlDiff"));
  } else {
    root.NtfYamlGitDiffContext = factory(null, null, null, root.NtfYamlModel, root.NtfYamlDiff);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(fs, path, childProcess, ntfModel, ntfDiff) {
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
      baseRef: query.ref || "git",
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
    const headText = options.text ?? fs.readFileSync(filePath, "utf8");
    const baseText = status === "added" ? "" : gitShow(repositoryPath, "HEAD", relativePath) || "";
    return ntfDiff.createDiffReport({
      path: relativePath,
      oldPath: relativePath,
      status,
      baseRef: "HEAD",
      headRef: "working tree",
      baseText,
      headText,
      repositoryPath
    });
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

  function parseGitQuery(query) {
    try {
      return query ? JSON.parse(decodeURIComponent(query)) : {};
    } catch {
      return {};
    }
  }

  function gitStatus(cwd, relativePath) {
    const result = git(["status", "--porcelain", "--", relativePath], cwd);
    if (!result.trim()) return "";
    const code = result.slice(0, 2);
    if (code.includes("A") || code.includes("?")) return "added";
    if (code.includes("D")) return "deleted";
    return "modified";
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
    createReportFromResource,
    parseGitQuery
  };
});
