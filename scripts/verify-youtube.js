"use strict";

const { verifyVideo, youtubeIdFromInput } = require("./lib/youtube.js");

function inputsFromArgv(argv) {
  const values = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url" || arg === "--id") {
      values.push(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    values.push(arg);
  }
  return values;
}

async function main() {
  const inputs = inputsFromArgv(process.argv);
  if (!inputs.length) {
    console.error("Usage: node scripts/verify-youtube.js VIDEO_ID [VIDEO_ID...]");
    process.exit(1);
  }
  let failed = 0;
  for (const input of inputs) {
    const result = await verifyVideo(input);
    console.log(JSON.stringify(result));
    if (!result.ok || !youtubeIdFromInput(result.id || input)) failed += 1;
    else if (result.durationSeconds == null) {
      console.error("Duration was not on the watch page for " + result.id + ". Do not guess it. Read the length YouTube shows and store that exact value.");
    }
  }
  if (failed) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
