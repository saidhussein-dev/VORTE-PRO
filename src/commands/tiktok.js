// src/commands/tiktok.js
// Real downloads go through yt-dlp (API-less, works for public TikTok videos).
// The official TikTok OAuth scaffold (services/tiktok.js) is kept for whatever
// legitimate official-API use you add later — see .tiktokstatus.
const downloaders = require("../services/downloaders");
const { runDownload, readFile, videoMime } = require("../utils/downloadUx");
const { panel } = require("../utils/ui");

module.exports = {
  name: "tiktok",
  scope: "BOTH",
  description: "Download a TikTok video in the best quality, without the watermark. Usage: .tiktok <link>",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const query = args.join(" ").trim();
    if (!query) return sock.sendMessage(chat, { text: panel("🎵 TIKTOK DOWNLOAD", ["Usage: .tiktok <TikTok link>"]) });

    const detected = downloaders.detectPlatform(query);
    if (!detected || detected.platform !== "tiktok") {
      return sock.sendMessage(chat, { text: panel("🎵 TIKTOK DOWNLOAD", ["❌ That doesn't look like a TikTok link."]) });
    }
    await runDownload(sock, m, {
      title: "🎵 TIKTOK DOWNLOAD",
      intro: ["📥 Fetching media...", "🎬 Processing video..."],
      fetch: () => downloaders.downloadVideoFromUrl(detected.url, { platform: "tiktok" }), // highest quality, no watermark
      message: (r) => ({ video: readFile(r.filePath), caption: `🎵 ${r.title}${r.height ? ` • ${r.height}p` : ""}${r.formatId === "download" ? "\n⚠️ TikTok only offered the watermarked copy of this video." : ""}`, ...(r.format && r.format !== "mp4" ? { mimetype: videoMime(r.format) } : {}) }),
      failText: "Couldn't download that TikTok."
    });
  }
};
