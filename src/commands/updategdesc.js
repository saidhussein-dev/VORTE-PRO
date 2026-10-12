// src/commands/updategdesc.js
const groupOps = require("../utils/groupOps");
const { panel, status } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "updategdesc",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Change the group description (admin only). Usage: .updategdesc <text>",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const desc = args.join(" ").trim();
    if (!desc) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .updategdesc <new description>"]) });
    if (desc.length > 2048) return sock.sendMessage(chat, { text: panel(TITLE, ["❌ Description too long (max 2048 characters)."]) });
    const s = await status(sock, chat, panel(TITLE, ["⚙️ Updating group settings..."]));
    const r = await groupOps.setDescription(sock, chat, desc);
    await s.finish(panel(TITLE, [r.ok ? "✅ Group description updated." : `❌ I couldn't change the description: ${r.reason}.`]));
  }
};
