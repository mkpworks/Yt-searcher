"use strict";

const fs = require("fs");
const path = require("path");

const TYPE_ID_RE = /^[a-z]+(?:-[a-z]+)*$/;
const FIELD_TYPES = new Set([
  "string",
  "text",
  "integer",
  "number",
  "boolean",
  "year",
  "duration",
  "youtubeId",
  "stringList",
  "entityList",
  "credits",
  "enum",
  "url",
  "type",
]);
const ROLES = new Set(["id", "type", "title", "duration", "year"]);
const DISPLAYS = new Set(["hidden", "title", "meta", "badge", "byline", "chips", "credits", "duration", "note"]);
const FIELD_KEYS = new Set([
  "id", "label", "type", "role", "required", "unique", "searchable", "filterable", "sortable",
  "display", "swatch", "filter", "entity", "linkField", "appliesTo", "minItems", "values",
  "minimum", "maximum", "unknown",
]);
const TOP_KEYS = new Set([
  "id", "title", "description", "example", "language", "labels", "site", "display", "types",
  "fields", "entities", "views", "sorts", "search", "duplicates", "research", "storage",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((key) => !allowed.has(key));
}

function requireString(errors, object, key, where) {
  if (typeof object[key] !== "string" || !object[key].trim()) {
    errors.push(where + " " + key + " must be a non-empty string");
    return false;
  }
  return true;
}

function validateDefinition(definition) {
  const errors = [];
  if (!isPlainObject(definition)) {
    return ["collection definition must be an object"];
  }
  for (const key of unknownKeys(definition, TOP_KEYS)) {
    errors.push("unknown collection key " + key);
  }
  requireString(errors, definition, "id", "collection");
  requireString(errors, definition, "title", "collection");
  requireString(errors, definition, "description", "collection");
  if (definition.example !== undefined && typeof definition.example !== "boolean") {
    errors.push("collection example must be a boolean");
  }
  if (definition.language !== undefined && (typeof definition.language !== "string" || !definition.language.trim())) {
    errors.push("collection language must be a non-empty string");
  }

  if (definition.labels !== undefined) {
    if (!isPlainObject(definition.labels)) errors.push("labels must be an object");
    else {
      for (const key of unknownKeys(definition.labels, new Set(["item", "items"]))) {
        errors.push("unknown labels key " + key);
      }
      for (const key of ["item", "items"]) {
        if (definition.labels[key] !== undefined) requireString(errors, definition.labels, key, "labels");
      }
    }
  }

  validateSite(errors, definition.site);
  validateDisplay(errors, definition.display);
  const typeIds = validateTypes(errors, definition.types);
  const fields = validateFields(errors, definition.fields, typeIds);
  const fieldIds = new Set(fields.map((field) => field.id));
  const entityIds = validateEntities(errors, definition.entities);
  for (const field of fields) {
    if (field.entity && !entityIds.has(field.entity)) {
      errors.push("field " + field.id + " references unknown entity " + field.entity);
    }
    if (field.linkField && !fieldIds.has(field.linkField)) {
      errors.push("field " + field.id + " linkField " + field.linkField + " is not a field");
    }
  }
  validateViews(errors, definition.views, fieldIds, Array.isArray(definition.entities) ? definition.entities : [], fields);
  validateSorts(errors, definition.sorts, fieldIds);
  validateSearch(errors, definition.search);
  validateDuplicates(errors, definition.duplicates);
  validateResearch(errors, definition.research, typeIds);
  validateStorage(errors, definition.storage);
  return errors;
}

function validateSite(errors, site) {
  if (site === undefined) return;
  if (!isPlainObject(site)) {
    errors.push("site must be an object");
    return;
  }
  const allowed = new Set(["eyebrow", "canonical", "repository", "perPage", "themeStorageKey", "sampleBanner"]);
  for (const key of unknownKeys(site, allowed)) errors.push("unknown site key " + key);
  for (const key of ["eyebrow", "canonical", "repository", "themeStorageKey", "sampleBanner"]) {
    if (site[key] !== undefined && (typeof site[key] !== "string" || !site[key].trim())) {
      errors.push("site." + key + " must be a non-empty string");
    }
  }
  if (site.perPage !== undefined && (!Number.isInteger(site.perPage) || site.perPage < 1 || site.perPage > 100)) {
    errors.push("site.perPage must be an integer from 1 to 100");
  }
}

function validateDisplay(errors, display) {
  if (display === undefined) return;
  if (!isPlainObject(display)) {
    errors.push("display must be an object");
    return;
  }
  const allowed = new Set(["showTypeBadge", "showDuration", "showDiscover", "showCrossLinks"]);
  for (const key of unknownKeys(display, allowed)) errors.push("unknown display key " + key);
  for (const key of allowed) {
    if (display[key] !== undefined && typeof display[key] !== "boolean") {
      errors.push("display." + key + " must be a boolean");
    }
  }
}

function validateTypes(errors, types) {
  const ids = new Set();
  if (!Array.isArray(types) || types.length === 0) {
    errors.push("types must be a non-empty list");
    return ids;
  }
  types.forEach((type, index) => {
    const where = "types[" + index + "]";
    if (!isPlainObject(type)) {
      errors.push(where + " must be an object");
      return;
    }
    for (const key of unknownKeys(type, new Set(["id", "label", "plural", "description"]))) {
      errors.push(where + " has unknown key " + key);
    }
    if (typeof type.id !== "string" || !TYPE_ID_RE.test(type.id)) {
      errors.push(where + " id must be a lowercase token such as lesson or live-set");
    } else if (ids.has(type.id)) {
      errors.push("duplicate type " + type.id);
    } else {
      ids.add(type.id);
    }
    requireString(errors, type, "label", where);
    requireString(errors, type, "plural", where);
    if (type.description !== undefined) requireString(errors, type, "description", where);
  });
  return ids;
}

function validateFields(errors, fields, typeIds) {
  if (!Array.isArray(fields) || fields.length === 0) {
    errors.push("fields must be a non-empty list");
    return [];
  }
  const ids = new Set();
  const roleCount = {};
  fields.forEach((field, index) => {
    const where = "fields[" + index + "]";
    if (!isPlainObject(field)) {
      errors.push(where + " must be an object");
      return;
    }
    for (const key of unknownKeys(field, FIELD_KEYS)) errors.push(where + " has unknown key " + key);
    if (typeof field.id !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(field.id)) {
      errors.push(where + " id must be a camelCase field name");
    } else if (ids.has(field.id)) {
      errors.push("duplicate field " + field.id);
    } else {
      ids.add(field.id);
    }
    requireString(errors, field, "label", where);
    if (!FIELD_TYPES.has(field.type)) errors.push(where + " type is not a supported field type");
    if (field.role !== undefined) {
      if (!ROLES.has(field.role)) errors.push(where + " role is not supported");
      else roleCount[field.role] = (roleCount[field.role] || 0) + 1;
    }
    for (const flag of ["required", "unique", "searchable", "filterable", "sortable", "swatch"]) {
      if (field[flag] !== undefined && typeof field[flag] !== "boolean") {
        errors.push(where + " " + flag + " must be a boolean");
      }
    }
    if (field.display !== undefined && !DISPLAYS.has(field.display)) {
      errors.push(where + " display is not supported");
    }
    if (field.filter !== undefined && field.filter !== "exact" && field.filter !== "decade") {
      errors.push(where + " filter must be exact or decade");
    }
    if (field.type === "year" && field.filter !== undefined && field.filter !== "decade") {
      errors.push(where + " year filter must be decade");
    }
    if ((field.type === "entityList" || field.type === "credits") && (typeof field.entity !== "string" || !field.entity.trim())) {
      errors.push(where + " needs an entity id");
    }
    if (field.type === "credits" && (typeof field.linkField !== "string" || !field.linkField.trim())) {
      errors.push(where + " needs linkField pointing at the entity list that holds those names");
    }
    if (field.appliesTo !== undefined) {
      if (!Array.isArray(field.appliesTo) || field.appliesTo.length === 0) {
        errors.push(where + " appliesTo must be a non-empty list of type ids");
      } else {
        for (const typeId of field.appliesTo) {
          if (!typeIds.has(typeId)) errors.push(where + " appliesTo unknown type " + typeId);
        }
      }
    }
    if (field.minItems !== undefined && (!Number.isInteger(field.minItems) || field.minItems < 0)) {
      errors.push(where + " minItems must be a whole number");
    }
    if (field.type === "enum") {
      if (!Array.isArray(field.values) || field.values.length === 0 || field.values.some((value) => typeof value !== "string" || !value.trim())) {
        errors.push(where + " enum needs a non-empty values list of strings");
      }
    }
    for (const bound of ["minimum", "maximum", "unknown"]) {
      if (field[bound] !== undefined && typeof field[bound] !== "number") {
        errors.push(where + " " + bound + " must be a number");
      }
    }
  });

  const expected = [
    ["id", "youtubeId"],
    ["type", "type"],
    ["title", "string"],
    ["duration", "duration"],
  ];
  for (const [role, typeName] of expected) {
    const found = fields.filter((field) => field && field.role === role);
    if (found.length !== 1) errors.push("collection needs exactly one field with role " + role);
    else if (found[0].type !== typeName && !(role === "title" && found[0].type === "text")) {
      errors.push("the " + role + " field must use type " + typeName);
    } else if (found[0].required !== true) {
      errors.push("the " + role + " field must be required");
    }
  }
  if ((roleCount.year || 0) > 1) errors.push("collection can have only one year field");
  const yearField = fields.find((field) => field && field.role === "year");
  if (yearField && yearField.type !== "year") errors.push("the year field must use type year");
  return fields.filter(isPlainObject);
}

function validateEntities(errors, entities) {
  const ids = new Set();
  if (entities === undefined) return ids;
  if (!Array.isArray(entities)) {
    errors.push("entities must be a list");
    return ids;
  }
  entities.forEach((entity, index) => {
    const where = "entities[" + index + "]";
    if (!isPlainObject(entity)) {
      errors.push(where + " must be an object");
      return;
    }
    for (const key of unknownKeys(entity, new Set(["id", "label", "plural", "crossLinkMin", "page", "attributes"]))) {
      errors.push(where + " has unknown key " + key);
    }
    if (typeof entity.id !== "string" || !TYPE_ID_RE.test(entity.id)) {
      errors.push(where + " id must be a lowercase token");
    } else if (ids.has(entity.id)) {
      errors.push("duplicate entity " + entity.id);
    } else {
      ids.add(entity.id);
    }
    requireString(errors, entity, "label", where);
    requireString(errors, entity, "plural", where);
    if (entity.crossLinkMin !== undefined && (!Number.isInteger(entity.crossLinkMin) || entity.crossLinkMin < 1)) {
      errors.push(where + " crossLinkMin must be a positive integer");
    }
    if (entity.page !== undefined && typeof entity.page !== "boolean") {
      errors.push(where + " page must be a boolean");
    }
    if (entity.attributes !== undefined) {
      if (!Array.isArray(entity.attributes)) errors.push(where + " attributes must be a list");
      else {
        const attrIds = new Set();
        entity.attributes.forEach((attribute, attrIndex) => {
          const aWhere = where + ".attributes[" + attrIndex + "]";
          if (!isPlainObject(attribute)) {
            errors.push(aWhere + " must be an object");
            return;
          }
          for (const key of unknownKeys(attribute, new Set(["id", "label", "type", "required", "filterable", "searchable"]))) {
            errors.push(aWhere + " has unknown key " + key);
          }
          if (typeof attribute.id !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(attribute.id)) {
            errors.push(aWhere + " id must be a field name");
          } else if (attrIds.has(attribute.id)) {
            errors.push(where + " repeats attribute " + attribute.id);
          } else {
            attrIds.add(attribute.id);
          }
          requireString(errors, attribute, "label", aWhere);
          if (attribute.type !== "string" && attribute.type !== "stringList") {
            errors.push(aWhere + " type must be string or stringList");
          }
          for (const flag of ["required", "filterable", "searchable"]) {
            if (attribute[flag] !== undefined && typeof attribute[flag] !== "boolean") {
              errors.push(aWhere + " " + flag + " must be a boolean");
            }
          }
        });
      }
    }
  });
  return ids;
}

function validateViews(errors, views, fieldIds, entities, fields) {
  if (!Array.isArray(views) || views.length === 0) {
    errors.push("views must be a non-empty list");
    return;
  }
  const ids = new Set();
  const entityIds = new Set(entities.map((entity) => entity && entity.id).filter(Boolean));
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  views.forEach((view, index) => {
    const where = "views[" + index + "]";
    if (!isPlainObject(view)) {
      errors.push(where + " must be an object");
      return;
    }
    for (const key of unknownKeys(view, new Set(["id", "label", "source", "field", "entity", "attribute", "hideSingletons", "note"]))) {
      errors.push(where + " has unknown key " + key);
    }
    if (typeof view.id !== "string" || !TYPE_ID_RE.test(view.id)) errors.push(where + " id must be a lowercase token");
    else if (ids.has(view.id)) errors.push("duplicate view " + view.id);
    else ids.add(view.id);
    requireString(errors, view, "label", where);
    if (!["field", "entity", "attribute", "list"].includes(view.source)) {
      errors.push(where + " source must be field, entity, attribute, or list");
    }
    if (view.source === "field" || view.source === "entity" || view.source === "attribute") {
      if (!fieldIds.has(view.field)) errors.push(where + " field is missing");
    }
    if (view.source === "entity" || view.source === "attribute") {
      if (!entityIds.has(view.entity)) errors.push(where + " entity is missing");
      const field = fieldById.get(view.field);
      if (field && field.type !== "entityList") errors.push(where + " field must be an entityList");
      if (field && field.entity && view.entity && field.entity !== view.entity) {
        errors.push(where + " entity does not match the field");
      }
    }
    if (view.source === "attribute") {
      const entity = entities.find((candidate) => candidate && candidate.id === view.entity);
      const attributes = new Set(((entity && entity.attributes) || []).map((attribute) => attribute.id));
      if (typeof view.attribute !== "string" || !view.attribute.trim()) errors.push(where + " attribute is missing");
      else if (entity && !attributes.has(view.attribute)) errors.push(where + " attribute " + view.attribute + " is not on " + view.entity);
    }
    if (view.hideSingletons !== undefined && typeof view.hideSingletons !== "boolean") {
      errors.push(where + " hideSingletons must be a boolean");
    }
    if (view.note !== undefined) requireString(errors, view, "note", where);
  });
}

function validateSorts(errors, sorts, fieldIds) {
  if (!Array.isArray(sorts) || sorts.length === 0) {
    errors.push("sorts must be a non-empty list");
    return;
  }
  const ids = new Set();
  sorts.forEach((sort, index) => {
    const where = "sorts[" + index + "]";
    if (!isPlainObject(sort)) {
      errors.push(where + " must be an object");
      return;
    }
    for (const key of unknownKeys(sort, new Set(["id", "label", "field", "kind", "direction", "unknown", "unknownLast"]))) {
      errors.push(where + " has unknown key " + key);
    }
    if (typeof sort.id !== "string" || !TYPE_ID_RE.test(sort.id)) errors.push(where + " id must be a lowercase token");
    else if (ids.has(sort.id)) errors.push("duplicate sort " + sort.id);
    else ids.add(sort.id);
    requireString(errors, sort, "label", where);
    if (!fieldIds.has(sort.field)) errors.push(where + " field is missing");
    if (sort.kind !== "string" && sort.kind !== "number") errors.push(where + " kind must be string or number");
    if (sort.direction !== "asc" && sort.direction !== "desc") errors.push(where + " direction must be asc or desc");
    if (sort.unknown !== undefined && typeof sort.unknown !== "number") errors.push(where + " unknown must be a number");
    if (sort.unknownLast !== undefined && typeof sort.unknownLast !== "boolean") errors.push(where + " unknownLast must be a boolean");
  });
}

function validateSearch(errors, search) {
  if (search === undefined) return;
  if (!isPlainObject(search)) {
    errors.push("search must be an object");
    return;
  }
  for (const key of unknownKeys(search, new Set(["placeholder"]))) errors.push("unknown search key " + key);
  if (search.placeholder !== undefined) requireString(errors, search, "placeholder", "search");
}

function validateDuplicates(errors, duplicates) {
  if (duplicates === undefined) return;
  if (!isPlainObject(duplicates)) {
    errors.push("duplicates must be an object");
    return;
  }
  for (const key of unknownKeys(duplicates, new Set(["youtubeId", "normalizedTitle"]))) {
    errors.push("unknown duplicates key " + key);
  }
  if (duplicates.youtubeId !== undefined && duplicates.youtubeId !== "error" && duplicates.youtubeId !== "ignore") {
    errors.push("duplicates.youtubeId must be error or ignore");
  }
  if (duplicates.normalizedTitle !== undefined && !["error", "warning", "ignore"].includes(duplicates.normalizedTitle)) {
    errors.push("duplicates.normalizedTitle must be error, warning, or ignore");
  }
}

function validateResearch(errors, research, typeIds) {
  if (research === undefined) return;
  if (!isPlainObject(research)) {
    errors.push("research must be an object");
    return;
  }
  const allowed = new Set(["batchSize", "prefer", "avoid", "recency", "yearPolicy", "entityNamePolicy", "dedupe"]);
  for (const key of unknownKeys(research, allowed)) errors.push("unknown research key " + key);
  if (research.batchSize !== undefined && (!Number.isInteger(research.batchSize) || research.batchSize < 1 || research.batchSize > 100)) {
    errors.push("research.batchSize must be an integer from 1 to 100");
  }
  for (const key of ["prefer", "avoid", "dedupe"]) {
    if (research[key] === undefined) continue;
    if (!Array.isArray(research[key]) || research[key].some((value) => typeof value !== "string" || !value.trim())) {
      errors.push("research." + key + " must be a list of non-empty strings");
    }
  }
  for (const key of ["yearPolicy", "entityNamePolicy"]) {
    if (research[key] !== undefined) requireString(errors, research, key, "research");
  }
  if (research.recency !== undefined) {
    if (!Array.isArray(research.recency)) errors.push("research.recency must be a list");
    else {
      research.recency.forEach((rule, index) => {
        const where = "research.recency[" + index + "]";
        if (!isPlainObject(rule)) {
          errors.push(where + " must be an object");
          return;
        }
        for (const key of unknownKeys(rule, new Set(["type", "maxAgeYears", "note"]))) {
          errors.push(where + " has unknown key " + key);
        }
        if (typeof rule.type !== "string" || !TYPE_ID_RE.test(rule.type)) {
          errors.push(where + " type must be a lowercase type token");
        } else if (!typeIds.has(rule.type)) {
          errors.push(where + " type " + rule.type + " is not in types (add the type or drop the rule)");
        }
        if (!Number.isInteger(rule.maxAgeYears) || rule.maxAgeYears < 0) {
          errors.push(where + " maxAgeYears must be a whole number");
        }
        if (rule.note !== undefined) requireString(errors, rule, "note", where);
      });
    }
  }
}

function validateStorage(errors, storage) {
  if (!isPlainObject(storage)) {
    errors.push("storage must be an object");
    return;
  }
  for (const key of unknownKeys(storage, new Set(["adapter", "json", "sqlite"]))) {
    errors.push("unknown storage key " + key);
  }
  if (storage.adapter !== "json" && storage.adapter !== "sqlite") {
    errors.push("storage.adapter must be json or sqlite");
  }
  if (storage.json !== undefined) {
    if (!isPlainObject(storage.json)) errors.push("storage.json must be an object");
    else {
      for (const key of unknownKeys(storage.json, new Set(["items", "entities"]))) errors.push("unknown storage.json key " + key);
      for (const key of ["items", "entities"]) {
        if (storage.json[key] !== undefined && (typeof storage.json[key] !== "string" || !storage.json[key].trim())) {
          errors.push("storage.json." + key + " must be a path");
        }
      }
    }
  }
  if (storage.sqlite !== undefined) {
    if (!isPlainObject(storage.sqlite)) errors.push("storage.sqlite must be an object");
    else {
      for (const key of unknownKeys(storage.sqlite, new Set(["file"]))) errors.push("unknown storage.sqlite key " + key);
      if (storage.sqlite.file !== undefined && (typeof storage.sqlite.file !== "string" || !storage.sqlite.file.trim())) {
        errors.push("storage.sqlite.file must be a path");
      }
    }
  }
}

function loadDefinition(file) {
  let definition;
  try {
    definition = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error("Could not read " + file + ": " + error.message);
  }
  const errors = validateDefinition(definition);
  if (errors.length) {
    const error = new Error("Invalid collection definition (" + errors.length + ")\n - " + errors.join("\n - "));
    error.errors = errors;
    throw error;
  }
  return definition;
}

function repoRoot() {
  return path.join(__dirname, "..", "..");
}

function definitionPath(root) {
  return path.join(root || repoRoot(), "collection.json");
}

module.exports = {
  TYPE_ID_RE,
  FIELD_TYPES,
  validateDefinition,
  loadDefinition,
  repoRoot,
  definitionPath,
  isPlainObject,
};
