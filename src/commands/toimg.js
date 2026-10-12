// src/commands/toimg.js — reply to a (still) sticker with .toimg
const { mediaOf, download } = require("../utils/quoted");
const { ffmpegConvert } = require("../utils/convertMedia");
const { panel } = require("../utils/ui");

module.exports = {
  name: "toimg",
  scope: "BOTH",
  description: "Turn a sticker into an image. Usage: reply to a sticker with .toimg",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const reply = (lines) => sock.sendMessage(chat, { text: panel("🖼️ TO IMAGE", lines) });
    const media = mediaOf(m, ["sticker"]);
    if (!media) return reply(["Reply to a sticker with .toimg."]);
    if (media.node.isAnimated) return reply(["❌ That sticker is animated — .toimg only converts still stickers."]);
    let buf;
    try { buf = await download(sock, media.source); } catch { return reply(["❌ I couldn't download that sticker."]); }
    try {
      const png = await ffmpegConvert(buf, { inExt: "webp", outExt: "png", args: ["-frames:v", "1"] });
      await sock.sendMessage(chat, { image: png, caption: "🖼️ Sticker as an image" }, { quoted: m });
    } catch (e) {
      return reply([e.code === "NO_FFMPEG" ? "❌ This needs ffmpeg, which isn't available on this host (send .dltest to check)." : "❌ I couldn't convert that sticker (animated or unusual format)."]);
    }
  }
};
