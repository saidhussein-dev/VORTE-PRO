// src/commands/getprivacy.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "getprivacy",
  scope: "OWNER",
  description: "Show the bot account's WhatsApp privacy settings (owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!(await helpers.senderIsOwner(sock, m))) return sock.sendMessage(chat, { text: "❌ Owner only command." });
    try {
      const p = await sock.fetchPrivacySettings(true);
      const lines = Object.entries(p || {}).map(([k, v]) => `• ${k}: ${v}`);
      await sock.sendMessage(chat, { text: `🔐 *Privacy settings*\n\n${lines.join("\n") || "(none returned)"}` });
    } catch (err) {
      console.error("❌ getprivacy error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't fetch privacy settings right now." });
    }
  }
};
