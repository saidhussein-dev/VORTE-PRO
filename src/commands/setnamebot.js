// src/commands/setnamebot.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "setnamebot",
  scope: "OWNER",
  description: "Change the bot profile name (Owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!(await helpers.senderIsOwner(sock, m))) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const newName = args.join(" ");
    if (!newName) return sock.sendMessage(chat, { text: "Usage: .setnamebot <new name>" });

    try {
      await sock.updateProfileName(newName);
      await sock.sendMessage(chat, { text: `✅ Bot name changed to: ${newName}` });
    } catch (e) {
      console.error(e);
      await sock.sendMessage(chat, { text: "❌ Failed to change name." });
    }
  },
};
