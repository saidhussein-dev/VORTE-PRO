// src/commands/anticall.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "anticall",
  scope: "OWNER",
  description: "Toggle automatic rejection of incoming WhatsApp calls (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const value = args[0]?.toLowerCase();
    if (value !== "on" && value !== "off") {
      const settings = getSettings();
      return sock.sendMessage(chat, { text: `Usage: .anticall on/off\nCurrently: ${settings.global?.anticall ? "ON" : "OFF"}` });
    }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.anticall = value === "on";
    saveSettings(settings);
    await sock.sendMessage(chat, { text: `✅ Anti-call turned ${value}.` });
  }
};
