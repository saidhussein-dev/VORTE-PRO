// src/commands/addsudo.js
// Companion to delsudo/listsudo. Named "addsudo" because ".sudo" is already
// taken by the existing owner code-execution command.
const helpers = require("../utils/helpers");
const sudoStore = require("../utils/sudoStore");

module.exports = {
  name: "addsudo",
  scope: "OWNER",
  description: "Grant a number owner-level access (TRUE owner only). Usage: .addsudo @user  or  .addsudo 2557...",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    // Only env-configured owners may grant sudo — a sudo user must not be able to escalate others.
    if (!helpers.isTrueOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Only the bot's main owner can manage sudo users." });

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const number = helpers.normalizeJid(mentioned || args[0] || "");
    if (number.length < 7 || number.length > 15) return sock.sendMessage(chat, { text: "❌ Usage: .addsudo @user  or  .addsudo <number with country code>" });

    const added = sudoStore.add(number);
    await sock.sendMessage(chat, { text: added ? `✅ +${number} now has sudo (owner-level) access.` : `ℹ️ +${number} is already a sudo user.` });
  }
};
