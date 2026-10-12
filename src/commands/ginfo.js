// src/commands/ginfo.js
const identity = require("../utils/identity");
const { panel } = require("../utils/ui");

module.exports = {
  name: "ginfo",
  scope: "GROUP",
  description: "Show information about this group",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const md = await identity.getMetadata(sock, chat, { force: true }); // always fresh
    const admins = md.participants.filter((p) => p.admin);
    const created = md.creation ? new Date(md.creation * 1000).toDateString() : "unknown";
    await sock.sendMessage(chat, {
      text: panel(`👥 ${md.subject}`, [
        `📝 Description: ${md.desc || "(none)"}`,
        `👤 Members: ${md.participants.length}`,
        `👮 Admins: ${admins.length}`,
        `📅 Created: ${created}`,
        `🔒 Messages: ${md.announce ? "admins only" : "everyone"}`,
        `⚙️ Edit info: ${md.restrict ? "admins only" : "everyone"}`
      ])
    });
  }
};
