// src/commands/setbio.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "setbio",
  scope: "OWNER",
  description: "Update the bot profile bio (Owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isOwner(sender)) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const newBio = args.join(" ");
    if (!newBio) return sock.sendMessage(chat, { text: "Usage: .setbio <text>" });

    try {
      await sock.updateProfileStatus(newBio);
      await sock.sendMessage(chat, { text: `✅ Bio updated to: ${newBio}` });
    } catch (e) {
      console.error(e);
      await sock.sendMessage(chat, { text: "❌ Failed to update bio." });
    }
  },
};
