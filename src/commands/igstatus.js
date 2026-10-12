// src/commands/igstatus.js
// The original .instagram command, before it was repurposed for real
// downloads via yt-dlp — kept so the official Graph API check is still reachable.
const instagram = require("../services/instagram");
const providers = require("../services/providers");

module.exports = {
  name: "igstatus",
  scope: "BOTH",
  description: "Check the official Instagram Graph API credentials (separate from .ig, which downloads reels/posts)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    if (!providers.isInstagramAvailable()) {
      return sock.sendMessage(chat, { text: providers.UNAVAILABLE_MESSAGE + "\n(Set META_APP_ID, META_APP_SECRET, and INSTAGRAM_ACCESS_TOKEN.)" });
    }
    const media = await instagram.getOwnMedia();
    if (media === null) return sock.sendMessage(chat, { text: "❌ Couldn't reach Instagram's official API right now." });
    await sock.sendMessage(chat, { text: `✅ Instagram official API is configured and working (${media.length} post(s) on the connected account).\n\nNote: downloads use .ig, which goes through yt-dlp — the official API can't fetch arbitrary other users' posts.` });
  }
};
