const assert = require("assert");
const test = require("node:test");

const helper = require("../media/ntfYamlEditorHelpers");

test("editor helpers rename and delete table columns as model operations", () => {
  const block = {
    columnOrder: ["no", "name"],
    rows: [
      { no: "1", name: "before" },
      { no: "2", name: "after" }
    ]
  };

  assert.equal(helper.renameColumn(block, "name", "label"), true);
  assert.deepEqual(block.columnOrder, ["no", "label"]);
  assert.deepEqual(block.rows, [
    { no: "1", label: "before" },
    { no: "2", label: "after" }
  ]);

  helper.deleteColumn(block, "label");
  assert.deepEqual(block.columnOrder, ["no"]);
  assert.deepEqual(block.rows, [{ no: "1" }, { no: "2" }]);
});

test("editor helpers mutate raw row columns by position", () => {
  const block = {
    rows: [
      ["data", "001", "Tokyo"],
      ["data", "002", "Osaka"]
    ]
  };

  assert.equal(helper.moveRawColumnTo(block, 2, 1), true);
  assert.deepEqual(block.rows, [
    ["data", "Tokyo", "001"],
    ["data", "Osaka", "002"]
  ]);

  helper.deleteRawColumn(block, 1);
  assert.deepEqual(block.rows, [
    ["data", "001"],
    ["data", "002"]
  ]);
});
