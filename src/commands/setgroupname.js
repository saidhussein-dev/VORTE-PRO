// src/commands/setgroupname.js
const groupOps = require("../utils/groupOps");
const { panel, status } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";
const MAX_LEN = 100; // WhatsApp's group subject limit

module.exports = {
  name: "setgroupname",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Change the group name. Usage: .setgroupname <new name>",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const name = args.join(" ").trim();
    if (!name) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .setgroupname <new name>"]) });
    if (name.length > MAX_LEN) return sock.sendMessage(chat, { text: panel(TITLE, [`❌ That name is too long (max ${MAX_LEN} characters).`]) });
    const s = await status(sock, chat, panel(TITLE, ["⚙️ Updating group settings..."]));
    const r = await groupOps.setSubject(sock, chat, name);
    await s.finish(panel(TITLE, [r.ok ? `✅ Group name updated to: ${name}` : `❌ I couldn't change the group name: ${r.reason}.`]));
  }
};
