# Yt-searcher

A static catalog of YouTube videos. The topic is not built into the page. `collection.json` names the types, the fields, which of those fields can be searched or filtered, and which linked entities (people, or anything else) tie videos together. The same definition drives validation, CSV export, and the site.

[Live Concert Finder](https://github.com/mkpworks/live-concert-finder) is the single-purpose prototype this generalizes: a vanilla JS site, JSON data, a catalog module, and a GitHub Pages workflow. That project stays as it is. This repo is the reusable form. Point it at a new topic by replacing the collection definition, then let a research agent add videos.

The copy checked in here is a small example, six real guitar lessons and interviews, so the site builds. It is marked as sample data. Swap it out before collecting a real topic. See [docs/NEW_COLLECTION.md](docs/NEW_COLLECTION.md).

## Preview locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000/>. The page loads JSON with `fetch`, so opening `index.html` from disk will not work.

Search covers the fields marked searchable, including linked people and their instruments. Filters and sort options come from the definition. Type buttons limit the list. A person page shows every type together until a type filter is on. Durations are the real video lengths. Download CSV saves whatever the current filters match.

To preview the built site, including the full CSV next to the JSON:

```bash
node scripts/build-site.js
python3 -m http.server 8000 --directory _site
```

## Example collection

`collection.json` is `example-music-lessons`. Types are `lesson` and `interview`. People are the linked entity, with instruments as an attribute. The videos are official uploads from JustinGuitar, Paul Davids, and Rick Beato. Years are `0` unless the title or description states one. The 2025 Gilmour interview is the one item with a stated year.

## Create a collection

[docs/NEW_COLLECTION.md](docs/NEW_COLLECTION.md) is the short path: edit `collection.json`, empty `data/items.json` and `data/entities.json`, validate, then research.

[SCHEMA.md](SCHEMA.md) explains every key. [schema/collection.schema.json](schema/collection.schema.json) is the JSON Schema for the definition file.

A collection always has a YouTube id, a type, a title, and a duration in seconds. Other fields are whatever the topic needs. This is the shape of one example item:

```json
{
  "id": "QkrIZBLZEXw",
  "type": "lesson",
  "title": "How to Play the D Chord on Guitar",
  "year": 0,
  "topic": "Beginner",
  "people": ["Justin Sandercoe"],
  "durationSeconds": 513,
  "notes": "Official JustinGuitar upload. The title and description do not state a year."
}
```

`data/entities.json` maps a canonical name to its attributes:

```json
{
  "person": {
    "Justin Sandercoe": { "instruments": ["guitar"] }
  }
}
```

## Check the data

Requires Node.js 22.5 or newer (the SQLite adapter uses built-in `node:sqlite`).

```bash
node scripts/validate-data.js
node scripts/check-catalog.js
```

Validation checks required fields, field types, 11-character YouTube ids, unique ids, and duplicates. A repeated normalized title is a warning unless the definition says it is an error. The Pages workflow runs both commands before it builds.

## Storage

JSON files are the default. SQLite is included as a second adapter. `node scripts/storage-convert.js` copies one to the other. The site build reads the active adapter and writes JSON for the browser.

[docs/STORAGE.md](docs/STORAGE.md) documents the adapter methods and how to add Google Sheets, Airtable, or Supabase.

```bash
node scripts/storage-convert.js --from json --to sqlite
node scripts/storage-convert.js --from sqlite --to json --replace
```

## CSV export

`node scripts/export-csv.js` writes `data/collection.csv`. One row per video. The first column is the YouTube URL. Then every field in the definition, in order. Lists are joined with `; `. Credits look like `Julian Lage (interviewee); Paul Davids (interviewer)`.

The Download CSV button on the site builds that same file in the browser from the videos that match the current filters. If nothing is filtered, it is the full list currently loaded.

The Pages build writes the full CSV to `_site/data/collection.csv`, beside `items.json` and `entities.json`.

## Research

[AGENTS.md](AGENTS.md) is the procedure for an agent adding videos: read the definition, prefer official and original uploads, reject AI-generated videos, mashups, reactions, clickbait, and compilations, honor recency rules, verify each id with YouTube oEmbed, store real durations, take years only from the title or description, dedupe, normalize entity names, checkpoint, validate, and open a pull request.

[docs/RESEARCH_PROMPT.md](docs/RESEARCH_PROMPT.md) is the prompt to paste at the start of a batch.

```bash
node scripts/verify-youtube.js VIDEO_ID
node scripts/research-checkpoint.js init --batch "what this batch covers"
```

## Deploy

Pushes to `main` run `.github/workflows/pages.yml`. The check job validates the data. The build job, which `needs: check`, assembles `_site` and uploads the Pages artifact. The deploy job, which `needs: build`, publishes that artifact. Upload and deploy stay in separate jobs. Pull requests run check and build and do not deploy. They also skip `actions/configure-pages`, which fails until Pages is turned on, so a pull request can go green before that setting exists. `workflow_dispatch` is enabled.

The repository owner sets **Settings → Pages → Build and deployment → Source** to **GitHub Actions** before the first deploy.

The published example, once that setting is on, is <https://mkpworks.github.io/Yt-searcher/>.

## Layout

| Path | Role |
| --- | --- |
| `collection.json` | The collection definition. |
| `schema/collection.schema.json` | JSON Schema for that file. |
| `data/items.json` | Videos, when storage is JSON. |
| `data/entities.json` | Linked entities. |
| `js/catalog.js` | Search, filter, sort, grouping, and CSV. Shared by the page and the tests. |
| `js/app.js` | The page. |
| `scripts/validate-data.js` | Definition-driven validator. |
| `scripts/check-catalog.js` | Behavior checks CI runs. |
| `scripts/build-site.js` | Writes `_site`, including JSON and CSV. |
| `scripts/export-csv.js` | Writes a CSV from the active adapter. |
| `scripts/storage-convert.js` | Copies JSON ↔ SQLite. |
| `scripts/verify-youtube.js` | oEmbed check, duration, stated years. |
| `scripts/research-checkpoint.js` | Append-only batch journal. |
| `AGENTS.md` | Research procedure. |

Fraunces and Outfit are self-hosted in `fonts/` under the SIL Open Font License.
