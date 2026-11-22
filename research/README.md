# Research checkpoints

A research batch writes two files in this directory so a stopped run can continue:

- `progress.json` is the current batch: status, queries, seen ids, added ids, and skips.
- `checkpoint.jsonl` is append-only. One JSON object per line. Never rewrite earlier lines.

Both paths are gitignored. The catalog data you add is what gets committed. The checkpoint is local working state.

`progress.example.json` shows the shape. Create a real one with:

```bash
node scripts/research-checkpoint.js init --batch "beginner chord lessons"
node scripts/research-checkpoint.js status
node scripts/research-checkpoint.js seen --id VIDEO_ID
node scripts/research-checkpoint.js add --id VIDEO_ID --title "Title" --type lesson
node scripts/research-checkpoint.js skip --id VIDEO_ID --reason "reaction video"
node scripts/research-checkpoint.js finish
```

`init` resumes when `progress.json` already exists. `seen` exits 0 when that id is already in the batch and exits 1 when it is not, so a script can skip it. `add` and `skip` refuse a second entry for the same id.

Write the item into storage first, then `add`. If the process dies between the two, the next run upserts the same id again and then records the checkpoint. That is safer than recording the checkpoint first and never storing the video.

Each JSONL line looks like:

```json
{"ts":"2026-11-22T21:00:00.000Z","action":"add","id":"QkrIZBLZEXw","title":"How to Play the D Chord on Guitar","type":"lesson","reason":""}
{"ts":"2026-11-22T21:05:00.000Z","action":"skip","id":"abcdefghijk","title":"","type":"","reason":"reaction video"}
```

Reasons should be specific: `oEmbed HTTP 404`, `fan reupload of QkrIZBLZEXw`, `AI-generated`, `mashup`, `compilation`, `year not stated and podcast recency applies`, `duplicate of the official upload`.

`progress.json` fields:

| Field | Meaning |
| --- | --- |
| `collectionId` | Must match `collection.json` `id`. |
| `batch` | What this run was asked to find. |
| `status` | `in_progress` or `finished`. |
| `queries` | Search queries already issued. |
| `cursor` | Optional place marker inside a channel or playlist. |
| `seenIds` | Every id added or skipped. Resume skips these. |
| `addedIds` | Ids written into the collection during this batch. |
| `skipped` | `{ "id", "reason" }` for exclusions. |
| `notes` | Free text for the PR summary. |

Do not reset these files to reconsider a skip unless the reason was a transient network failure. A content decision stays skipped for the batch.
