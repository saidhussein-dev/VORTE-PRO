// src/commands/close.js — only admins can send messages.
const groupOps = require("../utils/groupOps");
const identity = require("../utils/identity");
const { panel, status } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "close",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Close the group so only admins can send messages",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const before = await identity.getMetadata(sock, chat, { force: true }).catch(() => null);
    if (before?.announce) return sock.sendMessage(chat, { text: panel(TITLE, ["ℹ️ The group is already closed (only admins can send messages)."]) });
    const s = await status(sock, chat, panel(TITLE, ["⚙️ Updating group settings..."]));
    const r = await groupOps.setAnnounce(sock, chat, true);
    await s.finish(panel(TITLE, [r.ok ? "✅ Group closed. Only admins can send messages." : `❌ I couldn't close the group: ${r.reason}.`]));
  }
};
