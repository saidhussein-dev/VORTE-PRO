// src/commands/leave.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "leave",
  scope: "GROUP",
  owner: true,
  description: "Make the bot leave the current group (Owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isGroup(chat)) {
      return sock.sendMessage(chat, { text: "❌ This command only works in groups." });
    }

    // Owner-only: group admins must NOT be able to make the bot leave.
    const perms = await helpers.getPermissions(sock, m);
    if (!perms.isOwner) {
      return sock.sendMessage(chat, { text: "❌ Owner only command." });
    }

    await sock.sendMessage(chat, { text: "👋 Goodbye! Leaving this group now." });
    await sock.groupLeave(chat);
  }
};
