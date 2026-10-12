// src/commands/listadmins.js
const identity = require("../utils/identity");
const { panel } = require("../utils/ui");

module.exports = {
  name: "listadmins",
  scope: "GROUP",
  description: "List all admins in the group",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const meta = await identity.getMetadata(sock, chat);
    const admins = (meta.participants || []).filter((p) => p.admin);
    if (!admins.length) return sock.sendMessage(chat, { text: panel("👥 GROUP ADMINS", ["ℹ️ No admins found in this group."]) });
    const list = admins.map((a, i) => `${i + 1}. @${a.id.split("@")[0].split(":")[0]}${a.admin === "superadmin" ? " (creator)" : ""}`);
    await sock.sendMessage(chat, { text: panel(`👮 GROUP ADMINS (${admins.length})`, list), mentions: admins.map((a) => a.id) });
  }
};
