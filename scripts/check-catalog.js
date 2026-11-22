"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const Catalog = require("../js/catalog.js");
const { loadDefinition, validateDefinition, repoRoot } = require("./lib/definition.js");
const { validateData } = require("./lib/validate.js");
const { createStore, copyStore } = require("./lib/store.js");
const { buildSite } = require("./build-site.js");
const { youtubeIdFromInput, statedYears, yearFromText, parseDurationLabel, extractDuration } = require("./lib/youtube.js");

const root = repoRoot();

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const definition = loadDefinition(path.join(root, "collection.json"));
const items = JSON.parse(fs.readFileSync(path.join(root, "data", "items.json"), "utf8"));
const entities = JSON.parse(fs.readFileSync(path.join(root, "data", "entities.json"), "utf8"));
const clean = validateData(definition, items, entities);
if (clean.errors.length || clean.warnings.length) {
  console.error(clean.errors.concat(clean.warnings).join("\n"));
  throw new Error("example collection failed validation");
}

assert(items.length >= 4 && items.length <= 12, "example stays small");
for (const id of ["QkrIZBLZEXw", "1X2rW5ATdLQ", "n45PDizCRLw", "42G13XK4Wck", "c5l7DlGTUcQ", "OT_KFCidz_s"]) {
  assert(items.some((item) => item.id === id), id);
}
assert(items.filter((item) => item.type === "lesson").length === 4, "lessons");
assert(items.filter((item) => item.type === "interview").length === 2, "interviews");
assert(items.find((item) => item.id === "OT_KFCidz_s").year === 2025, "year stated in the title");
assert(items.filter((item) => item.year === 0).length === 5, "unknown years stay 0");
assert(definition.example === true, "example flag");

const duplicate = clone(items);
duplicate.push(clone(duplicate[0]));
assert(validateData(definition, duplicate, entities).errors.some((error) => error.includes("duplicate id")), "duplicate id");

const missingTitle = clone(items);
delete missingTitle[0].title;
assert(validateData(definition, missingTitle, entities).errors.some((error) => error.includes("title")), "missing title");

const badId = clone(items);
badId[0].id = "nope";
assert(validateData(definition, badId, entities).errors.some((error) => error.includes("11-character")), "bad id");

const badDuration = clone(items);
badDuration[0].durationSeconds = 0;
assert(validateData(definition, badDuration, entities).errors.some((error) => error.includes("durationSeconds")), "bad duration");

const badYear = clone(items);
badYear[0].year = -1;
assert(validateData(definition, badYear, entities).errors.some((error) => error.includes("year")), "bad year");

const badType = clone(items);
badType[0].type = "podcast";
assert(validateData(definition, badType, entities).errors.some((error) => error.includes("not a type")), "unknown type");

const unknownField = [Object.assign(clone(items[0]), { mood: "calm" })];
assert(validateData(definition, unknownField, entities).errors.some((error) => error.includes("unknown field")), "unknown field");

const repeatedPerson = [Object.assign(clone(items[0]), { people: ["Justin Sandercoe", "Justin Sandercoe"] })];
assert(validateData(definition, repeatedPerson, entities).errors.some((error) => error.includes("more than once")), "repeated person");

const interview = clone(items.find((item) => item.id === "c5l7DlGTUcQ"));
interview.credits = [{ name: "Hidden Guest", role: "interviewer" }, { name: "Paul Davids", role: "interviewer" }];
assert(validateData(definition, [interview], entities).errors.some((error) => error.includes("Hidden Guest")), "credit must be linked");

const badRole = clone(interview);
badRole.credits = [{ name: "Paul Davids", role: "Host" }];
badRole.people = ["Paul Davids"];
assert(validateData(definition, [badRole], entities).errors.some((error) => error.includes("role")), "role shape");

const badEntity = clone(entities);
badEntity.person["Paul Davids"] = { instruments: ["guitar!"] };
assert(validateData(definition, items, badEntity).errors.length === 0, "punctuation in an instrument name is still a string");
badEntity.person["Paul Davids"] = { horns: ["guitar"] };
assert(validateData(definition, items, badEntity).errors.some((error) => error.includes("unknown attribute")), "unknown attribute");

const sameTitle = [clone(items[0]), Object.assign(clone(items[1]), { title: items[0].title })];
const titleResult = validateData(definition, sameTitle, entities);
assert(titleResult.errors.length === 0, "duplicate titles are not a hard error by default");
assert(titleResult.warnings.some((warning) => warning.includes("duplicate normalized title")), "duplicate title warning");
assert(validateData(definition, [], { person: {} }).errors.length === 0, "empty collection");

const broken = clone(definition);
broken.fields = broken.fields.filter((field) => field.role !== "duration");
assert(validateDefinition(broken).some((error) => error.includes("duration")), "definition needs a duration");
const recency = clone(definition);
recency.research.recency = [{ type: "podcast", maxAgeYears: 3 }];
assert(validateDefinition(recency).some((error) => error.includes("podcast")), "recency type must exist");
const goodRecency = clone(definition);
goodRecency.types.push({ id: "podcast", label: "Podcast", plural: "Podcasts" });
goodRecency.research.recency = [{ type: "podcast", maxAgeYears: 3 }];
assert(validateDefinition(goodRecency).length === 0, "recency rule for a real type");

assert(Catalog.formatDuration(0) === "0:00:00");
assert(Catalog.formatDuration(513) === "0:08:33");
assert(Catalog.formatDuration(4399) === "1:13:19");
assert(Catalog.formatDuration(6703) === "1:51:43");
assert(Catalog.formatLong(90000).includes("h"), "long durations");
assert(Catalog.decadeOf(0) === "Unknown");
assert(Catalog.decadeOf(2025) === "2020s");
assert(Catalog.pageCount(0, 12) === 1);
assert(Catalog.pageCount(12, 12) === 1);
assert(Catalog.pageCount(13, 12) === 2);

const index = Catalog.buildIndex(items, entities, definition);
assert(index.decades[0] === "2020s" && index.decades.at(-1) === "Unknown", "decade order");
assert(index.fieldValues.topic.includes("Beginner") && index.fieldValues.topic.includes("Jazz"));
assert(index.attributeFilters[0].values.includes("guitar") && index.attributeFilters[0].values.includes("keyboards"));
assert(!index.crossNames.person.includes("Julian Lage"), "one-video people are not cross links");
assert(index.crossNames.person.includes("Justin Sandercoe") && index.crossNames.person.includes("Paul Davids"));

const allFilters = { query: "", type: "All", fields: {}, attributes: {} };
function filters(extra) {
  return Object.assign({ query: "", type: "All", fields: {}, attributes: {} }, extra);
}

const paul = items.filter((item) => Catalog.matches(item, filters({ fields: { people: "Paul Davids" } }), index));
assert(paul.some((item) => item.type === "lesson") && paul.some((item) => item.type === "interview"), "entity filter keeps every type");
const paulGroups = Catalog.groupItems(Catalog.sortItems(paul, "title", index), "person", "title", index, filters({ fields: { people: "Paul Davids" } }));
const paulGroup = paulGroups.find((group) => group.key === "Paul Davids");
assert(paulGroup && paulGroup.items.some((item) => item.type === "lesson") && paulGroup.items.some((item) => item.type === "interview"), "person page mixes types");

const lessonsOnly = items.filter((item) => Catalog.matches(item, filters({ type: "lesson", fields: { people: "Paul Davids" } }), index));
const lessonGroups = Catalog.groupItems(Catalog.sortItems(lessonsOnly, "title", index), "person", "title", index, filters({ type: "lesson", fields: { people: "Paul Davids" } }));
const paulLessons = lessonGroups.find((group) => group.key === "Paul Davids");
assert(paulLessons && paulLessons.items.every((item) => item.type === "lesson") && !paulLessons.items.some((item) => item.type === "interview"), "type filter hides interviews");

const personGroups = Catalog.groupItems(Catalog.sortItems(items, "title", index), "person", "title", index, allFilters);
assert(!personGroups.some((group) => group.key === "Julian Lage"), "singletons hidden");
assert(!personGroups.some((group) => group.key === "David Gilmour"));
const lageRows = Catalog.sortItems(items.filter((item) => Catalog.matches(item, filters({ query: "lage" }), index)), "title", index);
const lageGroups = Catalog.groupItems(lageRows, "person", "title", index, filters({ query: "lage" }));
assert(lageGroups.some((group) => group.key === "Julian Lage"), "search reveals one-video people");

const keyboards = items.filter((item) => Catalog.matches(item, filters({ attributes: { "person.instruments": "keyboards" } }), index));
assert(keyboards.length === 1 && keyboards[0].id === "OT_KFCidz_s", "attribute filter");
const guitar = items.filter((item) => Catalog.matches(item, filters({ attributes: { "person.instruments": "guitar" } }), index));
assert(guitar.length === items.length, "guitar reaches every sample video");

const unknown = items.filter((item) => Catalog.matches(item, filters({ fields: { year: "Unknown" } }), index));
assert(unknown.length === 5 && unknown.every((item) => item.year === 0));
const twenties = items.filter((item) => Catalog.matches(item, filters({ fields: { year: "2020s" } }), index));
assert(twenties.length === 1 && twenties[0].year === 2025);

const byTime = Catalog.sortItems(items, "duration", index);
assert(byTime[0].durationSeconds === 6703 && byTime.at(-1).durationSeconds === 287, "duration sort");
const byYear = Catalog.sortItems(items, "year", index);
assert(byYear[0].year === 2025 && byYear.at(-1).year === 0, "unknown years sort last");
const byTitle = Catalog.sortItems(items, "title", index);
for (let i = 1; i < byTitle.length; i += 1) {
  assert(byTitle[i - 1].title.localeCompare(byTitle[i].title, undefined, { sensitivity: "base" }) <= 0, "title sort");
}

assert(items.some((item) => Catalog.matches(item, filters({ query: "beato" }), index) && item.id === "OT_KFCidz_s"), "search linked names");
assert(items.filter((item) => Catalog.matches(item, filters({ query: "interview" }), index)).every((item) => item.type === "interview"), "search type label");
const accented = Object.assign(clone(items[0]), { id: "eeeeeeeeeee", title: "José González study", people: ["José González"] });
const accentIndex = Catalog.buildIndex([accented], { person: { "José González": { instruments: ["guitar"] } } }, definition);
assert(Catalog.matches(accented, filters({ query: "jose gonzalez" }), accentIndex), "accent-insensitive search");

const dChord = items.find((item) => item.id === "QkrIZBLZEXw");
const related = Catalog.related(dChord, items, index, 5);
assert(related.length >= 2 && related.every((entry) => entry.shared.includes("Justin Sandercoe")), "related shares a person");
const appearances = Catalog.appearances("paul", items, index);
assert(appearances.some((person) => person.name === "Paul Davids" && person.acts.includes("Practice") && person.acts.includes("Jazz")), "appearances");

const csv = Catalog.toCsv(items, definition);
assert(csv.charCodeAt(0) === 0xfeff, "csv bom");
assert(csv.includes("youtube_url,id,type,title,year,topic,people,durationSeconds"));
assert(csv.includes("https://www.youtube.com/watch?v=c5l7DlGTUcQ"));
assert(csv.includes("Julian Lage; Paul Davids"));
assert(csv.includes("Julian Lage (interviewee); Paul Davids (interviewer)"));
const injected = Catalog.toCsv([Object.assign(clone(items[0]), { title: "=1+1" })], definition);
assert(injected.includes("'=1+1"), "csv formula guard");
assert(Catalog.csvFilename(definition) === "example-music-lessons.csv");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "yt-searcher-"));
const sqlite = createStore(definition, { root: temp, adapter: "sqlite", file: path.join(temp, "collection.sqlite") });
const json = createStore(definition, { root: temp, adapter: "json", itemsFile: path.join(temp, "items.json"), entitiesFile: path.join(temp, "entities.json") });
copyStore({ readItems: () => items, readEntities: () => entities }, sqlite, { replace: true, idField: "id" });
sqlite.upsertItem(Object.assign(clone(items[0]), { title: "Updated title" }));
assert(sqlite.readItems().find((item) => item.id === items[0].id).title === "Updated title", "sqlite upsert");
assert(sqlite.deleteItem("does-not-exist") === false, "sqlite delete miss");
assert(sqlite.deleteItem(items[0].id) === true, "sqlite delete");
assert(!sqlite.readItems().some((item) => item.id === items[0].id));
sqlite.upsertItem(clone(items[0]));
assert(sqlite.listEntities("person").includes("Rick Beato"), "sqlite list entities");
copyStore(sqlite, json, { replace: true, idField: "id" });
assert(json.readItems().length === items.length, "json copy");
assert(json.listEntities().person.includes("Julian Lage"), "json list entities");
json.upsertEntity("person", "New Teacher", { instruments: ["voice"] });
assert(json.listEntities("person").includes("New Teacher"));
assert(json.deleteEntity("person", "New Teacher") === true);
sqlite.close();
json.close();

const checkpointDir = path.join(temp, "research");
function checkpoint(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "research-checkpoint.js"), ...args, "--dir", checkpointDir], { encoding: "utf8" });
}
assert(checkpoint(["init", "--batch", "sample batch"]).status === 0, "checkpoint init");
assert(checkpoint(["init"]).stdout.includes("Resuming"), "checkpoint resume");
assert(checkpoint(["add", "--id", "QkrIZBLZEXw", "--title", "D chord", "--type", "lesson"]).status === 0);
assert(checkpoint(["add", "--id", "QkrIZBLZEXw"]).stdout.includes("already recorded"));
assert(checkpoint(["skip", "--id", "abcdefghijk", "--reason", "reaction video"]).status === 0);
assert(checkpoint(["skip", "--id", "zzzzzzzzzzz"]).status !== 0, "skip needs a reason");
assert(checkpoint(["seen", "--id", "abcdefghijk"]).status === 0);
assert(checkpoint(["seen", "--id", "bbbbbbbbbbb"]).status === 1, "unseen id");
const status = checkpoint(["status"]);
assert(status.status === 0 && status.stdout.includes('"added": 1') && status.stdout.includes('"skipped": 1'));
const log = fs.readFileSync(path.join(checkpointDir, "checkpoint.jsonl"), "utf8").trim().split("\n");
assert(log.length === 2 && JSON.parse(log[1]).reason === "reaction video", "append-only jsonl");

assert(youtubeIdFromInput("QkrIZBLZEXw") === "QkrIZBLZEXw");
assert(youtubeIdFromInput("https://www.youtube.com/watch?v=QkrIZBLZEXw&t=12") === "QkrIZBLZEXw");
assert(youtubeIdFromInput("https://youtu.be/1X2rW5ATdLQ") === "1X2rW5ATdLQ");
assert(youtubeIdFromInput("https://www.youtube.com/shorts/n45PDizCRLw") === "n45PDizCRLw");
assert(youtubeIdFromInput("not a video") === "");
assert(statedYears("David Gilmour: The Studio Interview 2025", "filmed earlier").join(",") === "2025");
assert(yearFromText("How to Play the D Chord on Guitar", "No year is stated here.") === 0);
assert(yearFromText("Talk", "Recorded in 1986 and again in 1991.") === 0, "several stated years do not collapse to one");
assert(parseDurationLabel("8 minutes, 33 seconds") === 513);
assert(parseDurationLabel("1 hour, 13 minutes, 19 seconds") === 4399);
const fixture = '"videoId":"QkrIZBLZEXw","label":"How to Play the D Chord on Guitar 8 minutes, 33 seconds"';
assert(extractDuration(fixture, { id: "QkrIZBLZEXw", title: "How to Play the D Chord on Guitar" }) === 513, "duration from the watch page");

for (const file of ["index.html", "css/styles.css", "js/app.js", "js/catalog.js"]) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (/(?:href|src|url\()\s*["']?\//.test(text)) throw new Error(file + " has a root-absolute path");
}
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
for (const ref of ["css/styles.css", "js/catalog.js", "js/app.js", "favicon.svg"]) assert(html.includes(ref), "missing " + ref);
assert(app.includes('fetch("collection.json")') && app.includes('fetch("data/items.json")') && app.includes('fetch("data/entities.json")'), "data paths");
assert(html.includes("Download CSV"), "csv button");
assert(app.includes("Catalog.toCsv"), "csv uses the shared exporter");

const workflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
for (const name of ["actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages", "scripts/validate-data.js", "scripts/check-catalog.js", "scripts/build-site.js", "workflow_dispatch", "needs: check", "needs: build", "node-version: 22"]) {
  assert(workflow.includes(name), name);
}
const deployJob = workflow.split(/\n {2}deploy:\n/)[1] || "";
assert(deployJob.length > 0, "deploy job");
assert(!deployJob.includes("actions/upload-pages-artifact"), "deploy job only deploys");
assert(deployJob.includes("pages: write") && deployJob.includes("id-token: write"), "deploy permissions");

const built = buildSite({ root, outDir: path.join(temp, "site") });
assert(built.items === items.length, "build count");
const builtCsv = fs.readFileSync(path.join(temp, "site", "data", "collection.csv"), "utf8");
assert(builtCsv.includes("https://www.youtube.com/watch?v=QkrIZBLZEXw"), "published csv");
assert(fs.existsSync(path.join(temp, "site", "data", "items.json")), "published items");
assert(fs.existsSync(path.join(temp, "site", "data", "entities.json")), "published entities");
assert(fs.existsSync(path.join(temp, "site", "collection.json")), "published definition");
assert(JSON.parse(fs.readFileSync(path.join(temp, "site", "data", "items.json"), "utf8")).length === items.length);

const started = process.hrtime.bigint();
const synthetic = [];
for (let i = 0; i < 400; i += 1) {
  synthetic.push({
    id: "a" + String(i).padStart(10, "0"),
    type: i % 2 ? "lesson" : "interview",
    title: "Item " + i,
    year: i % 7 === 0 ? 0 : 1980 + (i % 40),
    topic: ["Beginner", "Jazz", "Rock", "Rhythm"][i % 4],
    people: [i % 5 === 0 ? "Paul Davids" : "Player " + (i % 30)],
    durationSeconds: 60 + i,
  });
}
const syntheticIndex = Catalog.buildIndex(synthetic, entities, definition);
for (let pass = 0; pass < 40; pass += 1) {
  const filtered = Catalog.sortItems(synthetic.filter((item) => Catalog.matches(item, filters({
    query: pass % 2 ? "paul" : "item",
    type: pass % 3 ? "All" : "lesson",
    fields: { topic: pass % 4 ? "All" : "Jazz" },
    attributes: {},
  }), syntheticIndex)), "title", syntheticIndex);
  Catalog.groupItems(filtered, "person", "duration", syntheticIndex, filters({ query: "paul" }));
}
const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
assert(elapsed < 1500, "filter pass took " + elapsed.toFixed(0) + "ms");

console.log("OK: catalog checks passed (" + items.length + " example videos, " + index.fieldValues.topic.length + " topics, filter pass " + elapsed.toFixed(0) + "ms)");
