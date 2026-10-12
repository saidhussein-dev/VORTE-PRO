// src/commands/blocklist.js
// Shows the bot account's real WhatsApp block list (different from .banlist,
// which is the bot's own "ignore these users" list).
const helpers = require("../utils/helpers");

module.exports = {
  name: "blocklist",
  scope: "OWNER",
  description: "Show the numbers this WhatsApp account has blocked (owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });
    try {
      const list = await sock.fetchBlocklist();
      if (!list || !list.length) return sock.sendMessage(chat, { text: "ℹ️ No blocked contacts." });
      await sock.sendMessage(chat, { text: `🚫 *Blocked on WhatsApp (${list.length}):*\n${list.slice(0, 50).map(j => "+" + helpers.normalizeJid(j)).join("\n")}${list.length > 50 ? "\n…and more" : ""}` });
    } catch (err) {
      console.error("❌ blocklist error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't fetch the block list right now." });
    }
  }
};
