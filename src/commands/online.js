// src/commands/online.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "online",
  scope: "OWNER",
  description: "Keep the bot's WhatsApp presence set to 'online' (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!(await helpers.senderIsOwner(sock, m))) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const value = args[0]?.toLowerCase();
    if (value !== "on" && value !== "off") {
      const settings = getSettings();
      return sock.sendMessage(chat, { text: `Usage: .online on/off\nCurrently: ${settings.global?.online ? "ON" : "OFF"}` });
    }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.online = value === "on";
    saveSettings(settings);

    try {
      await sock.sendPresenceUpdate(value === "on" ? "available" : "unavailable");
    } catch (e) {
      console.error("❌ online presence update failed:", e.message);
    }
    await sock.sendMessage(chat, { text: `✅ Online presence turned ${value}.` });
  }
};
