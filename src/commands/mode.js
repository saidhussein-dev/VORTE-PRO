// src/commands/mode.js
const helpers = require("../utils/helpers");

module.exports = {
  name: 'mode',
  scope: "OWNER",
  description: 'Change bot mode (public/self)',
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const isOwner = helpers.isOwner(sender) || m.key?.fromMe;

    if (!isOwner) return sock.sendMessage(chat, { text: "❌ This command is for my owner only." });

    const newMode = args[0]?.toLowerCase();
    if (newMode !== 'public' && newMode !== 'self') {
      return sock.sendMessage(chat, { text: "❓ Usage: .mode [public/self]" });
    }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.mode = newMode;
    saveSettings(settings);

    await sock.sendMessage(chat, { 
      text: `✅ Bot mode changed to: *${newMode.toUpperCase()}*` 
    });
  }
};
