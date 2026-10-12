// src/commands/restart.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "restart",
  scope: "OWNER",
  description: "Restart the bot (Owner only)",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isOwner(sender)) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    await sock.sendMessage(chat, { text: "♻️ Restarting bot..." });

    // Exit the process, PM2 / nodemon will auto-restart
    process.exit(1);
  },
};
