"use strict";

(function () {
  const SWATCHES = ["#e07a5f", "#3aa99a", "#e6a23c", "#7ea2e0", "#c46bdc", "#8fbf6a", "#e09ab2", "#d98a4a"];
  const state = {
    view: "",
    sort: "",
    type: "All",
    query: "",
    fields: {},
    attributes: {},
    page: 0,
    open: {},
    pickId: "",
    seed: true,
  };
  let definition = null;
  let index = null;
  let crossStamp = "";
  let discoverStamp = "";

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function labelToken(value) {
    const text = String(value || "");
    return text ? text.slice(0, 1).toUpperCase() + text.slice(1) : "";
  }

  function viewById(id) {
    return definition.views.find((view) => view.id === id) || definition.views[0];
  }

  function groupDomId(key) {
    return state.view + ":" + encodeURIComponent(key);
  }

  function entityField(entityId) {
    return definition.fields.find((field) => field.type === "entityList" && field.entity === entityId && field.filterable)
      || definition.fields.find((field) => field.type === "entityList" && field.entity === entityId)
      || null;
  }

  function attributeFilter(key) {
    return index.attributeFilters.find((filter) => filter.key === key) || null;
  }

  function isUnknownYear(field, value) {
    if (!field || field.role !== "year") return false;
    const unknown = field.unknown != null ? field.unknown : 0;
    return Number(value) === unknown || !value;
  }

  function currentRows() {
    return Catalog.sortItems(
      index.items.filter((item) => Catalog.matches(item, state, index)),
      state.sort,
      index
    );
  }

  function currentGroups(rows) {
    const view = viewById(state.view);
    if (!view || view.source === "list") return [];
    return Catalog.groupItems(rows, state.view, state.sort, index, state);
  }

  function typePhrase(items) {
    const counts = Catalog.countByType(items, definition);
    const parts = definition.types.filter((type) => counts[type.id]).map((type) => {
      const count = counts[type.id];
      return count + " " + (count === 1 ? type.label : type.plural).toLowerCase();
    });
    return parts.join(", ");
  }

  function swatchColor(value) {
    const field = definition.fields.find((candidate) => candidate.swatch);
    const values = field ? index.fieldValues[field.id] || [] : [];
    const at = Math.max(0, values.indexOf(String(value)));
    return SWATCHES[at % SWATCHES.length];
  }

  function entityOptionLabel(entityId, name) {
    const record = index.attributesFor(entityId, name) || {};
    const entity = Catalog.entityInfo(definition, entityId);
    const bits = [];
    for (const attribute of (entity && entity.attributes) || []) {
      const value = record[attribute.id];
      if (Array.isArray(value) && value.length) bits.push(value.map(labelToken).join(", "));
      else if (typeof value === "string" && value) bits.push(value);
    }
    return bits.length ? name + " · " + bits.join(", ") : name;
  }

  function chip(person, withCount) {
    const entity = Catalog.entityInfo(definition, person.entity);
    const record = index.attributesFor(person.entity, person.name) || {};
    const count = (index.entityCounts[person.entity] || {})[person.name] || 0;
    const linked = entity && entity.page !== false && count >= (entity.crossLinkMin || 2);
    const field = entityField(person.entity);
    const selected = field && state.fields[field.id] === person.name;
    const nameClass = linked && selected ? "chip-btn is-on" : "chip-btn";
    const nameHtml = linked
      ? '<button type="button" class="' + nameClass + '" data-action="entity" data-entity="' + esc(person.entity) + '" data-name="' + esc(person.name) + '">' + esc(person.name) + "</button>"
      : '<span class="chip-name">' + esc(person.name) + "</span>";
    const roleHtml = person.role ? '<span class="chip-role">' + esc(person.role) + "</span>" : "";
    let instHtml = "";
    for (const attribute of (entity && entity.attributes) || []) {
      if (!attribute.filterable) continue;
      const values = Array.isArray(record[attribute.id]) ? record[attribute.id] : [];
      const key = Catalog.attributeKey(person.entity, attribute.id);
      instHtml += values.map((value) => {
        const on = state.attributes[key] === value ? " is-on" : "";
        return '<button type="button" class="inst-btn' + on + '" data-action="attribute" data-key="' + esc(key) + '" data-name="' + esc(value) + '" aria-label="Filter by ' + esc(labelToken(value)) + '">' + esc(labelToken(value)) + "</button>";
      }).join("");
    }
    const countHtml = withCount ? '<span class="chip-count">' + count + "</span>" : "";
    return '<span class="chip">' + nameHtml + roleHtml + (instHtml ? '<span class="chip-insts">' + instHtml + "</span>" : "") + countHtml + "</span>";
  }

  function byline(item) {
    const bits = [];
    for (const field of definition.fields) {
      if (field.display !== "byline" || item[field.id] == null || item[field.id] === "") continue;
      const value = String(item[field.id]);
      if (field.id === "interviewer" || Catalog.fold(field.label) === "interviewer") bits.push("Interviewed by " + value);
      else bits.push(value);
    }
    return bits.length ? '<p class="byline">' + esc(bits.join(" · ")) + "</p>" : "";
  }

  function notes(item) {
    let html = "";
    for (const field of definition.fields) {
      const value = item[field.id];
      if (value == null || value === "") continue;
      if (field.display === "badge" && field.role !== "type") {
        const label = value === "audio-only" ? "Audio only" : value === "partial" ? "Partial" : String(value);
        html += '<span class="badge">' + esc(label) + "</span>";
      }
      if (field.display === "note") {
        if (value === "audio-only" || value === "partial") {
          html += '<span class="badge">' + esc(value === "audio-only" ? "Audio only" : "Partial") + "</span>";
        }
      }
    }
    return html;
  }

  function noteParagraphs(item) {
    const parts = [];
    for (const field of definition.fields) {
      const value = item[field.id];
      if (field.display !== "note" || value == null || value === "" || value === "audio-only" || value === "partial") continue;
      parts.push('<p class="item-note">' + esc(value) + "</p>");
    }
    return parts.join("");
  }

  function creditsLine(item) {
    const field = definition.fields.find((candidate) => candidate.type === "credits" && candidate.display === "credits");
    const credits = field && Array.isArray(item[field.id]) ? item[field.id] : [];
    if (!credits.length) return "";
    return '<p class="credits">' + credits.map((credit) => esc(credit.role ? credit.name + " · " + credit.role : credit.name)).join('<span class="credits-gap"> · </span>') + "</p>";
  }

  function metaLine(item) {
    const bits = [];
    for (const field of definition.fields) {
      if (field.display !== "meta") continue;
      const value = item[field.id];
      if (value == null || value === "" || isUnknownYear(field, value)) continue;
      if (field.swatch) {
        bits.push('<span class="swatch"><i style="background:' + swatchColor(value) + '"></i>' + esc(value) + "</span>");
      } else {
        bits.push("<span>" + esc(value) + "</span>");
      }
    }
    const kind = Catalog.typeInfo(definition, Catalog.itemType(item, definition));
    if (definition.display.showTypeBadge && kind) {
      const tone = Math.max(0, definition.types.findIndex((type) => type.id === kind.id));
      bits.push('<span class="type-badge" data-tone="' + (tone % 4) + '">' + esc(kind.label) + "</span>");
    }
    const badge = notes(item);
    if (badge) bits.push(badge);
    if (definition.display.showDuration) {
      bits.push('<span class="time">' + esc(Catalog.formatDuration(Catalog.durationOf(item, definition))) + "</span>");
    }
    return bits.join("");
  }

  function videoArticle(item, options) {
    const grouped = Boolean(options && options.grouped);
    const feature = Boolean(options && options.feature);
    const titleTag = feature || !grouped ? "h3" : "h4";
    const titleField = Catalog.roleField(definition, "title");
    const title = titleField ? item[titleField.id] : "";
    const id = Catalog.itemId(item, definition);
    const people = Catalog.peopleChips(item, definition);
    let sharedHtml = "";
    if (options && Array.isArray(options.shared)) {
      const category = Catalog.categoryField(definition);
      const text = options.shared.length
        ? "Shared: " + options.shared.join(", ")
        : "Same " + (category ? category.label.toLowerCase() : "group") + ": " + (category ? item[category.id] : "");
      sharedHtml = '<p class="shared">' + esc(text) + "</p>";
    }
    const pivot = options && options.pivot
      ? '<button type="button" class="text-btn" data-action="similar" data-id="' + esc(id) + '">Related</button>'
      : "";
    return (
      '<article class="video' + (feature ? " is-feature" : "") + '">' +
        '<div class="thumb-wrap"><img class="thumb" alt="" width="320" height="180" loading="lazy" decoding="async" src="' + Catalog.thumbUrl(id) + '" onerror="this.classList.add(\'is-broken\')"></div>' +
        '<div class="video-body">' +
          '<div class="video-top">' +
            "<" + titleTag + ' class="video-title">' + esc(title) + "</" + titleTag + ">" +
            '<a class="watch" href="' + Catalog.youtubeUrl(id) + '" target="_blank" rel="noopener noreferrer">Watch<span class="visually-hidden"> ' + esc(title) + " on YouTube</span></a>" +
          "</div>" +
          '<p class="meta">' + metaLine(item) + "</p>" +
          byline(item) +
          creditsLine(item) +
          noteParagraphs(item) +
          '<div class="chips">' + people.map((person) => chip(person, false)).join("") + "</div>" +
          sharedHtml +
          pivot +
        "</div>" +
      "</article>"
    );
  }

  function groupTitle(group) {
    const view = viewById(group.view || state.view);
    if (view && view.source === "attribute") return labelToken(group.key);
    if (view && view.source === "entity") {
      const record = index.attributesFor(view.entity, group.key) || {};
      const entity = Catalog.entityInfo(definition, view.entity);
      const bits = [];
      for (const attribute of (entity && entity.attributes) || []) {
        const value = record[attribute.id];
        if (Array.isArray(value) && value.length) bits.push(value.map(labelToken).join(", "));
      }
      return bits.length ? group.key + " · " + bits.join(", ") : group.key;
    }
    return group.key;
  }

  function groupBlock(group) {
    const id = groupDomId(group.key);
    const open = Boolean(state.open[id]);
    const view = viewById(state.view);
    let extra = "";
    if (view && view.source === "attribute") {
      const names = new Set();
      const entity = Catalog.entityInfo(definition, view.entity);
      for (const item of group.items) {
        for (const person of Catalog.peopleChips(item, definition)) {
          const record = index.attributesFor(view.entity, person.name) || {};
          const value = record[view.attribute];
          const list = Array.isArray(value) ? value : value ? [value] : [];
          if (list.includes(group.key)) names.add(person.name);
        }
      }
      const noun = entity ? (names.size === 1 ? entity.label.toLowerCase() : entity.plural.toLowerCase()) : "names";
      extra = " · " + names.size + " " + noun;
    }
    const meta = (typePhrase(group.items) || group.count + " " + definition.labels.items) + " · " + Catalog.formatDuration(group.seconds) + extra;
    const body = open
      ? '<div class="group-body">' + group.items.map((item) => videoArticle(item, { grouped: true, pivot: true })).join("") + "</div>"
      : "";
    return (
      '<section class="group' + (open ? " is-open" : "") + '">' +
        "<h3><button type=\"button\" class=\"group-toggle\" data-action=\"group\" data-group=\"" + esc(id) + "\" aria-expanded=\"" + (open ? "true" : "false") + "\">" +
          '<span class="group-main"><span class="chev" aria-hidden="true">▸</span><span class="group-title">' + esc(groupTitle(group)) + "</span></span>" +
          '<span class="group-meta">' + esc(meta) + "</span>" +
        "</button></h3>" +
        body +
      "</section>"
    );
  }

  function appearsHtml(rows) {
    const found = Catalog.appearances(state.query, rows, index);
    if (!found.length) return "";
    return '<div class="appears">' + found.slice(0, 3).map((person) => {
      const shown = person.acts.slice(0, 12);
      const links = shown.map((act) => '<button type="button" class="act-link" data-action="search" data-query="' + esc(act) + '">' + esc(act) + "</button>").join('<span class="act-sep">, </span>');
      const more = person.acts.length > shown.length ? '<span class="act-sep">…</span>' : "";
      return "<p><span class=\"appears-name\">" + esc(person.name) + "</span> appears in: " + links + more + "</p>";
    }).join("") + "</div>";
  }

  function emptyState(message) {
    return '<div class="empty"><p>' + esc(message) + '</p><button type="button" class="btn" data-action="clear">Clear filters</button></div>';
  }

  function pager(pages) {
    if (pages < 2) return "";
    const prev = state.page === 0 ? " disabled" : "";
    const next = state.page >= pages - 1 ? " disabled" : "";
    return '<nav class="pager" aria-label="Pagination"><button type="button" class="btn" data-action="prev"' + prev + ">Previous</button><button type=\"button\" class=\"btn\" data-action=\"next\"" + next + ">Next</button></nav>";
  }

  function render(scroll) {
    if (!index) return;
    const focusGroup = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-group");
    const rows = currentRows();
    const groups = currentGroups(rows);
    const view = viewById(state.view);
    if (state.seed && view && view.source !== "list" && groups.length) {
      const anyOpen = groups.some((group) => state.open[groupDomId(group.key)]);
      if (!anyOpen) state.open[groupDomId(groups[0].key)] = true;
      state.seed = false;
    }
    const perPage = definition.site.perPage || 12;
    const totalUnits = !view || view.source === "list" ? rows.length : groups.length;
    const pages = Catalog.pageCount(totalUnits, perPage);
    if (state.page > pages - 1) state.page = pages - 1;
    if (state.page < 0) state.page = 0;
    const start = state.page * perPage;
    const pageRows = rows.slice(start, start + perPage);
    const pageGroups = groups.slice(start, start + perPage);
    const counted = typePhrase(rows) || "0 " + definition.labels.items;
    const ofAll = rows.length === index.items.length ? counted : counted + " of " + index.items.length;
    let groupLabel = "";
    if (view && view.source !== "list") {
      const noun = view.source === "entity"
        ? (groups.length === 1 ? Catalog.entityInfo(definition, view.entity).label.toLowerCase() : Catalog.entityInfo(definition, view.entity).plural.toLowerCase())
        : view.source === "attribute" ? (groups.length === 1 ? "group" : "groups") : (groups.length === 1 ? "group" : "groups");
      groupLabel = " · " + groups.length + " " + noun;
    }
    document.getElementById("status").textContent = "Page " + (state.page + 1) + " of " + pages + " · " + ofAll + groupLabel;
    const note = document.getElementById("view-note");
    if (view && view.note && view.source !== "list") {
      note.hidden = false;
      note.textContent = view.note;
    } else {
      note.hidden = true;
      note.textContent = "";
    }
    let results = appearsHtml(rows);
    if (!view || view.source === "list") {
      results += rows.length
        ? pageRows.map((item) => videoArticle(item, { pivot: true })).join("") + pager(pages)
        : emptyState("Nothing matches these filters.");
    } else if (!groups.length) {
      results += emptyState("Nothing matches these filters.");
    } else {
      results += pageGroups.map(groupBlock).join("") + pager(pages);
    }
    document.getElementById("results").innerHTML = results;
    renderCross();
    renderDiscover();
    syncControls(pages);
    if (focusGroup) {
      const again = [...document.querySelectorAll("[data-group]")].find((node) => node.getAttribute("data-group") === focusGroup);
      if (again) again.focus();
    }
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("results").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  function renderCross() {
    const section = document.getElementById("cross-section");
    if (!definition.display.showCrossLinks) {
      section.hidden = true;
      return;
    }
    const blocks = [];
    const headings = [];
    for (const entity of definition.entities) {
      if (entity.page === false) continue;
      const names = index.crossNames[entity.id] || [];
      if (!names.length) continue;
      headings.push(entity.plural);
      const field = entityField(entity.id);
      blocks.push(names.map((name) => chip({ name, role: "", entity: entity.id, field: field ? field.id : "" }, true)).join(""));
    }
    const stamp = headings.join("|") + "\0" + JSON.stringify(state.fields) + "\0" + JSON.stringify(state.attributes);
    section.hidden = blocks.length === 0;
    if (!blocks.length) return;
    document.getElementById("cross-heading").textContent = headings.join(" and ") + " on more than one " + definition.labels.item;
    document.getElementById("cross-note").textContent = "Choose a name to filter every view. Words beside a name are the attributes on file.";
    if (stamp !== crossStamp) {
      crossStamp = stamp;
      document.getElementById("cross").innerHTML = blocks.join("");
    }
  }

  function renderDiscover() {
    const section = document.getElementById("discover");
    if (!definition.display.showDiscover) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    if (state.pickId === discoverStamp) return;
    discoverStamp = state.pickId;
    const pick = index.items.find((item) => Catalog.itemId(item, definition) === state.pickId) || index.items[0];
    if (!pick) {
      document.getElementById("discover-body").innerHTML = '<p class="section-note">No videos yet.</p>';
      return;
    }
    const similar = Catalog.related(pick, index.items, index, 5);
    const relatedHtml = similar.length
      ? '<h3 class="subhead">Related</h3>' + similar.map((entry) => videoArticle(entry.item, { shared: entry.shared })).join("")
      : '<p class="section-note">No related videos yet.</p>';
    document.getElementById("discover-body").innerHTML = videoArticle(pick, { feature: true }) + relatedHtml;
  }

  function syncControls(pages) {
    const query = document.getElementById("q");
    if (query && query.value !== state.query) query.value = state.query;
    document.querySelectorAll("[data-field]").forEach((select) => {
      const id = select.getAttribute("data-field");
      if (select.value !== state.fields[id]) select.value = state.fields[id] || "All";
    });
    document.querySelectorAll("[data-attribute-select]").forEach((select) => {
      const key = select.getAttribute("data-attribute-select");
      if (select.value !== state.attributes[key]) select.value = state.attributes[key] || "All";
    });
    const sort = document.getElementById("sort");
    if (sort && sort.value !== state.sort) sort.value = state.sort;
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", button.getAttribute("data-view") === state.view ? "true" : "false");
    });
    document.querySelectorAll("[data-type]").forEach((button) => {
      button.setAttribute("aria-pressed", button.getAttribute("data-type") === state.type ? "true" : "false");
    });
    const view = viewById(state.view);
    document.querySelectorAll("[data-group-only]").forEach((button) => {
      button.hidden = !view || view.source === "list";
    });
    document.querySelectorAll('[data-action="prev"]').forEach((button) => {
      button.disabled = state.page === 0;
    });
    document.querySelectorAll('[data-action="next"]').forEach((button) => {
      button.disabled = state.page >= pages - 1;
    });
    const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const themeButton = document.getElementById("theme");
    themeButton.textContent = theme === "light" ? "Dark theme" : "Light theme";
    themeButton.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }

  function optionsHtml(values, labeler) {
    const html = ['<option value="All">All</option>'];
    for (const value of values) {
      const label = labeler ? labeler(value) : value;
      html.push('<option value="' + esc(value) + '">' + esc(label) + "</option>");
    }
    return html.join("");
  }

  function buildControls() {
    const views = document.getElementById("views");
    views.innerHTML = definition.views.map((view) => {
      return '<button type="button" data-action="view" data-view="' + esc(view.id) + '" aria-pressed="false">' + esc(view.label) + "</button>";
    }).join("");
    const types = document.getElementById("types");
    types.innerHTML = '<button type="button" data-action="type" data-type="All" aria-pressed="true">All</button>' +
      definition.types.map((type) => '<button type="button" data-action="type" data-type="' + esc(type.id) + '" aria-pressed="false">' + esc(type.plural) + "</button>").join("");
    const filters = document.getElementById("filters");
    const placeholder = (definition.search && definition.search.placeholder) || "Search";
    let html = '<label class="field field-search"><span>Search <kbd>/</kbd></span><input id="q" type="search" placeholder="' + esc(placeholder) + '" autocomplete="off"></label>';
    for (const field of definition.fields) {
      if (!field.filterable || field.role === "type") continue;
      const values = field.filter === "decade" ? index.decades : (index.fieldValues[field.id] || []);
      const labeler = field.type === "entityList" ? (name) => entityOptionLabel(field.entity, name) : null;
      html += '<label class="field">' + esc(field.label) + '<select data-field="' + esc(field.id) + '">' + optionsHtml(values, labeler) + "</select></label>";
    }
    for (const filter of index.attributeFilters) {
      html += '<label class="field">' + esc(filter.label) + '<select data-attribute-select="' + esc(filter.key) + '">' + optionsHtml(filter.values, labelToken) + "</select></label>";
    }
    html += '<label class="field">Sort by <select id="sort">' + definition.sorts.map((sort) => '<option value="' + esc(sort.id) + '">' + esc(sort.label) + "</option>").join("") + "</select></label>";
    filters.innerHTML = html;
    document.getElementById("q").addEventListener("input", (event) => {
      state.query = event.target.value;
      state.page = 0;
      state.seed = true;
      render(false);
    });
    filters.querySelectorAll("select").forEach((select) => {
      select.addEventListener("change", (event) => {
        const fieldId = event.target.getAttribute("data-field");
        const attribute = event.target.getAttribute("data-attribute-select");
        if (fieldId) state.fields[fieldId] = event.target.value;
        else if (attribute) state.attributes[attribute] = event.target.value;
        else if (event.target.id === "sort") state.sort = event.target.value;
        state.page = 0;
        state.seed = true;
        render(false);
      });
    });
  }

  function resetFilters() {
    state.type = "All";
    state.query = "";
    for (const key of Object.keys(state.fields)) state.fields[key] = "All";
    for (const key of Object.keys(state.attributes)) state.attributes[key] = "All";
    state.page = 0;
  }

  function selectEntity(entityId, name) {
    const type = state.type;
    resetFilters();
    state.type = type;
    state.seed = true;
    const field = entityField(entityId);
    if (field) state.fields[field.id] = name;
  }

  function selectAttribute(key, name) {
    const type = state.type;
    resetFilters();
    state.type = type;
    state.seed = true;
    state.attributes[key] = name;
  }

  function downloadCsv() {
    const csv = Catalog.toCsv(currentRows(), definition);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = Catalog.csvFilename(definition);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(definition.site.themeStorageKey || "ytc-theme", next); } catch (error) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#f4f0e7" : "#12100d");
    render(false);
  }

  function scrollToDiscover() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("discover").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function onClick(event) {
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const action = el.getAttribute("data-action");
    if (action === "type") {
      state.type = el.getAttribute("data-type");
      state.page = 0;
      state.seed = true;
      render(false);
    } else if (action === "view") {
      state.view = el.getAttribute("data-view");
      state.page = 0;
      state.seed = true;
      render(false);
    } else if (action === "group") {
      const id = el.getAttribute("data-group");
      state.open[id] = !state.open[id];
      render(false);
    } else if (action === "prev") {
      state.page -= 1;
      render(true);
    } else if (action === "next") {
      state.page += 1;
      render(true);
    } else if (action === "expand") {
      for (const group of currentGroups(currentRows())) state.open[groupDomId(group.key)] = true;
      render(false);
    } else if (action === "collapse") {
      state.open = {};
      state.seed = false;
      render(false);
    } else if (action === "search") {
      state.query = el.getAttribute("data-query") || "";
      state.page = 0;
      state.seed = true;
      render(false);
    } else if (action === "clear") {
      resetFilters();
      state.seed = true;
      render(false);
    } else if (action === "entity") {
      selectEntity(el.getAttribute("data-entity"), el.getAttribute("data-name"));
      render(false);
    } else if (action === "attribute") {
      selectAttribute(el.getAttribute("data-key"), el.getAttribute("data-name"));
      render(false);
    } else if (action === "similar") {
      state.pickId = el.getAttribute("data-id");
      render(false);
      scrollToDiscover();
    } else if (action === "random") {
      const list = index.items;
      if (!list.length) return;
      let next = list[Math.floor(Math.random() * list.length)];
      let guard = 0;
      while (list.length > 1 && Catalog.itemId(next, definition) === state.pickId && guard < 8) {
        next = list[Math.floor(Math.random() * list.length)];
        guard += 1;
      }
      state.pickId = Catalog.itemId(next, definition);
      render(false);
      scrollToDiscover();
    } else if (action === "csv") {
      downloadCsv();
    } else if (action === "theme") {
      toggleTheme();
    }
  }

  function stat(label, value) {
    return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
  }

  function applyChrome() {
    document.title = definition.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", definition.description);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && definition.site.canonical) canonical.setAttribute("href", definition.site.canonical);
    document.documentElement.lang = definition.language || "en";
    document.getElementById("eyebrow").textContent = definition.site.eyebrow || "YouTube collection";
    document.getElementById("title").textContent = definition.title;
    document.getElementById("summary").textContent = definition.description;
    const banner = document.getElementById("banner");
    if (definition.example && definition.site.sampleBanner) {
      banner.hidden = false;
      banner.textContent = definition.site.sampleBanner;
    } else {
      banner.hidden = true;
    }
    const source = document.getElementById("source");
    if (definition.site.repository) source.href = definition.site.repository;
    const category = Catalog.categoryField(definition);
    const discoverNote = document.getElementById("discover-note");
    if (discoverNote) {
      discoverNote.textContent = "Related videos share a linked name. When nobody overlaps, other videos in the same " + (category ? category.label.toLowerCase() : "group") + " follow.";
    }
    const counts = Catalog.countByType(index.items, definition);
    const seconds = index.items.reduce((sum, item) => sum + Catalog.durationOf(item, definition), 0);
    let stats = definition.types.filter((type) => counts[type.id]).map((type) => stat(type.plural, String(counts[type.id]))).join("");
    stats += stat("Watch time", Catalog.formatLong(seconds));
    for (const entity of definition.entities) {
      const count = Object.keys(index.entityCounts[entity.id] || {}).length;
      if (count) stats += stat(entity.plural, String(count));
    }
    const swatch = definition.fields.find((field) => field.swatch);
    if (swatch) stats += stat(swatch.label, String((index.fieldValues[swatch.id] || []).length));
    document.getElementById("stats").innerHTML = stats;
  }

  async function load() {
    const [definitionRes, itemsRes, entitiesRes] = await Promise.all([
      fetch("collection.json"),
      fetch("data/items.json"),
      fetch("data/entities.json"),
    ]);
    if (!definitionRes.ok || !itemsRes.ok || !entitiesRes.ok) throw new Error("fetch failed");
    const rawDefinition = await definitionRes.json();
    const items = await itemsRes.json();
    const entities = await entitiesRes.json();
    if (!rawDefinition || !Array.isArray(rawDefinition.fields)) throw new Error("definition");
    if (!Array.isArray(items)) throw new Error("items");
    index = Catalog.buildIndex(items, entities, rawDefinition);
    definition = index.definition;
    state.view = definition.views.length ? definition.views[0].id : "list";
    state.sort = definition.sorts.length ? definition.sorts[0].id : "";
    for (const field of definition.fields) {
      if (field.filterable && field.role !== "type") state.fields[field.id] = "All";
    }
    for (const filter of index.attributeFilters) state.attributes[filter.key] = "All";
    const featured = items.find((item) => Catalog.itemType(item, definition) === (definition.types[1] && definition.types[1].id)) || items[0];
    state.pickId = featured ? Catalog.itemId(featured, definition) : "";
    applyChrome();
    buildControls();
    render(false);
  }

  function bind() {
    document.body.addEventListener("click", onClick);
    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      const query = document.getElementById("q");
      if (query) query.focus();
    });
  }

  if (typeof Catalog === "undefined") {
    document.getElementById("status").textContent = "The page scripts did not load.";
  } else {
    bind();
    load().catch(() => {
      document.getElementById("status").textContent = "Could not load the collection. Serve this folder over HTTP so the JSON files can be read.";
    });
  }
})();
