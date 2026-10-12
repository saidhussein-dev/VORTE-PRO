// src/commands/groupsprivacy.js
// Uses Baileys' real "who can add me to groups" privacy setting.
const helpers = require("../utils/helpers");

module.exports = {
  name: "groupsprivacy",
  scope: "OWNER",
  description: "Set who can add the bot account to groups (owner only). Usage: .groupsprivacy all | contacts | contact_blacklist",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const value = args[0]?.toLowerCase();
    const allowed = ["all", "contacts", "contact_blacklist"];
    if (!allowed.includes(value)) return sock.sendMessage(chat, { text: `Usage: .groupsprivacy ${allowed.join(" | ")}` });
    try {
      await sock.updateGroupsAddPrivacy(value);
      await sock.sendMessage(chat, { text: `✅ Group-add privacy set to: ${value}` });
    } catch (err) {
      console.error("❌ groupsprivacy error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't update that privacy setting." });
    }
  }
};
