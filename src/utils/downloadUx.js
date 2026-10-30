// src/utils/downloadUx.js
// One edited status message for every download command (instead of a reaction plus
// separate result/error messages):  🔎 Searching → 📤 Sending → ✅ Ready!
const fs = require("fs");
const downloaders = require("../services/downloaders");
const { panel, status } = require("./ui");

const SEND_MAX_BYTES = (Number(process.env.YTDLP_SEND_MAX_MB) || 100) * 1024 * 1024;
const mb = (n) => (n / 1024 / 1024).toFixed(1);

/**
 * @param {object} o
 * @param {string} o.title     e.g. "🎵 AUDIO DOWNLOAD"
 * @param {string[]} o.intro   first status lines, e.g. ['🔎 Searching for:', '"song"']
 * @param {() => Promise<{filePath:string,title:string,sizeBytes:number,format?:string}>} o.fetch
 * @param {(result) => object} o.message   builds the WhatsApp content to send for the file
 * @param {string} o.failText  fallback error text
 */
async function runDownload(sock, m, o) {
  const chat = m.key.remoteJid;
  const s = await status(sock, chat, panel(o.title, o.intro), { quoted: m, buttonOnFinish: false }); // the sent file carries the channel button
  let result;
  try {
    result = await o.fetch();
    if (result.sizeBytes > SEND_MAX_BYTES) {
      await s.fail(panel(o.title, [`❌ "${result.title}" is too large to send over WhatsApp (${mb(result.sizeBytes)}MB, limit ${mb(SEND_MAX_BYTES)}MB).`]));
      return;
    }
    await s.update(panel(o.title, [`🎞️ ${result.title}`, "📤 Sending..."]));
    await sock.sendMessage(chat, o.message(result), { quoted: m });
    await s.finish(panel(o.title, [`🎞️ ${result.title}`, "✅ Ready!"]));
  } catch (err) {
    console.error(`❌ ${o.title}:`, err.message);
    await s.fail(panel(o.title, [err.isBusy ? err.message : `❌ ${err.message || o.failText}`]));
  } finally {
    if (result?.filePath) downloaders.cleanup(result.filePath);
  }
}

// Streamed from disk by Baileys (not loaded into memory): { url: <local path> } — several big downloads can no longer exhaust RAM.
const readFile = (p) => ({ url: p });

/** WhatsApp wants the right mimetype for the file it is really getting. */
const AUDIO_MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg; codecs=opus", opus: "audio/ogg; codecs=opus", webm: "audio/webm", wav: "audio/wav" };
const VIDEO_MIME = { mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime", "3gp": "video/3gpp" };
const audioMime = (ext) => AUDIO_MIME[String(ext || "").toLowerCase()] || "audio/mpeg";
const videoMime = (ext) => VIDEO_MIME[String(ext || "").toLowerCase()] || "video/mp4";

module.exports = { runDownload, readFile, audioMime, videoMime, SEND_MAX_BYTES };
