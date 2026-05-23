import * as path from "path";
import type * as vscode from "vscode";
import { parseGitQuery } from "./gitUri";

export function collectResourceUris(items: unknown[]): vscode.Uri[] {
  const result: vscode.Uri[] = [];
  for (const item of items || []) {
    collectResourceUrisInto(item, result);
  }
  return result;
}

function collectResourceUrisInto(item: unknown, result: vscode.Uri[]): void {
  if (!item) return;
  if (Array.isArray(item)) {
    for (const child of item) collectResourceUrisInto(child, result);
    return;
  }
  const obj = item as Record<string, unknown>;
  if (obj["resourceUri"] || obj["uri"] || (obj["scheme"] !== undefined)) {
    result.push((obj["resourceUri"] || obj["uri"] || item) as vscode.Uri);
  }
  if (Array.isArray(obj["resourceStates"])) {
    for (const state of obj["resourceStates"]) collectResourceUrisInto(state, result);
  }
}

export function isNtfYamlUri(uri: vscode.Uri): boolean {
  const fsPath = uri?.fsPath || (uri as unknown as { path?: string })?.path || "";
  const lower = fsPath.toLowerCase();
  return lower.endsWith(".ntf.yaml") || lower.endsWith(".ntf.yml");
}

export function backingFilePath(uri: vscode.Uri | null | undefined): string {
  if (!uri) return "";
  if (uri.scheme === "git") {
    return parseGitQuery(uri.query).path || uri.fsPath || "";
  }
  return uri.fsPath || "";
}

export function hasGitPairForFileUri(fileUri: vscode.Uri, candidateUris: vscode.Uri[]): boolean {
  if (fileUri.scheme !== "file") return false;
  const filePath = backingFilePath(fileUri);
  if (!filePath) return false;
  return candidateUris.some(uri => {
    if (uri.scheme !== "git") return false;
    const gitPath = backingFilePath(uri);
    return Boolean(gitPath && path.resolve(gitPath) === path.resolve(filePath));
  });
}

export function isInsidePath(filePath: string, rootPath: string): boolean {
  if (!filePath || !rootPath) return false;
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
