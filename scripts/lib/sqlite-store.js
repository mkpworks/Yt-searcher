"use strict";

const fs = require("fs");
const path = require("path");

const previousEmitWarning = process.emitWarning;
process.emitWarning = function (warning, type, code, ctor) {
  const message = typeof warning === "string" ? warning : warning && warning.message;
  const name = type || (warning && warning.name);
  if (name === "ExperimentalWarning" && message && message.includes("SQLite")) return;
  return previousEmitWarning.call(process, warning, type, code, ctor);
};

function loadDriver() {
  try {
    return require("node:sqlite").DatabaseSync;
  } catch (error) {
    throw new Error("The sqlite adapter needs Node.js 22.5 or newer, which includes node:sqlite. " + error.message);
  }
}

function createSqliteStore(options) {
  const DatabaseSync = loadDriver();
  const file = options.file;
  const idField = options.idField || "id";
  const typeField = options.typeField || "type";
  if (!file) throw new Error("SQLite store needs a file path");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entities (
      entity TEXT NOT NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (entity, name)
    );
  `);

  const selectItems = db.prepare("SELECT payload FROM items ORDER BY rowid");
  const upsertItemStmt = db.prepare(`
    INSERT INTO items (id, type, payload) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET type = excluded.type, payload = excluded.payload
  `);
  const deleteItemStmt = db.prepare("DELETE FROM items WHERE id = ?");
  const selectEntities = db.prepare("SELECT entity, name, payload FROM entities ORDER BY entity, name");
  const upsertEntityStmt = db.prepare(`
    INSERT INTO entities (entity, name, payload) VALUES (?, ?, ?)
    ON CONFLICT(entity, name) DO UPDATE SET payload = excluded.payload
  `);
  const deleteEntityStmt = db.prepare("DELETE FROM entities WHERE entity = ? AND name = ?");
  const listEntityStmt = db.prepare("SELECT name FROM entities WHERE entity = ? ORDER BY name");

  return {
    kind: "sqlite",
    file,
    readItems() {
      return selectItems.all().map((row) => JSON.parse(row.payload));
    },
    upsertItem(item) {
      if (!item || typeof item[idField] !== "string" || !item[idField]) {
        throw new Error("upsertItem needs a " + idField);
      }
      const typeValue = item[typeField];
      upsertItemStmt.run(item[idField], typeof typeValue === "string" ? typeValue : "", JSON.stringify(item));
    },
    deleteItem(id) {
      const result = deleteItemStmt.run(id);
      return Boolean(result && result.changes);
    },
    readEntities() {
      const entities = {};
      for (const row of selectEntities.all()) {
        if (!entities[row.entity]) entities[row.entity] = {};
        entities[row.entity][row.name] = JSON.parse(row.payload);
      }
      return entities;
    },
    upsertEntity(entityId, name, record) {
      if (!entityId || !name || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("upsertEntity needs an entity id, name, and record");
      }
      upsertEntityStmt.run(entityId, name, JSON.stringify(record));
    },
    deleteEntity(entityId, name) {
      const result = deleteEntityStmt.run(entityId, name);
      return Boolean(result && result.changes);
    },
    listEntities(entityId) {
      if (entityId) return listEntityStmt.all(entityId).map((row) => row.name);
      const listed = {};
      for (const row of selectEntities.all()) {
        if (!listed[row.entity]) listed[row.entity] = [];
        listed[row.entity].push(row.name);
      }
      return listed;
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createSqliteStore };
