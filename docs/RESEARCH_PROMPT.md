# Research batch prompt

Paste this to an agent that can edit the repo, run Node, and open a pull request. Fill the bracketed lines. The agent still has to follow `AGENTS.md`; this prompt only sets the batch.

```
Research one batch of YouTube videos for this collection.

Read AGENTS.md and follow it. Also read collection.json, SCHEMA.md, and the current items and entities before you search.

Batch: [what to look for, in one or two sentences]
Types to prefer: [lesson, interview, or whichever types this batch should add]
Aim: up to the batchSize in collection.json. Stop there even if you have more candidates.
Scope: [channels, names, or queries to start from]
Out of scope: [anything this batch must not chase]

Verify every candidate with node scripts/verify-youtube.js. Keep a video only when oEmbed returns HTTP 200. Store the real duration. Store a year only when the title or description states one, otherwise 0.

Prefer the sources in research.prefer. Reject the kinds of videos in research.avoid. Apply every research.recency rule whose type you are adding. Skip a video when you cannot show that it is recent enough.

Dedupe by YouTube id and by the same lesson, interview, or performance uploaded more than once. Keep the official, broadcaster, or original-creator upload.

Reuse canonical entity names already in the data. Checkpoint with scripts/research-checkpoint.js so a stopped run can resume. Run node scripts/validate-data.js and fix every error.

Open a pull request. Do not merge. In the summary, list how many items you added by type, the new ids, and each exclusion with the reason.
```
