// src/commands/ownername.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "ownername",
  scope: "OWNER",
  description: "Set the owner name shown in the menu (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const name = args.join(" ").trim();
    if (!name) return sock.sendMessage(chat, { text: "Usage: .ownername <name>" });
    if (name.length > 40) return sock.sendMessage(chat, { text: "❌ Name too long (max 40 characters)." });

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.ownerName = name;
    saveSettings(settings);
    await sock.sendMessage(chat, { text: `✅ Owner name shown in the menu is now: ${name}` });
  }
};
