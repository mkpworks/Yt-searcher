"use strict";

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function youtubeIdFromInput(value) {
  const text = String(value || "").trim();
  if (ID_RE.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return ID_RE.test(id) ? id : "";
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const fromQuery = url.searchParams.get("v") || "";
      if (ID_RE.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && ID_RE.test(parts[1] || "")) return parts[1];
    }
  } catch (error) {
    return "";
  }
  return "";
}

function statedYears(title, description) {
  const text = String(title || "") + "\n" + String(description || "");
  const years = new Set();
  for (const match of text.matchAll(/\b(?:19|20)\d{2}\b/g)) years.add(Number(match[0]));
  return [...years].sort((a, b) => a - b);
}

function yearFromText(title, description) {
  const years = statedYears(title, description);
  if (years.length === 1) return years[0];
  return 0;
}

function parseDurationLabel(label) {
  const text = String(label || "");
  const match = text.match(/(?:(\d+)\s+hours?,?\s+)?(\d+)\s+minutes?,?\s+(\d+)\s+seconds?/);
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function decodeJsonString(value) {
  try {
    return JSON.parse('"' + value.replace(/"/g, '\\"') + '"');
  } catch (error) {
    return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

function extractDuration(html, meta) {
  const page = String(html || "");
  const title = meta && meta.title ? meta.title : "";
  const id = meta && meta.id ? meta.id : "";
  const labels = [];
  for (const match of page.matchAll(/"label":"((?:[^"\\]|\\.)*)"/g)) labels.push(decodeJsonString(match[1]));
  if (title) {
    for (const label of labels) {
      if (!label.startsWith(title)) continue;
      const duration = parseDurationLabel(label.slice(title.length));
      if (duration) return duration;
    }
  }
  if (id) {
    const marker = '"videoId":"' + id + '"';
    let from = 0;
    while (from < page.length) {
      const at = page.indexOf(marker, from);
      if (at === -1) break;
      const window = page.slice(at, at + 2500);
      const seconds = window.match(/lengthInSeconds":(\d+)/);
      if (seconds) return Number(seconds[1]);
      const label = window.match(/"label":"((?:[^"\\]|\\.)*)"/);
      if (label) {
        const duration = parseDurationLabel(decodeJsonString(label[1]));
        if (duration) return duration;
      }
      from = at + marker.length;
    }
  }
  const lengthSeconds = page.match(/"lengthSeconds":"(\d+)"/);
  if (lengthSeconds) return Number(lengthSeconds[1]);
  return null;
}

function extractDescription(html) {
  const match = String(html || "").match(/"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"/);
  if (!match) return "";
  return decodeJsonString(match[1]);
}

async function fetchOEmbed(id) {
  const watch = "https://www.youtube.com/watch?v=" + id;
  const endpoint = "https://www.youtube.com/oembed?url=" + encodeURIComponent(watch) + "&format=json";
  const response = await fetch(endpoint, { headers: { "user-agent": "yt-searcher" } });
  if (response.status !== 200) {
    return { ok: false, status: response.status, id, url: watch };
  }
  const body = await response.json();
  return {
    ok: true,
    status: 200,
    id,
    url: watch,
    title: body.title || "",
    author: body.author_name || "",
    authorUrl: body.author_url || "",
  };
}

async function verifyVideo(input) {
  const id = youtubeIdFromInput(input);
  if (!id) return { ok: false, status: 0, error: "not a YouTube id or URL", input: String(input || "") };
  const embed = await fetchOEmbed(id);
  if (!embed.ok) return embed;
  let durationSeconds = null;
  let description = "";
  try {
    const response = await fetch(embed.url, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.9" } });
    if (response.status === 200) {
      const html = await response.text();
      durationSeconds = extractDuration(html, { id, title: embed.title });
      description = extractDescription(html);
    }
  } catch (error) {
    durationSeconds = null;
  }
  const years = statedYears(embed.title, description);
  return {
    ok: true,
    status: 200,
    id,
    url: embed.url,
    title: embed.title,
    author: embed.author,
    authorUrl: embed.authorUrl,
    durationSeconds,
    description,
    statedYears: years,
    year: years.length === 1 ? years[0] : 0,
    durationSource: durationSeconds == null ? "missing" : "watch-page",
  };
}

module.exports = {
  ID_RE,
  youtubeIdFromInput,
  statedYears,
  yearFromText,
  parseDurationLabel,
  extractDuration,
  extractDescription,
  fetchOEmbed,
  verifyVideo,
};
