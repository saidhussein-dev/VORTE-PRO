// src/commands/tagadmins.js
const identity = require("../utils/identity");
const { panel } = require("../utils/ui");

module.exports = {
  name: "tagadmins",
  scope: "GROUP",
  admin: true,
  description: "Mention all admins in the group with an optional message (Admin/Owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const meta = await identity.getMetadata(sock, chat);
    const admins = (meta.participants || []).filter((p) => p.admin);
    if (!admins.length) return sock.sendMessage(chat, { text: panel("👥 GROUP MANAGEMENT", ["ℹ️ No admins found in this group."]) });
    const message = args.join(" ").trim() || "📢 Attention admins!";
    const tags = admins.map((a) => `@${a.id.split("@")[0].split(":")[0]}`).join(" ");
    await sock.sendMessage(chat, { text: `${message}\n\n${tags}`, mentions: admins.map((a) => a.id) });
  }
};
