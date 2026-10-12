// src/commands/userid.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "userid",
  scope: "BOTH",
  description: "Get your WhatsApp ID",
  async execute(sock, m) {
    const sender = m.key.participant || m.key.remoteJid;
    await sock.sendMessage(m.key.remoteJid, { text: `👤 Your ID: ${sender}` });
  },
};
