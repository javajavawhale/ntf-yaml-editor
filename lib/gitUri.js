function parseGitQuery(query) {
  try {
    return query ? JSON.parse(decodeURIComponent(query)) : {};
  } catch {
    return {};
  }
}

module.exports = { parseGitQuery };
