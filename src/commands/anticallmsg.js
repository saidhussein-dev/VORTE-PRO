// src/commands/anticallmsg.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "anticallmsg",
  scope: "OWNER",
  description: "Set the message sent to callers after anticall rejects their call (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const message = args.join(" ");
    if (!message) return sock.sendMessage(chat, { text: "Usage: .anticallmsg Sorry, calls are not accepted. Please text instead." });

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.anticallMessage = message;
    saveSettings(settings);
    await sock.sendMessage(chat, { text: `✅ Anti-call message set to: "${message}"` });
  }
};
