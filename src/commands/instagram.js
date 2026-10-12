// src/commands/instagram.js
// Real downloads go through yt-dlp (API-less, works for public IG reels/posts).
// The official Meta Graph API scaffold (services/instagram.js) is kept for
// whatever legitimate official-API use you add later — see .igstatus.
const downloaders = require("../services/downloaders");
const { runDownload, readFile, videoMime } = require("../utils/downloadUx");
const { panel } = require("../utils/ui");

module.exports = {
  name: "instagram",
  scope: "BOTH",
  description: "Download an Instagram reel/post video. Usage: .instagram <link>",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const query = args.join(" ").trim();
    if (!query) return sock.sendMessage(chat, { text: panel("📸 INSTAGRAM DOWNLOAD", ["Usage: .instagram <Instagram link>"]) });

    const detected = downloaders.detectPlatform(query);
    if (!detected || detected.platform !== "instagram") {
      return sock.sendMessage(chat, { text: panel("📸 INSTAGRAM DOWNLOAD", ["❌ That doesn't look like an Instagram link."]) });
    }
    await runDownload(sock, m, {
      title: "📸 INSTAGRAM DOWNLOAD",
      intro: ["📥 Fetching media...", "🎬 Processing video..."],
      fetch: () => downloaders.downloadVideoFromUrl(detected.url),
      message: (r) => ({ video: readFile(r.filePath), caption: `📸 ${r.title}`, ...(r.format && r.format !== "mp4" ? { mimetype: videoMime(r.format) } : {}) }),
      failText: "Couldn't download that Instagram post (it may be private)."
    });
  }
};
