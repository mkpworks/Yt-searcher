# Instructions for a research agent

You add YouTube videos to the collection defined in this repository. The collection is generic. Read `collection.json` and follow that definition. Do not assume the topic is concerts, lessons, or the example shipped here.

The example collection is sample data (`example: true`). If the task is to start a real topic, follow `docs/NEW_COLLECTION.md` first and remove the sample items. Do not modify [live-concert-finder](https://github.com/mkpworks/live-concert-finder). It is the prototype this repo generalizes, and it stays as it is.

## Read before searching

1. `collection.json` — types, fields, entities, research rules, storage, batch size.
2. `SCHEMA.md` — what those keys mean.
3. The current items and entities (JSON files, or the adapter named in `storage`).
4. `research/README.md` — checkpoint files, so an interrupted run resumes.
5. `docs/RESEARCH_PROMPT.md` — the prompt shape, if you were started from one.

## What to include

Prefer uploads that match `research.prefer`. The default is an official channel, a broadcaster, or the original creator.

Reject videos that match `research.avoid`. The default list is AI-generated video, mashups, reactions, clickbait, and compilations. Also reject a fan reupload when an official or broadcaster upload of the same appearance exists. A reaction that plays someone else's lesson, a lyric video, a "top 10" compilation, and a video whose title promises something the upload is not, are out.

If you are unsure, skip it and write down why. A smaller honest batch is better than a padded one.

## Recency

`research.recency` is a list of `{ "type", "maxAgeYears" }`. Apply a rule only when the item's type matches. A podcast rule of `"maxAgeYears": 3` means: keep that type only when a year stated in the title or description is within the last 3 calendar years, counting the current year.

If a recency rule applies and the title and description do not state a year, skip the video. An upload date is not a substitute. Do not guess.

Rules for types that are not in `types` are invalid. Add the type to the definition first, in its own change, if the collection should grow a new category.

## Verify the video

For every candidate:

```bash
node scripts/verify-youtube.js VIDEO_ID
```

Keep the video only when the result has `"ok": true` and `"status": 200`. That call is YouTube's oEmbed endpoint (`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEO_ID&format=json`). Anything other than HTTP 200 is gone: private, deleted, or not a video. Do not keep it.

`durationSeconds` in the result is parsed from the watch page. Store that integer. If it is null, open the watch page and read the length YouTube shows, then store that exact value in seconds. Never invent a duration, never round to a nearby minute, and never copy a duration from a different upload.

`year` is `0` unless the title or description states a year. The script's `statedYears` lists every year it found. If that list has one year, use it. If it has several, use the one that is clearly the year of the lesson, performance, or interview, and otherwise use `0`. Never use the YouTube upload date or "3 years ago" as the year.

Use the title YouTube gives. Do not rewrite it for style.

## Duplicates

- One YouTube id, one item. The validator rejects a second copy.
- Also skip a second upload of the same content: the same lesson, the same interview appearance, the same performance. Titles will not match. Prefer the official, broadcaster, or original-creator upload and skip the others with reason `duplicate of VIDEO_ID`.
- The validator warns on normalized duplicate titles. Treat that warning as something you must explain or fix before the PR.

## Linked entities

Use the entity name that is already in the data when it is the same person or thing. `JustinGuitar` the channel and `Justin Sandercoe` the person are one person if the collection's entity is a person; use the spelling already stored.

Add an entity record only for a name that should have a page or an attribute. Put the same spelling in the item's entity list. If a field such as `interviewer` has an `entity`, that name belongs in the linked list too. Credit roles are lowercase tokens (`interviewer`, `instructor`).

Do not add attributes you are guessing. Leave an attribute off when you do not know it.

## Checkpoint and batch size

`research.batchSize` is the cap on newly added items for this run. Stop when you hit it, even if you have more candidates.

```bash
node scripts/research-checkpoint.js init --batch "short description of this batch"
node scripts/research-checkpoint.js seen --id VIDEO_ID    # exit 0 means skip it
```

Order of work for a keeper:

1. Confirm it is not already in the catalog or the checkpoint.
2. Upsert the item and any new entity records.
3. `node scripts/research-checkpoint.js add --id VIDEO_ID --title "..." --type lesson`

For a rejection, after you have decided:

```bash
node scripts/research-checkpoint.js skip --id VIDEO_ID --reason "reaction video"
```

If there is no id because oEmbed failed, still skip with the id you tried, or with the id parsed from the URL.

On a later run, `init` resumes the same `progress.json`. Do not re-add `seenIds`. Do not delete a skip to retry it unless the reason was a network error.

Details and file shapes are in `research/README.md`.

## Storage

Default storage is `data/items.json` and `data/entities.json`. Edit those, or use the store interface in `scripts/lib/store.js`. If `storage.adapter` is `sqlite`, write through the SQLite adapter and then run `node scripts/storage-convert.js --from sqlite --to json --replace` before the PR so the diff is reviewable. See `docs/STORAGE.md`.

Only fields declared in the definition are allowed. Do not sneak in extra keys.

## Validate

```bash
node scripts/validate-data.js
```

Fix every error. Read every warning. `node scripts/check-catalog.js` is what CI runs; run it when you have changed scripts or the site, not only data.

## Pull request

Open a pull request. Do not merge it.

The description should stand on its own:

- Batch goal, in a sentence.
- Counts added, by type, and the new YouTube ids.
- Entity names added or reused.
- Exclusions, each with a reason (the skip list is the source).
- Warnings you left in place, and why.
- Confirmation that oEmbed returned HTTP 200 and that durations were read, not guessed.

A useful shape:

```
Added 12 videos (9 lessons, 3 interviews).

New ids:
- abcdefghijk — Lesson title (Channel)
- ...

Skipped:
- zzzzzzzzzzz — reaction video
- yyyyyyyyyyy — oEmbed HTTP 404
- xxxxxxxxxxx — duplicate of abcdefghijk (fan reupload)

Reused entity names: Paul Davids, Justin Sandercoe.
Added entity names: none.
Validator: clean.
```

## Do not

- Do not invent videos, titles, durations, years, or lineups.
- Do not add a field the definition does not list.
- Do not turn the example collection into a large dump without being asked. Replace it on purpose using `docs/NEW_COLLECTION.md`, or add to whatever collection is already the real one.
- Do not weaken the validator or the Pages workflow to make a batch pass.
- Do not commit `research/progress.json`, `research/checkpoint.jsonl`, or `data/*.sqlite`.
