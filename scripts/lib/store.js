"use strict";

const path = require("path");
const { createJsonStore } = require("./json-store.js");
const { createSqliteStore } = require("./sqlite-store.js");
const { fieldByRole } = require("./validate.js");

// Adapters implement this surface:
//   readItems() -> item[]
//   upsertItem(item) -> void          replace the item with the same YouTube id, or append it
//   deleteItem(id) -> boolean
//   readEntities() -> { [entityId]: { [name]: record } }
//   upsertEntity(entityId, name, record) -> void
//   deleteEntity(entityId, name) -> boolean
//   listEntities(entityId?) -> string[] | { [entityId]: string[] }
//   close() -> void
//
// To add an adapter (Google Sheets, Airtable, Supabase, ...), implement those
// methods in a new file and register it below. See docs/STORAGE.md.

const factories = {
  json: function (definition, options) {
    const root = options.root;
    const json = (definition.storage && definition.storage.json) || {};
    return createJsonStore({
      idField: options.idField,
      itemsFile: options.itemsFile || path.resolve(root, json.items || "data/items.json"),
      entitiesFile: options.entitiesFile || path.resolve(root, json.entities || "data/entities.json"),
    });
  },
  sqlite: function (definition, options) {
    const root = options.root;
    const sqlite = (definition.storage && definition.storage.sqlite) || {};
    return createSqliteStore({
      idField: options.idField,
      typeField: options.typeField,
      file: options.file || path.resolve(root, sqlite.file || "data/collection.sqlite"),
    });
  },
};

function registerAdapter(name, factory) {
  if (!name || typeof factory !== "function") throw new Error("registerAdapter needs a name and a factory");
  factories[name] = factory;
}

function createStore(definition, options) {
  const settings = options || {};
  const root = settings.root || path.join(__dirname, "..", "..");
  const adapter = settings.adapter || (definition.storage && definition.storage.adapter) || "json";
  const factory = factories[adapter];
  if (!factory) {
    throw new Error("Unknown storage adapter \"" + adapter + "\". Known adapters: " + Object.keys(factories).join(", ") + ". See docs/STORAGE.md.");
  }
  const idField = fieldByRole(definition, "id");
  const typeField = fieldByRole(definition, "type");
  return factory(definition, {
    root,
    idField: idField ? idField.id : "id",
    typeField: typeField ? typeField.id : "type",
    itemsFile: settings.itemsFile,
    entitiesFile: settings.entitiesFile,
    file: settings.file,
  });
}

function copyStore(fromStore, toStore, options) {
  const settings = options || {};
  const idField = settings.idField || "id";
  if (settings.replace) {
    for (const item of toStore.readItems()) {
      if (item && item[idField]) toStore.deleteItem(item[idField]);
    }
    const existing = toStore.readEntities();
    for (const entityId of Object.keys(existing)) {
      for (const name of Object.keys(existing[entityId])) toStore.deleteEntity(entityId, name);
    }
  }
  const items = fromStore.readItems();
  for (const item of items) toStore.upsertItem(item);
  const entities = fromStore.readEntities();
  for (const entityId of Object.keys(entities)) {
    for (const name of Object.keys(entities[entityId])) {
      toStore.upsertEntity(entityId, name, entities[entityId][name]);
    }
  }
  return { items: items.length, entities };
}

module.exports = { createStore, registerAdapter, copyStore };
