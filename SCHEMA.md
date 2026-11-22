# Collection schema

A collection is one topic: music lessons, interviews, lectures, or anything else that is a list of YouTube videos. The topic lives in `collection.json`. Items and linked entities live in storage (JSON files by default). The validator, the CSV export, and the website all read the definition. Nothing in the page hardcodes "lesson" or "person".

`schema/collection.schema.json` is the JSON Schema (draft 2020-12) for `collection.json`. `scripts/lib/definition.js` checks the same rules in CI without an extra dependency. `scripts/validate-data.js` then checks the items and entities against that definition.

This is the generic form of the Live Concert Finder catalog (`concerts.json` + `musicians.json` + `Catalog.TYPES`). That project stays as it is. A new topic here is a new definition, not a new fork of the concert site.

## Definition

`collection.json` has:

| Key | Meaning |
| --- | --- |
| `id`, `title`, `description` | Identity and the text at the top of the site. |
| `example` | When true, the site shows `site.sampleBanner`. Turn this off for a real collection. |
| `labels.item` / `labels.items` | Words used in the status line, such as "video" / "videos". |
| `types` | Content categories. Each has `id`, `label`, and `plural`. Ids are lowercase tokens: `lesson`, `interview`, `live-set`. |
| `fields` | Every property an item may have. |
| `entities` | People or other records that link items together and can have their own grouped pages. |
| `views` | Browse modes: by a field, by an entity, by an entity attribute, or a flat list. |
| `sorts` | Sort options. |
| `search.placeholder` | Search box hint. Search covers every field with `searchable: true`, including linked entity names and searchable attributes. |
| `duplicates` | `youtubeId` is `error` or `ignore`. `normalizedTitle` is `error`, `warning`, or `ignore`. |
| `research` | Rules for the research agent. See `AGENTS.md`. |
| `storage` | `json` (default) or `sqlite`. See `docs/STORAGE.md`. |
| `display` | `showTypeBadge`, `showDuration`, `showDiscover`, `showCrossLinks`. |
| `site` | Eyebrow, canonical URL, repository link, `perPage`, theme storage key, sample banner. |

## Required field roles

Every collection needs exactly one field for each of these roles:

| Role | Type | Meaning |
| --- | --- | --- |
| `id` | `youtubeId` | 11-character YouTube id. Unique across the whole collection. |
| `type` | `type` | One of the ids in `types`. |
| `title` | `string` | Title as given by the source. Do not invent one. |
| `duration` | `duration` | Real running time in seconds. A positive integer. Never guessed. |

A `year` role is optional. When you include it, use type `year`. `0` means the year is not stated in the title or description. Never infer it from the upload date. Set `filter` to `decade` to get a decade menu, and `unknown` to `0` with a sort of `unknownLast: true` so unknown years sort last.

## Field types

`string`, `text`, `integer`, `number`, `boolean`, `year`, `duration`, `youtubeId`, `stringList`, `entityList`, `credits`, `enum`, `url`, `type`.

- `entityList` stores names that point at an entity, such as `"people": ["Paul Davids"]`. Set `entity` to that entity's id. Names are matched exactly.
- `credits` is a list of `{ "name", "role" }`. `role` is a lowercase token (`interviewer`, `instructor`). Set `linkField` to the entity list that must also contain each name.
- `enum` stores one of `values`.
- `appliesTo` limits a field to some types. A required field is required only for those types. Omit the field when it does not apply. An optional field that is present must still be valid.
- `filterable` adds a menu built from the values in the data. Nothing hardcodes the list.
- `searchable` includes the value in search. Entity attributes marked `searchable` are included too.
- `display` is `title`, `meta`, `badge`, `byline`, `chips`, `credits`, `duration`, `note`, or `hidden`.
- `swatch: true` on a string field draws a color dot. The site uses that field as the "same group" fallback for related videos.

## Entities

An entity is a map of canonical name to attributes. The example uses `person` with an `instruments` string list. A musician page in the concert finder is this same idea: one grouped view lists every item type for that person unless a type filter is on.

```json
{
  "id": "person",
  "label": "Person",
  "plural": "People",
  "page": true,
  "crossLinkMin": 2,
  "attributes": [
    { "id": "instruments", "label": "Instrument", "type": "stringList", "filterable": true, "searchable": true }
  ]
}
```

Names that appear on at least `crossLinkMin` items become buttons. A view with `hideSingletons: true` hides names that appear once until a search or filter asks for them.

Spell a name the same way on every item and in the entity table. The validator warns when an item names someone who has no entity record, and when two records match aside from case or accents.

## Views

| `source` | Groups by |
| --- | --- |
| `field` | The field's value. A string becomes one group. A list becomes one group per entry. |
| `entity` | Each name in an `entityList` field. This is the entity page. All types stay together. |
| `attribute` | Each value of an attribute on those linked entities. Items whose people have no value are left out. |
| `list` | No groups. One video per row. |

## Item file

`data/items.json` is a JSON array. Only keys declared in `fields` are allowed. `data/entities.json` is an object keyed by entity id, then by canonical name:

```json
{
  "person": {
    "Paul Davids": { "instruments": ["guitar"] }
  }
}
```

The SQLite adapter stores the same records. The website always reads the JSON files the build writes into the site, so a database is a source of truth, not something the browser opens.

## Validation

```bash
node scripts/validate-data.js
node scripts/check-catalog.js
```

Validation checks required fields, types, YouTube id shape, unique ids, list uniqueness, credit links, entity attributes, and duplicate normalized titles (a warning unless `duplicates.normalizedTitle` is `error`). It prints people who are cited but have no entity record. That reminder is a warning, not a failure. The Pages workflow runs the same checks before it builds.
