"use strict";

const fs = require("fs");
const path = require("path");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error("Could not read " + file + ": " + error.message);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function createJsonStore(options) {
  const idField = options.idField || "id";
  const itemsFile = options.itemsFile;
  const entitiesFile = options.entitiesFile;
  if (!itemsFile || !entitiesFile) throw new Error("JSON store needs items and entities paths");

  function readItems() {
    const items = readJson(itemsFile, []);
    if (!Array.isArray(items)) throw new Error(itemsFile + " must contain an array");
    return items;
  }

  function writeItems(items) {
    writeJson(itemsFile, items);
  }

  function readEntities() {
    const entities = readJson(entitiesFile, {});
    if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
      throw new Error(entitiesFile + " must contain an object");
    }
    return entities;
  }

  function writeEntities(entities) {
    writeJson(entitiesFile, entities);
  }

  return {
    kind: "json",
    itemsFile,
    entitiesFile,
    readItems,
    upsertItem(item) {
      if (!item || typeof item[idField] !== "string" || !item[idField]) {
        throw new Error("upsertItem needs a " + idField);
      }
      const items = readItems();
      const index = items.findIndex((existing) => existing && existing[idField] === item[idField]);
      if (index === -1) items.push(item);
      else items[index] = item;
      writeItems(items);
    },
    deleteItem(id) {
      const items = readItems();
      const next = items.filter((item) => !item || item[idField] !== id);
      if (next.length === items.length) return false;
      writeItems(next);
      return true;
    },
    readEntities,
    upsertEntity(entityId, name, record) {
      if (!entityId || !name || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("upsertEntity needs an entity id, name, and record");
      }
      const entities = readEntities();
      if (!entities[entityId] || typeof entities[entityId] !== "object" || Array.isArray(entities[entityId])) {
        entities[entityId] = {};
      }
      entities[entityId][name] = record;
      writeEntities(entities);
    },
    deleteEntity(entityId, name) {
      const entities = readEntities();
      const table = entities[entityId];
      if (!table || !Object.prototype.hasOwnProperty.call(table, name)) return false;
      delete table[name];
      writeEntities(entities);
      return true;
    },
    listEntities(entityId) {
      const entities = readEntities();
      if (entityId) {
        const table = entities[entityId];
        return table && typeof table === "object" ? Object.keys(table).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })) : [];
      }
      const listed = {};
      for (const key of Object.keys(entities)) {
        const table = entities[key];
        listed[key] = table && typeof table === "object" ? Object.keys(table) : [];
      }
      return listed;
    },
    close() {},
  };
}

module.exports = { createJsonStore, readJson, writeJson };
