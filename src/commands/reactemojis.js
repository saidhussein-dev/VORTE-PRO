// src/commands/reactemojis.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "reactemojis",
  scope: "GROUP",
  admin: true,
  description: "Set the emojis used by autoreact in this chat. Usage: .reactemojis 😂,🔥,👍  (or .reactemojis reset)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const isOwner = helpers.isOwner(sender) || m.key?.fromMe;
    if (helpers.isGroup(chat)) {
      const isAdmin = await helpers.isAdmin(sock, chat, sender);
      if (!isOwner && !isAdmin) return sock.sendMessage(chat, { text: "❌ Only group admins or my owner can use this." });
    } else if (!isOwner) {
      return sock.sendMessage(chat, { text: "❌ Only my owner can use this in a private chat." });
    }

    const raw = args.join(" ").trim();
    if (!raw) return sock.sendMessage(chat, { text: "Usage: .reactemojis 😂,🔥,👍  (or .reactemojis reset)" });

    const settings = getSettings();
    if (!settings[chat]) settings[chat] = {};

    if (raw.toLowerCase() === "reset") {
      delete settings[chat].reactEmojis;
      saveSettings(settings);
      return sock.sendMessage(chat, { text: "✅ Reaction emojis reset to default." });
    }

    const emojis = raw.split(/[,\s]+/).filter(Boolean).slice(0, 10);
    if (!emojis.length) return sock.sendMessage(chat, { text: "❌ No emojis found." });
    settings[chat].reactEmojis = emojis;
    saveSettings(settings);
    await sock.sendMessage(chat, { text: `✅ Autoreact emojis set: ${emojis.join(" ")}` });
  }
};
