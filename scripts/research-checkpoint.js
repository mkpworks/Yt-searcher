"use strict";

const fs = require("fs");
const path = require("path");
const { repoRoot, loadDefinition } = require("./lib/definition.js");

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function paths(dir) {
  const root = dir || path.join(repoRoot(), "research");
  return {
    root,
    progress: path.join(root, "progress.json"),
    log: path.join(root, "checkpoint.jsonl"),
  };
}

function blankProgress(definition, batch) {
  return {
    collectionId: definition.id,
    batch: batch || "",
    status: "in_progress",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    queries: [],
    cursor: "",
    seenIds: [],
    addedIds: [],
    skipped: [],
    notes: "",
  };
}

function readProgress(file, definition) {
  if (!fs.existsSync(file)) return null;
  const progress = JSON.parse(fs.readFileSync(file, "utf8"));
  if (progress.collectionId && progress.collectionId !== definition.id) {
    throw new Error("progress file is for " + progress.collectionId + ", not " + definition.id);
  }
  progress.seenIds = progress.seenIds || [];
  progress.addedIds = progress.addedIds || [];
  progress.skipped = progress.skipped || [];
  progress.queries = progress.queries || [];
  return progress;
}

function writeProgress(file, progress) {
  progress.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(progress, null, 2) + "\n");
}

function appendLog(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + "\n");
}

function command() {
  const verb = process.argv[2] || "";
  if (verb.startsWith("--")) return "";
  return verb;
}

function main() {
  const verb = command();
  const definition = loadDefinition(path.join(repoRoot(), "collection.json"));
  const files = paths(arg("--dir"));
  if (!verb || verb === "help") {
    console.log("Usage: node scripts/research-checkpoint.js init|status|seen|add|skip|finish [--dir research] [--id ID] [--title TITLE] [--reason TEXT] [--batch TEXT]");
    process.exit(verb ? 0 : 1);
  }
  if (verb === "init") {
    if (fs.existsSync(files.progress)) {
      const existing = readProgress(files.progress, definition);
      console.log("Resuming " + existing.batch + " (" + existing.addedIds.length + " added, " + existing.skipped.length + " skipped, status " + existing.status + ")");
      return;
    }
    const progress = blankProgress(definition, arg("--batch") || "untitled batch");
    writeProgress(files.progress, progress);
    console.log("Started checkpoint in " + files.root);
    return;
  }
  const progress = readProgress(files.progress, definition);
  if (!progress) {
    console.error("No progress file. Run: node scripts/research-checkpoint.js init --batch \"what this batch covers\"");
    process.exit(1);
  }
  if (verb === "status") {
    console.log(JSON.stringify({
      batch: progress.batch,
      status: progress.status,
      added: progress.addedIds.length,
      skipped: progress.skipped.length,
      seen: progress.seenIds.length,
      batchSize: definition.research && definition.research.batchSize,
      remaining: Math.max(0, ((definition.research && definition.research.batchSize) || 0) - progress.addedIds.length),
    }, null, 2));
    return;
  }
  if (verb === "seen") {
    const id = arg("--id");
    if (!id) {
      console.error("--id is required");
      process.exit(1);
    }
    if (!progress.seenIds.includes(id)) process.exit(1);
    console.log("seen " + id);
    return;
  }
  if (verb === "add" || verb === "skip") {
    const id = arg("--id");
    if (!id) {
      console.error("--id is required");
      process.exit(1);
    }
    if (progress.seenIds.includes(id)) {
      console.log("already recorded " + id);
      return;
    }
    const record = {
      ts: new Date().toISOString(),
      action: verb,
      id,
      title: arg("--title"),
      type: arg("--type"),
      reason: arg("--reason"),
    };
    if (verb === "skip" && !record.reason) {
      console.error("skip needs --reason");
      process.exit(1);
    }
    appendLog(files.log, record);
    progress.seenIds.push(id);
    if (verb === "add") progress.addedIds.push(id);
    else progress.skipped.push({ id, reason: record.reason });
    writeProgress(files.progress, progress);
    const cap = (definition.research && definition.research.batchSize) || 0;
    console.log(verb + " " + id + " (" + progress.addedIds.length + (cap ? "/" + cap : "") + " added)");
    if (verb === "add" && cap && progress.addedIds.length >= cap) {
      console.log("Batch size reached. Validate, summarize, and open a PR before adding more.");
    }
    return;
  }
  if (verb === "finish") {
    progress.status = "finished";
    writeProgress(files.progress, progress);
    console.log("Marked batch finished.");
    return;
  }
  console.error("Unknown command " + verb);
  process.exit(1);
}

module.exports = { blankProgress, paths };

if (require.main === module) main();
