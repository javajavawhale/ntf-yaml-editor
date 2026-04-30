const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");
  const testWorkspace = path.resolve(extensionDevelopmentPath, "test", "fixtures", "workspace");

  process.env.NTF_YAML_EDITOR_ENABLE_E2E_COMMANDS = "1";

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      testWorkspace,
      "--disable-workspace-trust",
      "--disable-gpu",
      "--no-sandbox",
      "--skip-welcome",
      "--skip-release-notes"
    ]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
