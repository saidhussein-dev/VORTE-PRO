// src/commands/open.js — everyone can send messages.
const groupOps = require("../utils/groupOps");
const identity = require("../utils/identity");
const { panel, status } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "open",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Open the group so all members can send messages",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const before = await identity.getMetadata(sock, chat, { force: true }).catch(() => null);
    if (before && !before.announce) return sock.sendMessage(chat, { text: panel(TITLE, ["ℹ️ The group is already open (everyone can send messages)."]) });
    const s = await status(sock, chat, panel(TITLE, ["⚙️ Updating group settings..."]));
    const r = await groupOps.setAnnounce(sock, chat, false);
    await s.finish(panel(TITLE, [r.ok ? "✅ Group opened. All members can send messages." : `❌ I couldn't open the group: ${r.reason}.`]));
  }
};
