// src/commands/setstatusreact.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "setstatusreact",
  scope: "OWNER",
  description: "Set the emojis used by autoreacttostatus (owner only). Usage: .setstatusreact 😍,🔥  (or reset)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const raw = args.join(" ").trim();
    if (!raw) return sock.sendMessage(chat, { text: "Usage: .setstatusreact 😍,🔥  (or .setstatusreact reset)" });

    const settings = getSettings();
    settings.global = settings.global || {};

    if (raw.toLowerCase() === "reset") {
      delete settings.global.statusReactEmojis;
      saveSettings(settings);
      return sock.sendMessage(chat, { text: "✅ Status reaction emojis reset to default." });
    }

    const emojis = raw.split(/[,\s]+/).filter(Boolean).slice(0, 10);
    if (!emojis.length) return sock.sendMessage(chat, { text: "❌ No emojis found." });
    settings.global.statusReactEmojis = emojis;
    saveSettings(settings);
    await sock.sendMessage(chat, { text: `✅ Status reaction emojis set: ${emojis.join(" ")}` });
  }
};
