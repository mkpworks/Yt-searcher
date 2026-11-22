"use strict";

const fs = require("fs");
const path = require("path");
const Catalog = require("../js/catalog.js");
const { loadDefinition, repoRoot } = require("./lib/definition.js");
const { validateData } = require("./lib/validate.js");
const { createStore } = require("./lib/store.js");

const STATIC_FILES = ["index.html", "favicon.svg", "collection.json"];
const STATIC_DIRS = ["css", "js", "fonts"];

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copyRecursive(path.join(from, entry), path.join(to, entry));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function buildSite(options) {
  const root = (options && options.root) || repoRoot();
  const outDir = (options && options.outDir) || path.join(root, "_site");
  const definition = loadDefinition(path.join(root, "collection.json"));
  const store = createStore(definition, { root, adapter: options && options.adapter });
  let items;
  let entities;
  try {
    items = store.readItems();
    entities = store.readEntities();
  } finally {
    store.close();
  }
  const result = validateData(definition, items, entities);
  if (result.errors.length) {
    const error = new Error("Invalid collection data (" + result.errors.length + ")\n - " + result.errors.join("\n - "));
    error.errors = result.errors;
    throw error;
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of STATIC_FILES) copyRecursive(path.join(root, file), path.join(outDir, file));
  for (const dir of STATIC_DIRS) copyRecursive(path.join(root, dir), path.join(outDir, dir));
  const dataDir = path.join(outDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "items.json"), JSON.stringify(items, null, 2) + "\n");
  fs.writeFileSync(path.join(dataDir, "entities.json"), JSON.stringify(entities, null, 2) + "\n");
  fs.copyFileSync(path.join(root, "collection.json"), path.join(dataDir, "collection.json"));
  fs.writeFileSync(path.join(dataDir, "collection.csv"), Catalog.toCsv(items, definition));
  return { outDir, items: items.length, warnings: result.warnings };
}

function main() {
  try {
    const built = buildSite();
    console.log("Built " + built.items + " items into " + built.outDir);
    for (const warning of built.warnings) console.log("Warning: " + warning);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { buildSite };

if (require.main === module) main();
