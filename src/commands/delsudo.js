// src/commands/delsudo.js
const helpers = require("../utils/helpers");
const sudoStore = require("../utils/sudoStore");

module.exports = {
  name: "delsudo",
  scope: "OWNER",
  description: "Remove a number's sudo access (TRUE owner only). Usage: .delsudo @user  or  .delsudo 2557...",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isTrueOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Only the bot's main owner can manage sudo users." });

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const number = helpers.normalizeJid(mentioned || args[0] || "");
    if (!number) return sock.sendMessage(chat, { text: "❌ Usage: .delsudo @user  or  .delsudo <number>" });

    const removed = sudoStore.remove(number);
    await sock.sendMessage(chat, { text: removed ? `✅ +${number} removed from sudo.` : `ℹ️ +${number} wasn't a sudo user.` });
  }
};
