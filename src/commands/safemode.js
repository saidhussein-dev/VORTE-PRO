// src/commands/safemode.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "safemode",
  scope: "OWNER",
  description: "Toggle human-like pacing/delays to reduce the risk of WhatsApp flagging the bot as spam (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isOwner(sender) && !m.key?.fromMe) {
      return sock.sendMessage(chat, { text: "❌ Owner only command." });
    }

    const value = args[0]?.toLowerCase();
    if (value !== "on" && value !== "off") {
      const settings = getSettings();
      const current = settings.global?.safemode ? "ON" : "OFF";
      return sock.sendMessage(chat, { text: `Usage: .safemode on/off\nCurrently: ${current}` });
    }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.safemode = value === "on";
    saveSettings(settings);

    await sock.sendMessage(chat, {
      text: `✅ Safemode turned ${value}.` + (value === "on"
        ? "\n\nThe bot will now add small human-like delays before responding and slow down broadcasts, to reduce spam-flag risk. This does not bypass WhatsApp's actual detection — it just avoids behaving like an obvious bot."
        : "")
    });
  }
};
