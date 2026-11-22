"use strict";

const { isPlainObject, TYPE_ID_RE } = require("./definition.js");

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const URL_RE = /^https?:\/\/\S+$/;

function fold(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeTitle(value) {
  return fold(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function fieldByRole(definition, role) {
  return (definition.fields || []).find((field) => field.role === role) || null;
}

function applies(field, typeId) {
  if (!Array.isArray(field.appliesTo) || field.appliesTo.length === 0) return true;
  return field.appliesTo.includes(typeId);
}

function isRequired(field, typeId) {
  return field.required === true && applies(field, typeId);
}

function splitNames(value) {
  return String(value).split(",").map((part) => part.trim()).filter(Boolean);
}

function validateData(definition, items, entities) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(items)) {
    errors.push("items must be an array");
    return { errors, warnings };
  }
  if (!isPlainObject(entities)) {
    errors.push("entities must be an object keyed by entity id");
    return { errors, warnings };
  }

    const knownFields = new Set(definition.fields.map((field) => field.id));
    const typeIds = new Set((definition.types || []).map((type) => type.id));
    const idField = fieldByRole(definition, "id");
    const typeField = fieldByRole(definition, "type");
    const titleField = fieldByRole(definition, "title");
    const idMode = (definition.duplicates && definition.duplicates.youtubeId) || "error";
    const seenIds = new Set();
    const titles = new Map();
    const referenced = {};
    for (const entity of definition.entities || []) referenced[entity.id] = new Set();

    items.forEach((item, index) => {
      const where = "items[" + index + "]";
      if (!isPlainObject(item)) {
        errors.push(where + " must be an object");
        return;
      }
      for (const key of Object.keys(item)) {
        if (!knownFields.has(key)) errors.push(where + " has unknown field " + key);
      }
      const typeId = typeField ? item[typeField.id] : item.type;
      for (const field of definition.fields) {
        const value = item[field.id];
        if (value === undefined) {
          if (isRequired(field, typeId)) errors.push(where + " " + field.id + " is required");
          continue;
        }
        checkValue(errors, where, field, value, typeId);
        if (field.type === "type" && typeof value === "string" && !typeIds.has(value)) {
          errors.push(where + " " + field.id + " " + JSON.stringify(value) + " is not a type in the collection");
        }
      }
      if (idMode !== "ignore" && idField && typeof item[idField.id] === "string" && ID_RE.test(item[idField.id])) {
        if (seenIds.has(item[idField.id])) errors.push("duplicate id " + item[idField.id]);
        else seenIds.add(item[idField.id]);
      }
    if (titleField && typeof item[titleField.id] === "string") {
      const key = normalizeTitle(item[titleField.id]);
      if (key) {
        if (!titles.has(key)) titles.set(key, []);
        titles.get(key).push(item[idField ? idField.id : ""] || where);
      }
    }
    collectReferences(item, definition, referenced, errors, warnings, where);
  });

  const titleMode = (definition.duplicates && definition.duplicates.normalizedTitle) || "warning";
  if (titleMode !== "ignore") {
    for (const [title, ids] of titles) {
      if (ids.length < 2) continue;
      const message = "duplicate normalized title \"" + title + "\" on " + ids.join(", ");
      if (titleMode === "error") errors.push(message);
      else warnings.push(message);
    }
  }

  const entityDefs = new Map((definition.entities || []).map((entity) => [entity.id, entity]));
  for (const entityId of Object.keys(entities)) {
    if (!entityDefs.has(entityId)) {
      errors.push("entities has unknown type " + entityId);
      continue;
    }
    const table = entities[entityId];
    if (!isPlainObject(table)) {
      errors.push("entities." + entityId + " must be an object mapping names to records");
      continue;
    }
    const folded = new Map();
    for (const name of Object.keys(table)) {
      if (!name.trim() || name !== name.trim()) {
        errors.push("entities." + entityId + " has a blank or padded name");
        continue;
      }
      const foldName = fold(name);
      if (folded.has(foldName)) {
        warnings.push("entities." + entityId + " has names that match aside from case or accents: " + folded.get(foldName) + " and " + name);
      } else {
        folded.set(foldName, name);
      }
      checkEntityRecord(errors, entityDefs.get(entityId), name, table[name]);
    }
  }

  for (const [entityId, names] of Object.entries(referenced)) {
    const table = isPlainObject(entities[entityId]) ? entities[entityId] : {};
    const missing = [...names].filter((name) => !Object.prototype.hasOwnProperty.call(table, name));
    missing.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    for (const name of missing) {
      warnings.push(entityId + " " + JSON.stringify(name) + " is used on an item but has no entity record");
    }
  }

  return { errors, warnings };
}

function checkValue(errors, where, field, value, typeId) {
  if (field.type === "string" || field.type === "text") {
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
      errors.push(where + " " + field.id + " must be a non-empty string");
      return;
    }
    if (field.entity) {
      const names = splitNames(value);
      if (!names.length) errors.push(where + " " + field.id + " must name at least one " + field.entity);
    }
    return;
  }
  if (field.type === "enum") {
    if (typeof value !== "string" || !(field.values || []).includes(value)) {
      errors.push(where + " " + field.id + " must be one of " + (field.values || []).join(", "));
    }
    return;
  }
  if (field.type === "url") {
    if (typeof value !== "string" || !URL_RE.test(value)) errors.push(where + " " + field.id + " must be an http(s) URL");
    return;
  }
  if (field.type === "boolean") {
    if (typeof value !== "boolean") errors.push(where + " " + field.id + " must be true or false");
    return;
  }
  if (field.type === "integer" || field.type === "number" || field.type === "year" || field.type === "duration") {
    const whole = field.type !== "number";
    if (typeof value !== "number" || !Number.isFinite(value) || (whole && !Number.isInteger(value))) {
      errors.push(where + " " + field.id + " must be " + (whole ? "a whole number" : "a number"));
      return;
    }
    if (field.type === "year" && value < 0) errors.push(where + " " + field.id + " must be a whole number (0 if unknown)");
    if (field.type === "duration" && value <= 0) errors.push(where + " " + field.id + " must be a positive whole number");
    if (field.minimum !== undefined && value < field.minimum) errors.push(where + " " + field.id + " is below the minimum");
    if (field.maximum !== undefined && value > field.maximum) errors.push(where + " " + field.id + " is above the maximum");
    return;
  }
  if (field.type === "youtubeId" || field.type === "type") {
    if (field.type === "youtubeId") {
      if (typeof value !== "string" || !ID_RE.test(value)) errors.push(where + " " + field.id + " must be an 11-character YouTube id");
    } else if (typeof value !== "string" || !TYPE_ID_RE.test(value)) {
      errors.push(where + " " + field.id + " must be a lowercase category");
    } else if (typeId && value !== typeId) {
      errors.push(where + " " + field.id + " is inconsistent");
    }
    return;
  }
  if (field.type === "stringList" || field.type === "entityList") {
    if (!Array.isArray(value)) {
      errors.push(where + " " + field.id + " must be a list of strings");
      return;
    }
    const min = field.minItems != null ? field.minItems : (field.required ? 1 : 1);
    if (value.length < min) errors.push(where + " " + field.id + " needs at least " + min + " name" + (min === 1 ? "" : "s"));
    const seen = new Set();
    value.forEach((entry, entryIndex) => {
      if (typeof entry !== "string" || !entry.trim() || entry !== entry.trim()) {
        errors.push(where + " " + field.id + "[" + entryIndex + "] must be a non-empty string");
        return;
      }
      if (seen.has(entry)) errors.push(where + " " + field.id + " lists " + entry + " more than once");
      seen.add(entry);
    });
    return;
  }
  if (field.type === "credits") {
    if (!Array.isArray(value) || value.length === 0) {
      errors.push(where + " " + field.id + " must be a non-empty list when present");
      return;
    }
    const seen = new Set();
    value.forEach((credit, creditIndex) => {
      const cWhere = where + " " + field.id + "[" + creditIndex + "]";
      if (!isPlainObject(credit)) {
        errors.push(cWhere + " must be an object");
        return;
      }
      for (const key of Object.keys(credit)) {
        if (key !== "name" && key !== "role") errors.push(cWhere + " has unknown key " + key);
      }
      if (typeof credit.name !== "string" || !credit.name.trim()) errors.push(cWhere + " name is required");
      else if (seen.has(credit.name)) errors.push(cWhere + " repeats " + credit.name);
      else seen.add(credit.name);
      if (typeof credit.role !== "string" || !TYPE_ID_RE.test(credit.role)) {
        errors.push(cWhere + " role must be a lowercase word such as interviewer or instructor");
      }
    });
  }
}

function collectReferences(item, definition, referenced, errors, warnings, where) {
  const lists = {};
  for (const field of definition.fields) {
    if (field.type !== "entityList" || !Array.isArray(item[field.id])) continue;
    lists[field.entity] = new Set([...(lists[field.entity] || []), ...item[field.id].filter((name) => typeof name === "string")]);
  }
  for (const field of definition.fields) {
    const value = item[field.id];
    if (value === undefined) continue;
    if (field.type === "entityList" && field.entity && referenced[field.entity] && Array.isArray(value)) {
      for (const name of value) {
        if (typeof name === "string" && name.trim()) referenced[field.entity].add(name);
      }
    }
    if ((field.type === "string" || field.type === "text") && field.entity && typeof value === "string") {
      const names = splitNames(value);
      const lineup = lists[field.entity] || new Set();
      for (const name of names) {
        if (referenced[field.entity]) referenced[field.entity].add(name);
        if (lineup.size && !lineup.has(name)) {
          warnings.push(where + " " + field.id + " " + JSON.stringify(name) + " should also appear in the " + field.entity + " list");
        }
      }
    }
    if (field.type === "credits" && Array.isArray(value)) {
      const link = field.linkField ? item[field.linkField] : null;
      const lineup = new Set(Array.isArray(link) ? link : []);
      for (const credit of value) {
        if (!credit || typeof credit.name !== "string") continue;
        if (field.entity && referenced[field.entity]) referenced[field.entity].add(credit.name);
        if (lineup.size && !lineup.has(credit.name)) {
          errors.push(where + " " + field.id + " " + credit.name + " must also appear in " + field.linkField);
        }
      }
    }
  }
}

function checkEntityRecord(errors, entity, name, record) {
  const where = "entities." + entity.id + " " + JSON.stringify(name);
  if (!isPlainObject(record)) {
    errors.push(where + " must be an object");
    return;
  }
  const attributes = entity.attributes || [];
  const known = new Set(attributes.map((attribute) => attribute.id));
  for (const key of Object.keys(record)) {
    if (!known.has(key)) errors.push(where + " has unknown attribute " + key);
  }
  for (const attribute of attributes) {
    const value = record[attribute.id];
    if (value === undefined) {
      if (attribute.required) errors.push(where + " " + attribute.id + " is required");
      continue;
    }
    if (attribute.type === "string") {
      if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
        errors.push(where + " " + attribute.id + " must be a non-empty string");
      }
    } else if (!Array.isArray(value) || value.length === 0) {
      errors.push(where + " " + attribute.id + " must be a non-empty list");
    } else {
      const seen = new Set();
      value.forEach((entry, index) => {
        if (typeof entry !== "string" || !entry.trim() || entry !== entry.trim()) {
          errors.push(where + " " + attribute.id + "[" + index + "] must be a non-empty string");
          return;
        }
        if (seen.has(entry)) errors.push(where + " " + attribute.id + " repeats " + entry);
        seen.add(entry);
      });
    }
  }
}

module.exports = {
  ID_RE,
  validateData,
  normalizeTitle,
  fold,
  fieldByRole,
};
