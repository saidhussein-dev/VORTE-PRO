// src/services/downloaders/index.js
// Single entry point commands should use for any media download. Handles
// concurrency limiting centrally so no individual command needs to worry
// about the bot being overwhelmed by simultaneous downloads.
const ytdlp = require("./ytdlp");
const urlDetector = require("./urlDetector");
const youtubeApi = require("../youtube"); // existing Data API service — used for search ONLY when configured

const MAX_CONCURRENT = Number(process.env.YTDLP_MAX_CONCURRENT) || 3;
const { ConcurrencyLimiter } = require("../../utils/concurrencyLimiter");
const limiter = new ConcurrencyLimiter(MAX_CONCURRENT);

const BUSY_MESSAGE = "⏳ Too many downloads are already in progress — please try again in a moment.";

async function withLimiter(task) {
  try {
    return await limiter.run(task);
  } catch (err) {
    if (err.code === "TOO_MANY_PENDING") {
      const e = new Error(BUSY_MESSAGE);
      e.isBusy = true;
      throw e;
    }
    throw err;
  }
}

function detectPlatform(input) {
  return urlDetector.detect(input);
}

/**
 * Download a video from a direct URL (YouTube/TikTok/Instagram all handled
 * by the same yt-dlp call — platform-specific extraction is yt-dlp's job).
 * @param {string} url
 */
function downloadVideoFromUrl(url, opts) {
  return withLimiter(() => ytdlp.downloadVideo(url, opts));
}

/**
 * Download audio from a direct URL.
 * @param {string} url
 */
function downloadAudioFromUrl(url, opts) {
  return withLimiter(() => ytdlp.downloadAudio(url, opts));
}

/**
 * Resolve a search query to a canonical URL: uses the YouTube Data API if
 * a key is configured (richer metadata, respects existing setup), falls
 * back to yt-dlp's own API-less ytsearch otherwise — search never requires
 * an API key to function.
 * @param {string} query
 */
async function resolveSearchQuery(query) {
  if (youtubeApi.isAvailable()) {
    try {
      const items = await youtubeApi.searchVideos(query, 1);
      const item = items?.[0];
      const videoId = item?.id?.videoId;
      if (videoId) return { url: `https://www.youtube.com/watch?v=${videoId}`, title: item.snippet?.title };
    } catch (e) {
      console.error("❌ YouTube Data API search failed, falling back to yt-dlp search:", e.message);
    }
  }
  const results = await ytdlp.search(query, 1);
  if (!results.length) throw new Error("No results found.");
  return results[0];
}

/**
 * Search-and-download audio (what .song uses).
 * @param {string} query
 */
async function searchAndDownloadAudio(query, opts) {
  const found = await resolveSearchQuery(query);
  const result = await downloadAudioFromUrl(found.url, opts);
  return { ...result, title: found.title || result.title, sourceUrl: found.url };
}

/**
 * Search-and-download video.
 * @param {string} query
 */
async function searchAndDownloadVideo(query, opts) {
  const found = await resolveSearchQuery(query);
  const result = await downloadVideoFromUrl(found.url, opts);
  return { ...result, title: found.title || result.title, sourceUrl: found.url };
}

module.exports = {
  detectPlatform,
  downloadVideoFromUrl,
  downloadAudioFromUrl,
  searchAndDownloadAudio,
  searchAndDownloadVideo,
  cleanup: ytdlp.cleanup,
  BUSY_MESSAGE
};
