# Storage adapters

Scripts talk to items and entities through one small interface. `collection.json` picks the adapter with `storage.adapter`. The static site does not open the database. `node scripts/build-site.js` reads whichever adapter is active and writes JSON plus a full CSV into `_site/`.

## Interface

An adapter is an object with these methods:

| Method | Behavior |
| --- | --- |
| `readItems()` | Return every item. |
| `upsertItem(item)` | Insert the item, or replace the one with the same YouTube id. |
| `deleteItem(id)` | Delete that id. Return true if a row was removed. |
| `readEntities()` | Return `{ [entityId]: { [name]: record } }`. |
| `upsertEntity(entityId, name, record)` | Insert or replace one entity record. |
| `deleteEntity(entityId, name)` | Delete one record. Return true if it existed. |
| `listEntities(entityId)` | Names for one entity type. With no argument, `{ [entityId]: names }`. |
| `close()` | Release the file or connection. |

`scripts/lib/store.js` builds an adapter from the definition:

```js
const { createStore } = require("./scripts/lib/store.js");
const store = createStore(definition, { root: process.cwd() });
const items = store.readItems();
store.upsertItem(item);
store.close();
```

Register another adapter with `registerAdapter(name, factory)`. The factory receives `(definition, options)` and returns the object above. `options.root` is the repository root. `options.idField` is the YouTube id field name.

## JSON

Default, and the one the example uses. Files:

- `storage.json.items` (default `data/items.json`) is an array.
- `storage.json.entities` (default `data/entities.json`) is the entity map.

Writes are pretty-printed and replaced atomically. Order is preserved: an update replaces the item in place, and a new item is appended. That keeps git diffs small.

## SQLite

`storage.sqlite.file` (default `data/collection.sqlite`) is a SQLite database opened with Node's built-in `node:sqlite`. That module ships with Node.js 22.5 and newer. The Pages workflow pins Node 22. No native addon is installed.

Two tables hold the records as JSON, so changing the collection definition does not need a migration:

```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE entities (
  entity TEXT NOT NULL,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (entity, name)
);
```

`id` is the YouTube id. `payload` is the whole item, including `id` and `type`.

The database file is gitignored. JSON remains the easiest way to review a pull request. Use SQLite when a local tool or a long research run wants updates without rewriting a large JSON file, then export back to JSON before the PR if you want the diff in git.

## Convert

```bash
node scripts/storage-convert.js --from json --to sqlite
node scripts/storage-convert.js --from sqlite --to json --replace
```

`--replace` deletes destination rows before copying. Without it, rows are upserted and extra destination rows are left in place. `--sqlite path` overrides the database file for whichever side is SQLite.

`node scripts/build-site.js` always emits `data/items.json`, `data/entities.json`, `collection.json`, and `data/collection.csv` inside `_site/`, from the active adapter.

## Adding another adapter

Copy the shape of `scripts/lib/json-store.js`. Keep the methods synchronous if you can, matching the two included adapters. Then register the name:

```js
const { registerAdapter } = require("./scripts/lib/store.js");
registerAdapter("sheets", function (definition, options) {
  return createSheetsStore(definition, options);
});
```

Set `"adapter": "sheets"` in `collection.json` and add a `storage.sheets` block for the spreadsheet id and credentials. Read secrets from the environment, not from the definition file.

These three are the usual next stores. None of them is implemented here; the interface is the whole contract.

**Google Sheets.** One worksheet named `items`, one header row of field ids, one row per video. Array cells use `; ` between values, the same join the CSV export uses. A second worksheet, `entities`, has columns `entity`, `name`, and one column per attribute (string lists joined with `; `). `readItems` maps rows back to objects. `upsertItem` finds the YouTube id column and replaces or appends. Use a service account and `GOOGLE_APPLICATION_CREDENTIALS`.

**Airtable.** One table per item list, with a field for each definition field, and one table (or one table per entity type) for entities. Store string lists as multiple-select or as a single line joined with `; `. The Airtable record id is not the YouTube id; keep the YouTube id in its own column and upsert on that.

**Supabase.** Two tables with the same columns as the SQLite adapter (`id`, `type`, `payload` and `entity`, `name`, `payload`) avoid a migration every time a field is added. Use the service-role key only in scripts, from the environment. Enable row level security and do not put the service key in the static site. The browser keeps reading the JSON the build publishes.

After the adapter can read and upsert, `scripts/validate-data.js`, `scripts/export-csv.js`, and `scripts/build-site.js` work without further changes because they only call the interface.
