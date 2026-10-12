// src/commands/join.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "join",
  scope: "OWNER",
  description: "Make the bot join a group via invite link (owner only). Usage: .join https://chat.whatsapp.com/XXXX",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    // Owner-only on purpose: otherwise anyone could push the bot into arbitrary groups.
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const match = (args[0] || "").match(/chat\.whatsapp\.com\/([A-Za-z0-9]{10,32})/);
    if (!match) return sock.sendMessage(chat, { text: "Usage: .join https://chat.whatsapp.com/<code>" });
    try {
      await sock.groupAcceptInvite(match[1]);
      await sock.sendMessage(chat, { text: "✅ Joined the group." });
    } catch (err) {
      console.error("❌ join error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't join — the link may be invalid, expired, or the group requires approval." });
    }
  }
};
