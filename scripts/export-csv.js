"use strict";

const fs = require("fs");
const path = require("path");
const Catalog = require("../js/catalog.js");
const { loadDefinition, repoRoot } = require("./lib/definition.js");
const { createStore } = require("./lib/store.js");
const { validateData } = require("./lib/validate.js");

function exportCsv(definition, items, file) {
  const csv = Catalog.toCsv(items, definition);
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, csv);
  }
  return csv;
}

function main() {
  const root = repoRoot();
  const definition = loadDefinition(path.join(root, "collection.json"));
  const store = createStore(definition, { root });
  const items = store.readItems();
  const entities = store.readEntities();
  store.close();
  const result = validateData(definition, items, entities);
  if (result.errors.length) {
    console.error("Invalid collection data (" + result.errors.length + ")");
    for (const error of result.errors) console.error(" - " + error);
    process.exit(1);
  }
  const out = process.argv[2] || path.join(root, "data", "collection.csv");
  exportCsv(definition, items, out);
  console.log("Wrote " + items.length + " rows to " + out);
}

module.exports = { exportCsv };

if (require.main === module) main();
