// src/commands/listsudo.js
const helpers = require("../utils/helpers");
const sudoStore = require("../utils/sudoStore");

module.exports = {
  name: "listsudo",
  scope: "OWNER",
  description: "List sudo users (owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const list = sudoStore.list();
    if (!list.length) return sock.sendMessage(chat, { text: "ℹ️ No sudo users." });
    await sock.sendMessage(chat, { text: `👑 *Sudo users:*\n${list.map(n => "+" + n).join("\n")}` });
  }
};
