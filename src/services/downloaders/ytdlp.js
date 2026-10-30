// src/services/downloaders/ytdlp.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const runner = require("./ytdlpRunner");
const { ensureFfmpeg } = require("./ffmpegCheck");

const TMP_DIR = path.join(__dirname, "../../../storage/tmp/downloads");

const DEFAULT_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS) || 120000; // 2 min
const DEFAULT_MAX_FILESIZE_MB = Number(process.env.YTDLP_MAX_FILESIZE_MB) || 100;

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Binary resolution/installation lives in ytdlpRunner (no Python, no npm install scripts).
async function ensureBinary() {
  return !!(await runner.ensureBinary());
}

/** Every download works in its own "<base>.*" family of files, so cleanup can never touch anyone else's. */
function newBase() {
  ensureTmpDir();
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}
const familyOf = (base) => { try { return fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(base + ".")).map((f) => path.join(TMP_DIR, f)); } catch { return []; } };
const isPartial = (f) => /\.(part|ytdl|temp|tmp)(\.|$)|\.f[\w-]+\.\w+$|-Frag\d+$/i.test(path.basename(f));
function removeFamily(base, keep) {
  for (const f of familyOf(base)) if (f !== keep) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
}

/** The one-line JSON yt-dlp prints once the final file is in place. */
function parsePrinted(stdout) {
  const lines = String(stdout || "").trim().split("\n").reverse();
  for (const l of lines) { try { const j = JSON.parse(l); if (j && typeof j === "object") return j; } catch { /* next */ } }
  return null;
}

/** What to do about YouTube's bot check, based on how THIS host is set up (so the message says the thing that is actually wrong). */
function botCheckMessage() {
  const h = runner.health();
  const parts = ["YouTube is blocking this server (bot check)."];
  if (!h.nodeOk) parts.push(`This bot runs on Node ${h.node} but yt-dlp needs Node 22+ for YouTube — raise the host's Node version.`);
  if (!h.cookies) parts.push("No cookies are set: export YouTube cookies (from a private window) to cookies.json next to index.js.");
  else if (h.cookies.error) parts.push("The cookies file could not be read.");
  else if (!h.cookies.login) parts.push("The cookies file has no login cookie — export it again while logged in.");
  else parts.push("The cookies are probably expired or flagged — export fresh ones from a private window (log in, open youtube.com/robots.txt, export, close the window).");
  return parts.join(" ");
}

/** Convert a raw yt-dlp/execa failure into a short, honest, user-facing reason. */
function classifyError(err) {
  const msg = String(err?.stderr || err?.message || err || "").toLowerCase();
  if (err?.code === "NEEDS_FFMPEG") return err.message;
  if (err?.timedOut) return "Download timed out.";
  if (/no supported javascript runtime|javascript runtime could not be found|js runtime/.test(msg)) return `yt-dlp has no JavaScript runtime to use for YouTube. It needs Node ${22}+ (this bot runs ${process.version}).`;
  if (msg.includes("confirm you're not a bot") || msg.includes("confirm you\u2019re not a bot") || msg.includes("sign in to confirm")) return botCheckMessage();
  if (/n challenge|nsig|signature solving|challenge solving|player js/.test(msg)) return "yt-dlp couldn't solve YouTube's current challenge. It updates itself daily — try again later, or send .dltest update.";
  if (msg.includes("instagram") && (msg.includes("login required") || msg.includes("rate-limit") || msg.includes("empty media response") || msg.includes("not available"))) return "Instagram needs a login for this post. Add instagram.com cookies (see .env.example), or try a public post.";
  if (msg.includes("tiktok") && (msg.includes("ip address is blocked") || msg.includes("unable to extract") || msg.includes("not available"))) return "TikTok didn't give this server the video (it may be blocking the host's IP, or the video is private/removed).";
  if (msg.includes("http error 429") || msg.includes("too many requests")) return "The source is rate-limiting this server. Try again later.";
  if (msg.includes("http error 403") || msg.includes("forbidden")) return "The source refused this server's request (HTTP 403).";
  if (msg.includes("ffmpeg") && (msg.includes("not found") || msg.includes("not installed") || msg.includes("ffprobe"))) return "This download needs ffmpeg, which isn't available on the host.";
  if (msg.includes("requested format is not available")) return "No downloadable format was found for that link. Send .dltest <link> to see what the source offers.";
  if (msg.includes("private video") || msg.includes("login required") || msg.includes("log in") || msg.includes("login")) return "This content is private or requires login.";
  if (msg.includes("video unavailable") || msg.includes("this video is not available")) return "Video unavailable.";
  if (msg.includes("unsupported url") || msg.includes("no extractor")) return "Unsupported URL.";
  if (msg.includes("file is larger than max-filesize") || msg.includes("max-filesize")) return "File is too large.";
  if (msg.includes("unable to download") || msg.includes("network") || msg.includes("timed out")) return "Network error reaching the source.";
  if (msg.includes("this video has been removed") || msg.includes("deleted")) return "This content was deleted.";
  return "Could not extract media.";
}

const formatNotAvailable = (err) => /requested format is not available/i.test(String(err?.stderr || err?.message || ""));

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<object>} the metadata only (skipDownload) — used for search/info
 */
const getInfo = (url, opts) => withUpdateRetry(() => getInfoOnce(url, opts));
async function getInfoOnce(url, opts = {}) {
  if (!(await ensureBinary())) throw new Error("yt-dlp is not available on this host.");
  try {
    return await runner.json(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      skipDownload: true
    }, { timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS });
  } catch (err) {
    const e = new Error(classifyError(err));
    e.cause = err;
    throw e;
  }
}

/**
 * yt-dlp's own pseudo-URL search (ytsearchN:query) — works with zero API
 * keys, used as the fallback when no YouTube Data API key is configured.
 * @param {string} query
 * @param {number} [limit]
 */
const search = (query, limit) => withUpdateRetry(() => searchOnce(query, limit));
async function searchOnce(query, limit = 5) {
  if (!(await ensureBinary())) throw new Error("yt-dlp is not available on this host.");
  try {
    const result = await runner.json(`ytsearch${limit}:${query}`, {
      dumpSingleJson: true,
      noWarnings: true,
      flatPlaylist: true,
      skipDownload: true
    }, { timeout: DEFAULT_TIMEOUT_MS });
    const entries = result?.entries || (Array.isArray(result) ? result : [result]).filter(Boolean);
    return entries.map(e => ({
      title: e.title,
      url: e.webpage_url || e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null),
      duration: e.duration,
      channel: e.channel || e.uploader
    })).filter(e => e.url);
  } catch (err) {
    const e = new Error(classifyError(err));
    e.cause = err;
    throw e;
  }
}

const isYouTube = (url) => /(^|\/\/|\.)(youtu\.be|youtube\.com|music\.youtube\.com)\b|^ytsearch/i.test(String(url));
const botCheck = (err) => /sign in to confirm|not a bot/i.test(String(err?.stderr || err?.message || ""));

/**
 * YouTube serves different "clients" (web, TV, mobile...) and applies its bot check to each differently, so a video that is
 * refused for one often works for another. These are tried in order, ONLY after the previous one was refused.
 * YTDLP_YT_CLIENTS="player_client=a,b;player_client=c" overrides the list; YTDLP_EXTRACTOR_ARGS pins one choice and disables this.
 */
function clientVariants(url, env = process.env) {
  if (!isYouTube(url) || env.YTDLP_EXTRACTOR_ARGS) return [{}];
  const list = env.YTDLP_YT_CLIENTS
    ? String(env.YTDLP_YT_CLIENTS).split(";").map((s) => s.trim()).filter(Boolean)
    : ["", "player_client=tv,web_safari", "player_client=android_vr", "player_client=mweb"];
  return list.map((a) => (a ? { extractorArgs: `youtube:${a}` } : {}));
}

/** Worth trying another YouTube client for? (the bot check and "no format" are client-specific; a private video is not) */
const clientRetryable = (err) => botCheck(err) || formatNotAvailable(err) || /unable to extract|only images are available|http error 403/i.test(String(err?.stderr || err?.message || ""));

/**
 * Try each attempt (a set of yt-dlp flags) in turn. "Requested format is not available" moves on to the next format set;
 * for YouTube, a bot check / no-format after all of them moves on to the next client. Any other failure (private, timeout...)
 * is final and reported as it is.
 */
async function runAttempts(url, common, attempts, base, deadline) {
  const variants = clientVariants(url);
  let last;
  for (let v = 0; v < variants.length; v++) {
    let nextClient = false;
    for (let i = 0; i < attempts.length; i++) {
      const left = deadline - Date.now();
      if (left < 3000) break;
      try {
        return await runner.exec(url, { ...common, ...variants[v], ...attempts[i] }, { timeout: left });
      } catch (err) {
        last = err;
        removeFamily(base);                       // partial files of the failed attempt
        if (formatNotAvailable(err) && i < attempts.length - 1) continue;      // next format set, same client
        if (v < variants.length - 1 && clientRetryable(err)) { nextClient = true; break; } // next client
        throw err;
      }
    }
    if (!nextClient) break;
  }
  throw last || Object.assign(new Error("timed out"), { timedOut: true });
}

/** yt-dlp breaks whenever a site changes; the cure is almost always a newer yt-dlp. On such a failure, update (at most every 30 min) and try once more. */
const healable = (err) => botCheck(err) || /unable to extract|n challenge|nsig|signature|only images are available|requested format is not available|http error 403|no supported javascript runtime/i.test(String(err?.stderr || err?.message || ""));
async function withUpdateRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const cause = err?.cause || err;
    if (!healable(cause) && !healable(err)) throw err;
    const r = await runner.updateNow({ minAgeMs: 30 * 60 * 1000 });
    if (!r.updated) throw err;
    return fn();
  }
}

/** Turn what yt-dlp printed / left on disk into the result object. */
function collect(base, stdout, fallbackTitle) {
  const printed = parsePrinted(stdout);
  let file = printed?.filepath && fs.existsSync(printed.filepath) ? printed.filepath : null;
  if (!file) {
    const done = familyOf(base).filter((f) => !isPartial(f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
    file = done[0] || null;
  }
  if (!file) throw new Error("yt-dlp reported success but no output file was found.");
  removeFamily(base, file);
  return {
    filePath: file, title: printed?.title || fallbackTitle, sizeBytes: fs.statSync(file).size,
    format: path.extname(file).slice(1).toLowerCase() || printed?.ext || "",
    formatId: printed?.format_id || "", height: Number(printed?.height) || 0
  };
}

const NEEDS_FFMPEG_MSG = "This source serves picture and sound as separate streams, and joining them needs ffmpeg — which couldn't be set up on this host.";

/**
 * Download a video.
 *  - ffmpeg available: best picture + best sound joined into one mp4 (works for YouTube / Instagram / TikTok
 *    sources that deliver them separately), preferring H.264/AAC so WhatsApp can play it.
 *  - no ffmpeg: a stream that already has both; if the source only has separate streams, say so clearly.
 * @param {string} url
 * @param {{ maxHeight?: number, timeoutMs?: number, maxFilesizeMB?: number }} [opts]
 * @returns {Promise<{ filePath: string, title: string, sizeBytes: number, format: string }>}
 */
const downloadVideo = (url, opts) => withUpdateRetry(() => downloadVideoOnce(url, opts));
async function downloadVideoOnce(url, opts = {}) {
  if (!(await ensureBinary())) throw new Error("yt-dlp is not available on this host.");
  // TikTok (opts.platform === "tiktok"): the best resolution the source has (no 480p cap) and NEVER the format TikTok
  // labels "download", which is the one with the watermark burned in. If the source offers nothing else, the last
  // attempt takes what exists and the result carries formatId "download" so the command can say so honestly.
  const tiktok = opts.platform === "tiktok";
  const maxHeight = opts.maxHeight || (tiktok ? 4320 : 480); // 480: WhatsApp-friendly default for everything else
  const ff = await ensureFfmpeg();
  const base = newBase();
  const h = tiktok ? "" : `[height<=?${maxHeight}]`; // "<=?" keeps formats whose height is unknown (TikTok/Instagram often report none)
  const clean = tiktok ? "[format_id!=download]" : "";
  const common = {
    output: path.join(TMP_DIR, `${base}.%(ext)s`),
    formatSort: tiktok ? "res,vcodec:h264,acodec:aac" : `res:${maxHeight},vcodec:h264,acodec:aac`,
    print: "after_move:%(.{title,ext,filepath,format_id,height})j",
    noQuiet: true,       // --print silences yt-dlp; we want its messages (e.g. "file larger than max-filesize")
    noProgress: true,
    noWarnings: true,
    noPlaylist: true,
    maxFilesize: `${opts.maxFilesizeMB || DEFAULT_MAX_FILESIZE_MB}M`
  };
  const attempts = tiktok
    ? (ff
      ? [{ format: `bv*${clean}+ba/b${clean}`, mergeOutputFormat: "mp4" }, { format: "b", mergeOutputFormat: "mp4" }]
      : [{ format: `b${clean}[ext=mp4]/b${clean}` }, { format: "b" }])
    : (ff
      ? [{ format: `bv*${h}+ba/b${h}/bv*+ba/b`, mergeOutputFormat: "mp4" }, { format: "b", mergeOutputFormat: "mp4" }]
      : [{ format: `b${h}[ext=mp4]/b${h}/b` }]);

  try {
    const stdout = await runAttempts(url, common, attempts, base, Date.now() + (opts.timeoutMs || DEFAULT_TIMEOUT_MS));
    return collect(base, stdout, "video");
  } catch (err) {
    removeFamily(base);
    if (err.message?.startsWith("yt-dlp reported") || err.message?.startsWith("yt-dlp is not")) throw err;
    const e = new Error(!ff && formatNotAvailable(err) ? NEEDS_FFMPEG_MSG : classifyError(err));
    if (!ff && formatNotAvailable(err)) e.code = "NEEDS_FFMPEG";
    e.cause = err;
    throw e;
  }
}

/**
 * Download audio only.
 *  - ffmpeg available: converted to mp3.
 *  - no ffmpeg: the best audio stream as it is (m4a preferred — WhatsApp plays it) — NO conversion step,
 *    which is what needs ffmpeg. (It used to always ask for conversion and so always failed without ffmpeg.)
 * @param {string} url
 * @param {{ timeoutMs?: number, maxFilesizeMB?: number }} [opts]
 * @returns {Promise<{ filePath: string, title: string, sizeBytes: number, format: string }>}
 */
const downloadAudio = (url, opts) => withUpdateRetry(() => downloadAudioOnce(url, opts));
async function downloadAudioOnce(url, opts = {}) {
  if (!(await ensureBinary())) throw new Error("yt-dlp is not available on this host.");
  const ff = await ensureFfmpeg();
  const base = newBase();
  const common = {
    output: path.join(TMP_DIR, `${base}.%(ext)s`),
    print: "after_move:%(.{title,ext,filepath})j",
    noQuiet: true,       // --print silences yt-dlp; we want its messages (e.g. "file larger than max-filesize")
    noProgress: true,
    noWarnings: true,
    noPlaylist: true,
    maxFilesize: `${opts.maxFilesizeMB || DEFAULT_MAX_FILESIZE_MB}M`
  };
  const attempts = ff
    ? [{ format: "ba/b", extractAudio: true, audioFormat: "mp3", audioQuality: "5" }]
    : [{ format: "ba[ext=m4a]/ba[acodec^=mp4a]/ba/b" }];

  try {
    const stdout = await runAttempts(url, common, attempts, base, Date.now() + (opts.timeoutMs || DEFAULT_TIMEOUT_MS));
    return collect(base, stdout, "audio");
  } catch (err) {
    removeFamily(base);
    if (err.message?.startsWith("yt-dlp reported") || err.message?.startsWith("yt-dlp is not")) throw err;
    const e = new Error(classifyError(err));
    e.cause = err;
    throw e;
  }
}

function cleanup(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error("❌ temp file cleanup failed:", e.message);
  }
}

module.exports = { ensureBinary, getInfo, search, downloadVideo, downloadAudio, cleanup, classifyError, clientVariants, TMP_DIR };
