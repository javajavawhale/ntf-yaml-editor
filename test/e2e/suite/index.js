const vscode = require("vscode");
const { tests } = require("./ntfYamlEditor.e2e");

exports.run = async function() {
  const failures = [];
  console.log("NTF YAML Editor E2E");

  for (const item of tests) {
    try {
      await item.run();
      console.log(`  OK ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`  FAIL ${item.name}`);
      console.error(error);
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} E2E test(s) failed.`);
  }
};
