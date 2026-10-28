// src/utils/groupStatus.js
// Post a REAL "group status": a Message wrapped in `groupStatusMessageV2` (WAProto field 103),
// relayed to the group JID. Baileys can unwrap this type when receiving but has no send helper,
// so we build the inner message with its own generateWAMessageContent (upload + thumbnails + text
// styling) and wrap/relay it ourselves.
//
// GROUP_STATUS_FIELD=v1 switches to the older `groupStatusMessage` (field 96) field in case a
// WhatsApp version only renders that one.
//
// Media statuses: Baileys 7.0.0-rc14 fills in a photo/video's thumbnail, size and length only when the optional
// `sharp` / `jimp` packages are installed (this project does not depend on them) and silently skips them when they
// are missing. A status without that metadata is the kind of message WhatsApp may refuse to show, so it is now
// computed here with ffmpeg/ffprobe (already used by the bot) and passed in. Every step is best-effort: if ffmpeg is
// not available the status is sent exactly as before.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const baileys = require("baileys");
const { ensureFfmpeg } = require("../services/downloaders/ffmpegCheck");
const { ffmpegConvert, DIR } = require("./convertMedia");

/** True when the Baileys patch (patches/baileys+*.patch, applied on `npm install`) is present: it adds the `mediatype` attribute group-status media needs. */
function baileysPatched() {
  try {
    const dir = path.dirname(require.resolve("baileys"));
    const file = [path.join(dir, "Socket", "messages-send.js"), path.join(dir, "..", "lib", "Socket", "messages-send.js")].find((f) => fs.existsSync(f));
    return !!file && fs.readFileSync(file, "utf8").includes("vorte-patch");
  } catch { return true; /* cannot tell — do not nag */ }
}
let warned = false;

const FIELD = () => (String(process.env.GROUP_STATUS_FIELD || "").toLowerCase() === "v1" ? "groupStatusMessage" : "groupStatusMessageV2");

const run = (file, args, timeout = 30000) => new Promise((resolve, reject) => execFile(file, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))));

/** { width, height, seconds } of a photo/video buffer via ffprobe, or {} when it cannot be read. */
async function probeMedia(buffer, kind) {
  const ff = await ensureFfmpeg();
  if (!ff) return {};
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `gs-${crypto.randomBytes(6).toString("hex")}.${kind === "video" ? "mp4" : "img"}`);
  try {
    fs.writeFileSync(file, buffer);
    const out = JSON.parse(await run(ff.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]));
    const s = out.streams?.[0] || {};
    const meta = {};
    if (s.width > 0 && s.height > 0) { meta.width = s.width; meta.height = s.height; }
    const dur = Number(out.format?.duration);
    if (kind === "video" && dur > 0) meta.seconds = Math.round(dur);
    return meta;
  } catch { return {}; } finally { try { fs.unlinkSync(file); } catch { /* already gone */ } }
}

/** Small JPEG preview (the "blurred" placeholder WhatsApp shows while the media loads), or undefined. */
async function thumbnailOf(buffer, kind) {
  try {
    const jpg = await ffmpegConvert(buffer, { inExt: kind === "video" ? "mp4" : "jpg", outExt: "jpg", args: ["-frames:v", "1", "-vf", "scale=32:-2", "-q:v", "6"] });
    return jpg?.length ? jpg : undefined;
  } catch { return undefined; }
}

/** Adds jpegThumbnail / width / height / seconds to an image or video content object when they are missing. */
async function withMediaMetadata(content) {
  const kind = Buffer.isBuffer(content.image) ? "image" : Buffer.isBuffer(content.video) ? "video" : null;
  if (!kind) return content;
  const buffer = content[kind];
  const meta = await probeMedia(buffer, kind);
  const thumb = content.jpegThumbnail === undefined ? await thumbnailOf(buffer, kind) : undefined;
  const extra = { ...meta };
  if (thumb) extra.jpegThumbnail = thumb;
  // never override something the caller set on purpose
  for (const k of Object.keys(extra)) if (content[k] !== undefined) delete extra[k];
  return { ...content, ...extra };
}

/**
 * @param {object} sock
 * @param {string} groupJid  must be a group (…@g.us)
 * @param {object} content   { text } | { image, caption } | { video, caption, gifPlayback } | { audio, mimetype, ptt }
 * @param {object} [options] { backgroundColor: "#rrggbb", font: 0-5 }  (Baileys reads these from OPTIONS, not content)
 * @returns {Promise<{messageId:string, field:string}>}
 */
async function sendGroupStatus(sock, groupJid, content, options = {}) {
  if (!groupJid || !groupJid.endsWith("@g.us")) throw new Error("A group status can only be posted in a group.");
  if (!warned && !baileysPatched()) { warned = true; console.warn("⚠️ The Baileys patch is not applied (run `npm install` so patch-package can apply patches/). Group-status photos, videos and voice notes may not show up."); }
  const prepared = await withMediaMetadata(content);
  const inner = await baileys.generateWAMessageContent(prepared, {
    upload: sock.waUploadToServer,
    logger: sock.logger,
    mediaCache: undefined,
    ...options
  });
  // The message secret rides on the wrapper too (WhatsApp clients use it for status interactions such as reactions).
  const messageSecret = inner.messageContextInfo?.messageSecret || crypto.randomBytes(32);
  inner.messageContextInfo = { ...(inner.messageContextInfo || {}), messageSecret };
  const field = FIELD();
  const messageId = baileys.generateMessageIDV2(sock.user?.id);
  await sock.relayMessage(groupJid, { messageContextInfo: { messageSecret }, [field]: { message: inner } }, { messageId });
  return { messageId, field };
}

module.exports = { baileysPatched, sendGroupStatus, FIELD, withMediaMetadata, probeMedia, thumbnailOf };
