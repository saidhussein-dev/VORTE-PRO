// src/commands/getbio.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "getbio",
  scope: "BOTH",
  description: "Get a user's WhatsApp About/bio. Usage: .getbio @user (or reply, or no args for yourself)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    const target = ctx?.mentionedJid?.[0] || ctx?.participant || m.key.participant || m.key.remoteJid;
    const jid = helpers.normalizeJid(target) + "@s.whatsapp.net";
    try {
      const res = await sock.fetchStatus(jid);
      const entry = Array.isArray(res) ? res[0] : res;
      const bio = entry?.status?.status ?? entry?.status;
      if (!bio || typeof bio !== "string") return sock.sendMessage(chat, { text: "ℹ️ No bio found (it may be hidden by their privacy settings)." });
      await sock.sendMessage(chat, { text: `📝 *Bio of @${jid.split("@")[0]}:*\n${bio}`, mentions: [jid] });
    } catch (err) {
      console.error("❌ getbio error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't fetch that bio." });
    }
  }
};
