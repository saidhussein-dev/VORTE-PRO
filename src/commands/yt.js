// src/commands/yt.js
const downloaders = require("../services/downloaders");
const { runDownload, readFile, videoMime } = require("../utils/downloadUx");
const { panel } = require("../utils/ui");

module.exports = {
  name: "yt",
  scope: "BOTH",
  description: "Download a YouTube video, or search by name. Usage: .yt <url or search terms>",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const query = args.join(" ").trim();
    if (!query) return sock.sendMessage(chat, { text: panel("🎬 VIDEO DOWNLOAD", ["Usage: .yt <YouTube URL or search terms>"]) });

    const detected = downloaders.detectPlatform(query);
    if (detected && detected.platform !== "youtube") {
      return sock.sendMessage(chat, { text: panel("🎬 VIDEO DOWNLOAD", [`❌ That's a ${detected.platform} link — use .${detected.platform} for that instead.`]) });
    }
    await runDownload(sock, m, {
      title: "🎬 VIDEO DOWNLOAD",
      intro: detected ? ["📥 Fetching media..."] : ["🔎 Searching for:", `"${query}"`],
      fetch: () => (detected ? downloaders.downloadVideoFromUrl(detected.url) : downloaders.searchAndDownloadVideo(query)),
      message: (r) => ({ video: readFile(r.filePath), caption: `🎬 ${r.title}`, ...(r.format && r.format !== "mp4" ? { mimetype: videoMime(r.format) } : {}) }),
      failText: "Couldn't download that."
    });
  }
};
