# Start a new collection

The example in this repo is a handful of real guitar lessons and interviews so the site builds. It is marked `example: true`. Replace it before researching a real topic. You do not need a new repository for each topic unless you want a separate GitHub Pages site.

## 1. Write the definition

Edit `collection.json`, or copy `schema/collection.schema.json` into an editor that understands JSON Schema and write a new file over it.

Set:

- `id`, `title`, and `description` for the topic.
- `example` to `false`, and clear `site.sampleBanner`.
- `types` for the categories you will actually collect. A music-lesson shelf might use `lesson`, `interview`, and `podcast`.
- `fields`. Keep the four required roles (`id`, `type`, `title`, `duration`). Add `year` if the topic has dates. Add an `entityList` for the people or channels that should tie videos together.
- `entities` for those linked records and any attributes worth filtering (instrument, language, city).
- `views` so a person page can show every type at once. Use `hideSingletons` when a long list of one-off names would bury the people who recur.
- `sorts`, `search.placeholder`, and `research`.

For a podcast type that should stay current, add the type and a recency rule together:

```json
"recency": [{ "type": "podcast", "maxAgeYears": 3 }]
```

A recency rule whose type is not in `types` fails validation on purpose.

`SCHEMA.md` lists every key. The example `collection.json` is a working illustration, not a limit on the fields you can add.

## 2. Reset the data

Replace `data/items.json` with `[]`.

Replace `data/entities.json` with an empty table for each entity, or with `{}`:

```json
{ "person": {} }
```

If you had switched the example to SQLite, point `storage.adapter` back to `json` or start from an empty database file. Do not leave the sample videos in a real collection.

## 3. Check that it loads

```bash
node scripts/validate-data.js
node scripts/build-site.js
python3 -m http.server 8000 --directory _site
```

An empty collection should validate and show an empty site with your title, types, and filters.

## 4. Research into it

Use `docs/RESEARCH_PROMPT.md` to start an agent. The agent follows `AGENTS.md`: read this definition, verify videos, checkpoint, validate, and open a pull request.

## 5. Publish

The repository owner sets **Settings → Pages → Build and deployment → Source** to **GitHub Actions** once. Pushes to `main` run `.github/workflows/pages.yml`. Pull requests run the checks and the site build, and they do not deploy.

Update `site.canonical` and `site.repository` if this collection lives in a different repo or under a different Pages URL.
