const Mocha = require("mocha");
const path = require("path");

exports.run = function() {
  const mocha = new Mocha({
    color: true,
    timeout: 60000,
    ui: "bdd"
  });

  mocha.addFile(path.resolve(__dirname, "ntfYamlEditor.e2e.js"));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} E2E test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
};
