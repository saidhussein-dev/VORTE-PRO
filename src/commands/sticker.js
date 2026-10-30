// src/commands/sticker.js
// WhatsApp only accepts a sticker as a 512x512 WebP. The old version sent the original photo/video bytes as the
// "sticker", which WhatsApp shows as an invalid sticker. The media is now converted with ffmpeg first.
const { ffmpegConvert } = require("../utils/convertMedia");
const { addPackInfo } = require("../utils/stickerMeta");

const SIZE = 512;
// Fit inside 512x512 and pad the rest with transparency, so nothing is stretched or cropped.
const FIT = `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,format=rgba,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
const MAX_ANIMATED_BYTES = 500 * 1024; // WhatsApp's practical limit for animated stickers
const ANIMATED_QUALITY_STEPS = [60, 40, 25];
const MAX_SECONDS = 8;

const stillArgs = () => ["-vf", FIT, "-c:v", "libwebp", "-lossless", "0", "-quality", "75", "-compression_level", "6", "-frames:v", "1", "-an"];
const animatedArgs = (q) => ["-t", String(MAX_SECONDS), "-vf", `fps=15,${FIT}`, "-c:v", "libwebp", "-lossless", "0", "-quality", String(q), "-compression_level", "6", "-loop", "0", "-an", "-vsync", "0"];

const isWebp = (b) => Buffer.isBuffer(b) && b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

const deps = {
  convert: ffmpegConvert,
  async download(media, type) {
    const { downloadContentFromMessage } = require("baileys");
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
};

/** Turn a downloaded image or video into a valid WhatsApp sticker (512x512 WebP). */
async function toStickerWebp(buffer, kind, mimetype = "") {
  if (kind === "image") {
    const inExt = /png/i.test(mimetype) ? "png" : /webp/i.test(mimetype) ? "webp" : /gif/i.test(mimetype) ? "gif" : "jpg";
    const out = await deps.convert(buffer, { inExt, outExt: "webp", args: stillArgs() });
    if (!isWebp(out)) throw new Error("conversion did not produce a WebP");
    return out;
  }
  let out;
  for (const q of ANIMATED_QUALITY_STEPS) {
    out = await deps.convert(buffer, { inExt: "mp4", outExt: "webp", args: animatedArgs(q) });
    if (!isWebp(out)) throw new Error("conversion did not produce a WebP");
    if (out.length <= MAX_ANIMATED_BYTES) break;
  }
  return out;
}

module.exports = {
  name: "sticker",
  scope: "BOTH",
  description: "Convert an image or video to a sticker",
  _deps: deps,
  toStickerWebp,
  async execute(sock, m) {
    const chat = m.key.remoteJid;

    try {
      let mediaMsg = m;
      if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        mediaMsg = {
          key: { ...m.key, id: m.message.extendedTextMessage.contextInfo.stanzaId },
          message: m.message.extendedTextMessage.contextInfo.quotedMessage
        };
      }

      const media = mediaMsg.message?.imageMessage || mediaMsg.message?.videoMessage;
      if (!media) return sock.sendMessage(chat, { text: "📸 Reply to an image/video or send one with caption .sticker" });

      if (Number(media.fileLength || 0) > 25 * 1024 * 1024) return sock.sendMessage(chat, { text: "❌ That media is too large (max 25MB)." });

      const type = mediaMsg.message?.imageMessage ? "image" : "video";
      const buffer = await deps.download(media, type);
      if (!buffer?.length) return sock.sendMessage(chat, { text: "❌ I couldn't download that media. Send it again." });

      let sticker = await toStickerWebp(buffer, type, media.mimetype);
      // Write "VORTE PRO" into the sticker as its pack name / author, like other sticker makers do.
      try { sticker = await addPackInfo(sticker); } catch (e) { console.error("sticker pack info could not be added:", e.message); }
      await sock.sendMessage(chat, { sticker }); // stickers never carry the channel button
    } catch (err) {
      console.error(err);
      await sock.sendMessage(chat, { text: err.code === "NO_FFMPEG" ? "❌ Stickers need ffmpeg, which isn't available on this host (send .dltest to check)." : "❌ Failed to create sticker." });
    }
  },
};
