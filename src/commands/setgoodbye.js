// src/commands/setgoodbye.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "setgoodbye",
  scope: "GROUP",
  admin: true,
  description: "Set a custom goodbye message. Use {user} and {group} as placeholders.",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isGroup(chat)) return sock.sendMessage(chat, { text: "❌ This command is for groups only." });

    const isOwner = helpers.isOwner(sender) || m.key?.fromMe;
    const isAdmin = await helpers.isAdmin(sock, chat, sender);
    if (!isOwner && !isAdmin) return sock.sendMessage(chat, { text: "❌ Only group admins or my owner can use this." });

    const message = args.join(" ");
    if (!message) return sock.sendMessage(chat, { text: "Usage: .setgoodbye Bye {user}, we'll miss you from {group}!" });

    const settings = getSettings();
    if (!settings[chat]) settings[chat] = {};
    settings[chat].goodbyeMessage = message;
    saveSettings(settings);

    await sock.sendMessage(chat, { text: `✅ Goodbye message set. Preview:\n\n${message.replace(/\{user\}/g, "@they").replace(/\{group\}/g, "this group")}` });
  }
};
