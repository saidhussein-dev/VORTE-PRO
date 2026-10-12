// src/commands/tomp3.js — reply to a video / audio / voice note with .tomp3
const { mediaOf, download, size } = require("../utils/quoted");
const { ffmpegConvert } = require("../utils/convertMedia");
const { panel } = require("../utils/ui");

const MAX = 50 * 1024 * 1024;

module.exports = {
  name: "tomp3",
  scope: "BOTH",
  description: "Turn a video, audio or voice note into an MP3. Usage: reply to it with .tomp3",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const reply = (lines) => sock.sendMessage(chat, { text: panel("🎧 TO MP3", lines) });
    const media = mediaOf(m, ["video", "audio"]);
    if (!media) return reply(["Reply to a video, audio or voice note with .tomp3."]);
    if (media.viewOnce) return reply(["❌ View-once media can't be converted."]);
    if (Number(media.node.fileLength) > MAX) return reply([`❌ That file is too large (max ${size(MAX)}).`]);
    let buf;
    try { buf = await download(sock, media.source); } catch { return reply(["❌ I couldn't download that media (it may have expired)."]); }
    try {
      const mp3 = await ffmpegConvert(buf, { inExt: media.kind === "video" ? "mp4" : "audio", outExt: "mp3", args: ["-vn", "-codec:a", "libmp3lame", "-q:a", "4"] });
      await sock.sendMessage(chat, { audio: mp3, mimetype: "audio/mpeg", fileName: "audio.mp3" }, { quoted: m });
    } catch (e) {
      return reply([e.code === "NO_FFMPEG" ? "❌ This needs ffmpeg, which isn't available on this host (send .dltest to check)." : `❌ I couldn't convert that: ${e.message}`]);
    }
  }
};
