// src/commands/tiktokstatus.js
// The original .tiktok command, before it was repurposed for real downloads
// via yt-dlp — kept so the official-API OAuth check is still reachable.
const tiktok = require("../services/tiktok");
const providers = require("../services/providers");

module.exports = {
  name: "tiktokstatus",
  scope: "BOTH",
  description: "Check the official TikTok API OAuth credentials (separate from .tiktok, which downloads videos)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    if (!providers.isTikTokAvailable()) {
      return sock.sendMessage(chat, { text: providers.UNAVAILABLE_MESSAGE + "\n(Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.)" });
    }
    const token = await tiktok.getAccessToken();
    if (!token) return sock.sendMessage(chat, { text: "❌ Couldn't authenticate with TikTok's official API right now." });
    await sock.sendMessage(chat, { text: "✅ TikTok official API credentials are configured and working.\n\nNote: video downloads use .tiktok, which goes through yt-dlp — the official API has no video-download capability." });
  }
};
