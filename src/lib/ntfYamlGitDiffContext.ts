import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";
import { createDiffReport, type DiffReport, type DiffStatus } from "./ntfYamlDiff";
import { parseGitQuery } from "./gitUri";
import type * as vscode from "vscode";

// Re-export for consumers that expect this from ntfYamlGitDiffContext
export { parseGitQuery };

// ── Public API ─────────────────────────────────────────────────────────────

export interface DocumentDiffOptions {
  uri: vscode.Uri;
  text?: string;
  workspaceFolder?: string;
  repositoryPath?: string;
  baseRef?: string;
}

export function createDocumentDiffReport(options: DocumentDiffOptions): DiffReport | null {
  const uri = options.uri;
  if (!uri || !isYamlPath(uri.fsPath || (uri as unknown as { path?: string }).path || "")) return null;
  if (uri.scheme === "git") {
    return createGitUriReport(options);
  }
  if (uri.scheme === "file") {
    return createWorkingTreeReport(options);
  }
  return null;
}

export interface RefDiffOptions {
  repositoryPath: string;
  relativePath: string;
  oldRelativePath?: string;
  oldPath?: string;
  baseRef?: string;
  headRef?: string;
  status?: DiffStatus;
}

export function createRefDiffReport(options: RefDiffOptions): DiffReport | null {
  const repositoryPath = options.repositoryPath;
  const relativePath = normalizeRelative(options.relativePath || "");
  const oldRelativePath = normalizeRelative(options.oldRelativePath || options.oldPath || relativePath);
  const baseRef = options.baseRef || "HEAD";
  const headRef = options.headRef || "working tree";
  if (!repositoryPath || !relativePath) return null;
  const baseFile = readRefFile(repositoryPath, baseRef, oldRelativePath);
  const headFile = readRefFile(repositoryPath, headRef, relativePath);
  return createDiffReport({
    path: relativePath,
    oldPath: oldRelativePath,
    status: options.status || statusFromRefFiles(baseFile, headFile),
    baseRef: displayRef(baseRef),
    headRef: displayRef(headRef),
    baseText: baseFile.text,
    headText: headFile.text,
    repositoryPath,
  });
}

export interface DiffAllFilesOptions {
  repositoryPath: string;
  baseRef?: string;
  headRef?: string;
}

export function diffWorkingTreeAllFiles(options: DiffAllFilesOptions): (DiffReport | null)[] {
  const repositoryPath = options.repositoryPath;
  const baseRef = options.baseRef || "HEAD";
  const headRef = options.headRef || "working tree";
  const baseIsWorkingTree = isWorkingTreeRef(baseRef);
  const headIsWorkingTree = isWorkingTreeRef(headRef);
  const baseIsIndex = isIndexRef(baseRef) || baseRef === "index";
  const headIsIndex = isIndexRef(headRef) || headRef === "index";
  const diffArgs = diffNameStatusArgs(baseRef, headRef, {
    baseIsWorkingTree,
    headIsWorkingTree,
    baseIsIndex,
    headIsIndex,
  });
  const diffStatus = git(diffArgs, repositoryPath);
  const untracked = baseIsWorkingTree || headIsWorkingTree
    ? git(["ls-files", "--others", "--exclude-standard", "--", "*.yaml", "*.yml"], repositoryPath, true)
    : "";

  interface FileEntry {
    status: DiffStatus;
    path: string;
    oldPath?: string;
  }
  const files: FileEntry[] = [];
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
    headRef,
  }));
}

export function createReportFromResource(
  resource: unknown,
  options?: { workspaceFolder?: string; repositoryPath?: string }
): DiffReport | null {
  const res = resource as Record<string, unknown> | null;
  const uri = (res?.["resourceUri"] || res?.["uri"] || resource) as vscode.Uri | null;
  if (!uri) return null;
  return createDocumentDiffReport({
    uri,
    text: uri.scheme === "file" && fs.existsSync(uri.fsPath) ? fs.readFileSync(uri.fsPath, "utf8") : "",
    workspaceFolder: options?.workspaceFolder || findWorkspaceFolder(uri.fsPath),
    repositoryPath: options?.repositoryPath,
  });
}

// ── Internal helpers ───────────────────────────────────────────────────────

function createGitUriReport(options: DocumentDiffOptions): DiffReport | null {
  const query = parseGitQuery(options.uri.query);
  const filePath = query.path || options.uri.fsPath;
  if (!filePath || !fs.existsSync(filePath as string)) return null;
  const repositoryPath = resolveRepositoryPath(
    options.repositoryPath || options.workspaceFolder,
    filePath as string
  );
  const baseText = options.text || "";
  const headText = fs.readFileSync(filePath as string, "utf8");
  return createDiffReport({
    path: workspaceRelativePath(repositoryPath, filePath as string),
    oldPath: workspaceRelativePath(repositoryPath, filePath as string),
    status: "modified",
    baseRef: displayRefForGitUri(query.ref as string | undefined, repositoryPath, filePath as string),
    headRef: "working tree",
    baseText,
    headText,
    repositoryPath,
  });
}

function createWorkingTreeReport(options: DocumentDiffOptions): DiffReport | null {
  const filePath = options.uri.fsPath;
  const repositoryPath = resolveRepositoryPath(
    options.repositoryPath || options.workspaceFolder,
    filePath
  );
  if (!repositoryPath || !isInside(filePath, repositoryPath)) return null;
  const relativePath = normalizeRelative(path.relative(repositoryPath, filePath));
  const status = gitStatus(repositoryPath, relativePath);
  if (!status) return null;
  const baseRef = options.baseRef || "HEAD";
  const headText = options.text ?? fs.readFileSync(filePath, "utf8");
  const baseText = status === "added" ? "" : gitShow(repositoryPath, baseRef, relativePath) || "";
  return createDiffReport({
    path: relativePath,
    oldPath: relativePath,
    status,
    baseRef,
    headRef: "working tree",
    baseText,
    headText,
    repositoryPath,
  });
}

interface RefFile {
  exists: boolean;
  text: string;
}

function readRefFile(cwd: string, ref: string, relativePath: string): RefFile {
  if (isWorkingTreeRef(ref)) {
    const filePath = path.join(cwd, relativePath);
    return {
      exists: fs.existsSync(filePath),
      text: fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "",
    };
  }
  if (isIndexRef(ref)) {
    const indexObject = ":" + relativePath;
    const exists = gitObjectExists(cwd, indexObject);
    return {
      exists,
      text: exists ? git(["show", indexObject], cwd, true) : "",
    };
  }
  const exists = gitObjectExists(cwd, ref + ":" + relativePath);
  return {
    exists,
    text: exists ? gitShow(cwd, ref, relativePath) : "",
  };
}

interface DiffNameStatusRefs {
  baseIsWorkingTree: boolean;
  headIsWorkingTree: boolean;
  baseIsIndex: boolean;
  headIsIndex: boolean;
}

function diffNameStatusArgs(baseRef: string, headRef: string, refs: DiffNameStatusRefs): string[] {
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

function statusFromRefFiles(baseFile: RefFile, headFile: RefFile): DiffStatus {
  if (baseFile.exists && !headFile.exists) return "deleted";
  if (!baseFile.exists && headFile.exists) return "added";
  return "changed";
}

function gitObjectExists(cwd: string, objectRef: string): boolean {
  return childProcess.spawnSync("git", ["cat-file", "-e", objectRef], { cwd, encoding: "utf8" }).status === 0;
}

function isWorkingTreeRef(ref: string): boolean {
  return !ref || ref === "working tree" || ref === "WORKING_TREE";
}

function isIndexRef(ref: string): boolean {
  return ref === "~" || ref === "index";
}

function displayRef(ref: string): string {
  if (isWorkingTreeRef(ref)) return "working tree";
  if (ref === "~") return "index";
  if (/^~\d$/.test(ref || "")) return `stage ${ref[1]}`;
  return ref;
}

function gitStatus(cwd: string, relativePath: string): DiffStatus | "" {
  const result = git(["status", "--porcelain", "--", relativePath], cwd);
  if (!result.trim()) return "";
  const code = result.slice(0, 2);
  if (code.includes("A") || code.includes("?")) return "added";
  if (code.includes("D")) return "deleted";
  return "modified";
}

function displayRefForGitUri(
  ref: string | undefined,
  repositoryPath: string,
  filePath: string
): string {
  if (ref === "~") {
    return hasIndexStatus(repositoryPath, filePath) ? "index" : "HEAD";
  }
  if (/^~\d$/.test(ref || "")) {
    return `stage ${ref![1]}`;
  }
  return ref || "HEAD";
}

function hasIndexStatus(repositoryPath: string, filePath: string): boolean {
  if (!repositoryPath || !filePath || !isInside(filePath, repositoryPath)) return false;
  const relativePath = normalizeRelative(path.relative(repositoryPath, filePath));
  const result = git(["status", "--porcelain", "--", relativePath], repositoryPath, true);
  if (!result.trim()) return false;
  const indexStatus = result[0];
  return indexStatus !== " " && indexStatus !== "?";
}

function gitShow(cwd: string, ref: string, relativePath: string): string {
  return git(["show", ref + ":" + relativePath], cwd, true);
}

function git(args: string[], cwd: string, allowFailure?: boolean): string {
  const result = childProcess.spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    if (allowFailure) return "";
    throw new Error((result.stderr || result.stdout || "git command failed").trim());
  }
  return result.stdout;
}

function findWorkspaceFolder(filePath: string): string {
  if (!filePath) return "";
  let dir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return "";
}

function resolveRepositoryPath(candidate: string | undefined, filePath: string): string {
  const candidates = [
    candidate,
    filePath ? path.dirname(filePath) : "",
    findWorkspaceFolder(filePath),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    const root = gitRoot(dir);
    if (root) return root;
  }
  return "";
}

function gitRoot(cwd: string): string {
  return normalizeAbsolute(git(["rev-parse", "--show-toplevel"], cwd, true).trim());
}

function normalizeAbsolute(value: string): string {
  return value ? path.resolve(value) : "";
}

function workspaceRelativePath(workspaceFolder: string, filePath: string): string {
  return workspaceFolder && isInside(filePath, workspaceFolder)
    ? normalizeRelative(path.relative(workspaceFolder, filePath))
    : filePath;
}

function isInside(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRelative(value: string): string {
  return String(value || "").replace(/\\/g, "/");
}

function isYamlPath(filePath: string): boolean {
  const lower = String(filePath || "").toLowerCase();
  return lower.endsWith(".yaml") || lower.endsWith(".yml");
}
