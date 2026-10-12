// src/commands/setbotnameto.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "setbotnameto",
  scope: "OWNER",
  description: "Set the custom bot name shown in menu style 4 (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const isOwner = helpers.isOwner(sender) || m.key?.fromMe;

    if (!isOwner) {
      return sock.sendMessage(chat, { text: "❌ Only my owner can set this." });
    }

    const newName = args.join(" ").trim();
    if (!newName) {
      return sock.sendMessage(chat, { text: "❌ Usage: .setbotnameto <new bot name>" });
    }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.menu = settings.global.menu || {};
    settings.global.menu.customName = newName;
    saveSettings(settings);

    await sock.sendMessage(chat, { text: `✅ Custom menu name set to: *${newName}*\n(Shown when menu style 4 is active. This is separate from *.setnamebot*, which changes the bot's actual WhatsApp profile name.)` });
  }
};
