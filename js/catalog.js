"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Catalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function prepareDefinition(definition) {
    const source = definition || {};
    return {
      id: source.id || "collection",
      title: source.title || "YouTube collection",
      description: source.description || "",
      example: source.example === true,
      language: source.language || "en",
      labels: Object.assign({ item: "item", items: "items" }, source.labels || {}),
      site: Object.assign({
        eyebrow: "YouTube collection",
        perPage: 12,
        themeStorageKey: "ytc-theme",
        canonical: "",
        repository: "",
        sampleBanner: "",
      }, source.site || {}),
      display: Object.assign({
        showTypeBadge: true,
        showDuration: true,
        showDiscover: true,
        showCrossLinks: true,
      }, source.display || {}),
      types: source.types || [],
      fields: source.fields || [],
      entities: source.entities || [],
      views: source.views || [],
      sorts: source.sorts || [],
      search: source.search || {},
      duplicates: source.duplicates || {},
      research: source.research || {},
      storage: source.storage || { adapter: "json" },
    };
  }

  function roleField(definition, role) {
    return (definition.fields || []).find((field) => field.role === role) || null;
  }

  function fieldById(definition, id) {
    return (definition.fields || []).find((field) => field.id === id) || null;
  }

  function typeInfo(definition, id) {
    return (definition.types || []).find((type) => type.id === id) || null;
  }

  function entityInfo(definition, id) {
    return (definition.entities || []).find((entity) => entity.id === id) || null;
  }

  function compareNames(a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }

  function fold(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function uniqueSorted(values) {
    return [...new Set(values)].sort(compareNames);
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function formatLong(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours >= 24) return hours + "h " + String(minutes).padStart(2, "0") + "m";
    return formatDuration(total);
  }

  function decadeOf(year) {
    const number = Number(year);
    if (!number) return "Unknown";
    return Math.floor(number / 10) * 10 + "s";
  }

  function youtubeUrl(id) {
    return "https://www.youtube.com/watch?v=" + encodeURIComponent(id || "");
  }

  function thumbUrl(id) {
    return "https://i.ytimg.com/vi/" + encodeURIComponent(id || "") + "/mqdefault.jpg";
  }

  function attributeKey(entityId, attributeId) {
    return entityId + "." + attributeId;
  }

  function arrayNames(value) {
    if (!Array.isArray(value)) return [];
    const names = [];
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) names.push(entry);
    }
    return names;
  }

  function itemType(item, definition) {
    const field = roleField(definition, "type");
    return field ? item[field.id] : item.type;
  }

  function itemId(item, definition) {
    const field = roleField(definition, "id");
    return field ? item[field.id] : item.id;
  }

  function durationOf(item, definition) {
    const field = roleField(definition, "duration");
    const value = field ? item[field.id] : item.durationSeconds;
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function countByType(items, definition) {
    const counts = {};
    for (const type of definition.types || []) counts[type.id] = 0;
    for (const item of items) {
      const id = itemType(item, definition);
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }

  function namesOnItem(item, definition) {
    const names = new Set();
    for (const field of definition.fields || []) {
      if (field.type === "entityList") {
        for (const name of arrayNames(item[field.id])) names.add(name);
      } else if (field.type === "credits" && Array.isArray(item[field.id])) {
        for (const credit of item[field.id]) {
          if (credit && typeof credit.name === "string" && credit.name) names.add(credit.name);
        }
      } else if ((field.type === "string" || field.type === "text") && field.entity && typeof item[field.id] === "string") {
        for (const name of item[field.id].split(",")) {
          const trimmed = name.trim();
          if (trimmed) names.add(trimmed);
        }
      }
    }
    return names;
  }

  function peopleChips(item, definition) {
    const field = (definition.fields || []).find((entry) => entry.type === "entityList" && entry.display === "chips")
      || (definition.fields || []).find((entry) => entry.type === "entityList");
    if (!field) return [];
    const roles = {};
    for (const creditsField of definition.fields || []) {
      if (creditsField.type !== "credits" || creditsField.linkField !== field.id) continue;
      const credits = item[creditsField.id];
      if (!Array.isArray(credits)) continue;
      for (const credit of credits) {
        if (credit && typeof credit.name === "string") roles[credit.name] = credit.role || "";
      }
    }
    return arrayNames(item[field.id]).map((name) => ({
      name,
      role: roles[name] || "",
      entity: field.entity,
      field: field.id,
    }));
  }

  function buildIndex(items, entities, rawDefinition) {
    const definition = prepareDefinition(rawDefinition);
    const safeItems = Array.isArray(items) ? items : [];
    const safeEntities = entities && typeof entities === "object" ? entities : {};
    const entityCounts = {};
    for (const entity of definition.entities) entityCounts[entity.id] = {};
    for (const item of safeItems) {
      const seen = new Set();
      for (const field of definition.fields) {
        if (field.type !== "entityList") continue;
        if (!entityCounts[field.entity]) entityCounts[field.entity] = {};
        for (const name of arrayNames(item[field.id])) {
          const token = field.entity + "\0" + name;
          if (seen.has(token)) continue;
          seen.add(token);
          entityCounts[field.entity][name] = (entityCounts[field.entity][name] || 0) + 1;
        }
      }
    }

    const fieldValues = {};
    for (const field of definition.fields) {
      if (!field.filterable || field.role === "type" || field.filter === "decade") continue;
      const values = [];
      for (const item of safeItems) {
        const value = item[field.id];
        if (field.type === "entityList" || field.type === "stringList") values.push(...arrayNames(value));
        else if (field.type === "boolean") values.push(value ? "true" : "false");
        else if (value !== undefined && value !== null && String(value).trim()) values.push(String(value));
      }
      fieldValues[field.id] = uniqueSorted(values);
    }

    const yearField = roleField(definition, "year");
    let decades = [];
    if (yearField && yearField.filter === "decade") {
      decades = uniqueSorted(safeItems.map((item) => decadeOf(item[yearField.id])));
      decades.sort((a, b) => {
        if (a === "Unknown") return 1;
        if (b === "Unknown") return -1;
        return a.localeCompare(b);
      });
    }

    const attributeFilters = [];
    for (const entity of definition.entities) {
      for (const attribute of entity.attributes || []) {
        if (!attribute.filterable) continue;
        const values = [];
        const table = safeEntities[entity.id] || {};
        const names = Object.keys(entityCounts[entity.id] || {});
        for (const name of names) {
          const record = table[name];
          if (!record) continue;
          const value = record[attribute.id];
          if (Array.isArray(value)) values.push(...value.filter((entry) => typeof entry === "string"));
          else if (typeof value === "string" && value) values.push(value);
        }
        attributeFilters.push({
          key: attributeKey(entity.id, attribute.id),
          entityId: entity.id,
          attributeId: attribute.id,
          label: attribute.label || attribute.id,
          values: uniqueSorted(values),
        });
      }
    }

    const crossNames = {};
    for (const entity of definition.entities) {
      const min = entity.crossLinkMin || 2;
      crossNames[entity.id] = Object.keys(entityCounts[entity.id] || {})
        .filter((name) => entityCounts[entity.id][name] >= min)
        .sort((a, b) => entityCounts[entity.id][b] - entityCounts[entity.id][a] || compareNames(a, b));
    }

    function attributesFor(entityId, name) {
      const table = safeEntities[entityId];
      if (!table || !Object.prototype.hasOwnProperty.call(table, name)) return null;
      return table[name];
    }

    function attributeValues(item, entityId, attributeId) {
      const found = new Set();
      for (const field of definition.fields) {
        if (field.type !== "entityList" || field.entity !== entityId) continue;
        for (const name of arrayNames(item[field.id])) {
          const record = attributesFor(entityId, name);
          if (!record) continue;
          const value = record[attributeId];
          if (Array.isArray(value)) {
            for (const entry of value) found.add(entry);
          } else if (typeof value === "string" && value) {
            found.add(value);
          }
        }
      }
      return found;
    }

    return {
      definition,
      items: safeItems,
      entities: safeEntities,
      fieldValues,
      decades,
      attributeFilters,
      entityCounts,
      crossNames,
      attributesFor,
      attributeValues,
    };
  }

  function searchableText(item, index) {
    const definition = index.definition;
    const parts = [];
    for (const field of definition.fields) {
      if (!field.searchable) continue;
      const value = item[field.id];
      if (field.type === "entityList" || field.type === "stringList") parts.push(arrayNames(value).join(" "));
      else if (field.type === "credits" && Array.isArray(value)) {
        parts.push(value.map((credit) => (credit ? (credit.name || "") + " " + (credit.role || "") : "")).join(" "));
      } else if (value !== undefined && value !== null) parts.push(String(value));
      if (field.type === "type") {
        const info = typeInfo(definition, value);
        if (info) parts.push(info.label, info.plural);
      }
      if (field.type === "entityList") {
        const entity = entityInfo(definition, field.entity);
        for (const name of arrayNames(value)) {
          const record = index.attributesFor(field.entity, name);
          if (!record || !entity) continue;
          for (const attribute of entity.attributes || []) {
            if (!attribute.searchable) continue;
            const attr = record[attribute.id];
            if (Array.isArray(attr)) parts.push(attr.join(" "));
            else if (attr) parts.push(String(attr));
          }
        }
      }
    }
    return parts.join(" ");
  }

  function matches(item, filters, index) {
    const definition = index.definition;
    const query = fold(filters && filters.query).trim();
    const type = (filters && filters.type) || "All";
    if (type !== "All" && itemType(item, definition) !== type) return false;
    const fieldFilters = (filters && filters.fields) || {};
    for (const field of definition.fields) {
      const selected = fieldFilters[field.id];
      if (!selected || selected === "All" || field.role === "type") continue;
      const value = item[field.id];
      if (field.filter === "decade") {
        if (decadeOf(value) !== selected) return false;
        continue;
      }
      if (field.type === "entityList" || field.type === "stringList") {
        if (!arrayNames(value).includes(selected)) return false;
        continue;
      }
      if (field.type === "boolean") {
        if ((value ? "true" : "false") !== selected) return false;
        continue;
      }
      if (String(value) !== selected) return false;
    }
    const attributeFilters = (filters && filters.attributes) || {};
    for (const filter of index.attributeFilters) {
      const selected = attributeFilters[filter.key];
      if (!selected || selected === "All") continue;
      if (!index.attributeValues(item, filter.entityId, filter.attributeId).has(selected)) return false;
    }
    if (query && !fold(searchableText(item, index)).includes(query)) return false;
    return true;
  }

  function sortSpec(definition, sortId) {
    return (definition.sorts || []).find((sort) => sort.id === sortId) || (definition.sorts || [])[0] || null;
  }

  function numberKey(value, sort) {
    let number = Number(value);
    if (!Number.isFinite(number)) return sort && sort.unknownLast ? Infinity : 0;
    if (sort && sort.unknownLast && number === sort.unknown) return Infinity;
    return number;
  }

  function compareBySort(a, b, sort, definition) {
    if (!sort) return compareNames(itemId(a, definition), itemId(b, definition));
    const direction = sort.direction === "desc" ? -1 : 1;
    let primary = 0;
    if (sort.kind === "number") primary = (numberKey(a[sort.field], sort) - numberKey(b[sort.field], sort)) * direction;
    else primary = compareNames(a[sort.field], b[sort.field]) * direction;
    if (primary) return primary;
    const title = roleField(definition, "title");
    const titleCmp = title ? compareNames(a[title.id], b[title.id]) : 0;
    return titleCmp || compareNames(itemId(a, definition), itemId(b, definition));
  }

  function sortItems(items, sortId, index) {
    const definition = index.definition;
    const sort = sortSpec(definition, sortId);
    const copy = items.slice();
    copy.sort((a, b) => compareBySort(a, b, sort, definition));
    return copy;
  }

  function groupKeys(item, view, index) {
    if (!view || view.source === "list") return [];
    if (view.source === "attribute") {
      const keys = [];
      for (const name of arrayNames(item[view.field])) {
        const record = index.attributesFor(view.entity, name);
        if (!record) continue;
        const value = record[view.attribute];
        if (Array.isArray(value)) keys.push(...value.filter((entry) => typeof entry === "string" && entry));
        else if (typeof value === "string" && value) keys.push(value);
      }
      return [...new Set(keys)];
    }
    if (view.source === "entity") return [...new Set(arrayNames(item[view.field]))];
    const value = item[view.field];
    if (Array.isArray(value)) return [...new Set(arrayNames(value))];
    if (value === undefined || value === null || value === "") return [];
    return [String(value)];
  }

  function sumField(items, fieldId) {
    return items.reduce((sum, item) => sum + (Number(item[fieldId]) || 0), 0);
  }

  function groupItems(rows, viewId, sortId, index, filters) {
    const definition = index.definition;
    const view = (definition.views || []).find((candidate) => candidate.id === viewId);
    if (!view || view.source === "list") return [];
    const map = new Map();
    for (const item of rows) {
      for (const key of groupKeys(item, view, index)) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
      }
    }
    let keys = [...map.keys()];
    const query = filters && filters.query ? String(filters.query).trim() : "";
    const selected = filters && filters.fields ? filters.fields[view.field] : "All";
    if (view.hideSingletons && !query && (!selected || selected === "All")) {
      const counts = (view.entity && index.entityCounts[view.entity]) || {};
      keys = keys.filter((key) => (counts[key] || 0) > 1 || map.get(key).length > 1);
    }
    const sort = sortSpec(definition, sortId);
    keys.sort((a, b) => {
      const left = map.get(a);
      const right = map.get(b);
      if (sort && sort.kind === "number" && sort.direction === "desc") {
        return sumField(right, sort.field) - sumField(left, sort.field) || compareNames(a, b);
      }
      if (sort && sort.kind === "number") {
        const leftKey = Math.min(...left.map((item) => numberKey(item[sort.field], sort)));
        const rightKey = Math.min(...right.map((item) => numberKey(item[sort.field], sort)));
        return leftKey - rightKey || compareNames(a, b);
      }
      return compareNames(a, b);
    });
    const durationField = roleField(definition, "duration");
    return keys.map((key) => ({
      key,
      view: view.id,
      items: map.get(key),
      count: map.get(key).length,
      seconds: durationField ? sumField(map.get(key), durationField.id) : 0,
    }));
  }

  function categoryField(definition) {
    return (definition.fields || []).find((field) => field.swatch)
      || (definition.fields || []).find((field) => field.filterable && (field.type === "string" || field.type === "text" || field.type === "enum") && field.role !== "type")
      || null;
  }

  function related(item, items, index, limit) {
    const definition = index.definition;
    const max = limit || 5;
    const names = namesOnItem(item, definition);
    const category = categoryField(definition);
    const id = itemId(item, definition);
    const ranked = [];
    for (const other of items) {
      if (itemId(other, definition) === id) continue;
      const shared = [...namesOnItem(other, definition)].filter((name) => names.has(name));
      const same = Boolean(category && item[category.id] && item[category.id] === other[category.id]);
      if (!shared.length && !same) continue;
      ranked.push({ item: other, shared, sameCategory: same && !shared.length });
    }
    ranked.sort((a, b) => b.shared.length - a.shared.length || compareNames(a.item[roleField(definition, "title").id], b.item[roleField(definition, "title").id]));
    return ranked.slice(0, max);
  }

  function appearances(query, items, index) {
    const definition = index.definition;
    const needle = fold(query).trim();
    if (needle.length < 2) return [];
    const filedUnder = (definition.views || []).find((view) => view.source === "field");
    const map = new Map();
    for (const item of items) {
      for (const name of namesOnItem(item, definition)) {
        if (!fold(name).includes(needle)) continue;
        if (!map.has(name)) map.set(name, new Set());
        if (filedUnder && item[filedUnder.field]) map.get(name).add(String(item[filedUnder.field]));
      }
    }
    return [...map.entries()]
      .map(([name, acts]) => ({ name, acts: [...acts].sort(compareNames) }))
      .sort((a, b) => b.acts.length - a.acts.length || compareNames(a.name, b.name));
  }

  function pageCount(total, perPage) {
    const size = perPage || 12;
    return Math.max(1, Math.ceil((Number(total) || 0) / size));
  }

  function csvCell(value) {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function cellValue(item, field) {
    const value = item[field.id];
    if (value == null || value === "") return "";
    if (field.type === "stringList" || field.type === "entityList") return arrayNames(value).join("; ");
    if (field.type === "credits" && Array.isArray(value)) {
      return value.map((credit) => {
        if (!credit || !credit.name) return "";
        return credit.role ? credit.name + " (" + credit.role + ")" : credit.name;
      }).filter(Boolean).join("; ");
    }
    if (field.type === "boolean") return value ? "true" : "false";
    return String(value);
  }

  function toCsv(items, rawDefinition) {
    const definition = prepareDefinition(rawDefinition);
    const idField = roleField(definition, "id");
    const header = ["youtube_url"].concat(definition.fields.map((field) => field.id));
    const lines = [header.map(csvCell).join(",")];
    for (const item of items) {
      const row = [youtubeUrl(idField ? item[idField.id] : "")].concat(definition.fields.map((field) => cellValue(item, field)));
      lines.push(row.map(csvCell).join(","));
    }
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  function csvFilename(rawDefinition) {
    const definition = prepareDefinition(rawDefinition);
    return definition.id + ".csv";
  }

  return {
    prepareDefinition,
    roleField,
    fieldById,
    typeInfo,
    entityInfo,
    compareNames,
    fold,
    formatDuration,
    formatLong,
    decadeOf,
    youtubeUrl,
    thumbUrl,
    attributeKey,
    itemType,
    itemId,
    durationOf,
    countByType,
    namesOnItem,
    peopleChips,
    buildIndex,
    matches,
    sortItems,
    groupItems,
    related,
    appearances,
    pageCount,
    toCsv,
    csvFilename,
    categoryField,
  };
});
