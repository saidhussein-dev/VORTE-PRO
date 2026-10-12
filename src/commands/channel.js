// src/commands/channel.js
const config = require("../config/config");

module.exports = {
  name: "channel",
  scope: "BOTH",
  description: "Get the official VORTE PRO WhatsApp Channel link",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    await sock.sendMessage(chat, { text: `📢 *${config.channel.name}*\n${config.channel.url}` });
  }
};
