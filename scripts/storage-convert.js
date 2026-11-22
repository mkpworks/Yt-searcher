"use strict";

const path = require("path");
const { loadDefinition, repoRoot } = require("./lib/definition.js");
const { createStore, copyStore } = require("./lib/store.js");
const { fieldByRole } = require("./lib/validate.js");

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function main() {
  const from = arg("--from");
  const to = arg("--to");
  if (!from || !to) {
    console.error("Usage: node scripts/storage-convert.js --from json|sqlite --to json|sqlite [--replace] [--sqlite data/collection.sqlite]");
    process.exit(1);
  }
  const root = repoRoot();
  const definition = loadDefinition(path.join(root, "collection.json"));
  const sqliteFile = arg("--sqlite") ? path.resolve(root, arg("--sqlite")) : undefined;
  const source = createStore(definition, { root, adapter: from, file: from === "sqlite" ? sqliteFile : undefined });
  const dest = createStore(definition, { root, adapter: to, file: to === "sqlite" ? sqliteFile : undefined });
  if (from === to && source.file && dest.file && source.file === dest.file) {
    console.error("Refusing to convert a store onto itself.");
    source.close();
    dest.close();
    process.exit(1);
  }
  if (from === to && from === "json") {
    console.error("Refusing to convert JSON onto the same JSON files. Pass a different adapter.");
    source.close();
    dest.close();
    process.exit(1);
  }
  const idField = fieldByRole(definition, "id");
  try {
    const copied = copyStore(source, dest, {
      replace: process.argv.includes("--replace"),
      idField: idField ? idField.id : "id",
    });
    const entityCount = Object.values(copied.entities).reduce((sum, table) => sum + Object.keys(table).length, 0);
    console.log("Copied " + copied.items + " items and " + entityCount + " entity records from " + from + " to " + to + ".");
  } finally {
    source.close();
    dest.close();
  }
}

module.exports = { arg };

if (require.main === module) main();
