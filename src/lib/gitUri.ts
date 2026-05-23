export interface GitQuery {
  path?: string;
  ref?: string;
  [key: string]: unknown;
}

export function parseGitQuery(query: string | null | undefined): GitQuery {
  try {
    return query ? JSON.parse(decodeURIComponent(query)) : {};
  } catch {
    return {};
  }
}
