"use strict";

const path = require("path");
const { loadDefinition, repoRoot } = require("./lib/definition.js");
const { validateData } = require("./lib/validate.js");
const { createStore } = require("./lib/store.js");

function validateStored(definition, options) {
  const store = createStore(definition, options);
  try {
    return validateData(definition, store.readItems(), store.readEntities());
  } finally {
    store.close();
  }
}

function main() {
  const root = repoRoot();
  const definitionFile = process.argv[2] || path.join(root, "collection.json");
  let definition;
  try {
    definition = loadDefinition(definitionFile);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  let result;
  try {
    result = validateStored(definition, { root });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (result.errors.length) {
    console.error("Invalid collection data (" + result.errors.length + ")");
    for (const error of result.errors) console.error(" - " + error);
    process.exit(1);
  }
  const store = createStore(definition, { root });
  const items = store.readItems();
  store.close();
  const counts = {};
  for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
  const summary = Object.keys(counts).sort().map((type) => counts[type] + " " + type + (counts[type] === 1 ? "" : "s")).join(", ");
  console.log("OK: " + items.length + " items (" + summary + ") in " + definition.title);
  for (const warning of result.warnings) console.log("Warning: " + warning);
}

module.exports = { validateStored };

if (require.main === module) main();
