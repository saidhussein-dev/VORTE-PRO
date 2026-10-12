// src/commands/ping3.js
module.exports = {
  name: "ping3",
  scope: "BOTH",
  description: "Alternative ping command (edit version)",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const start = Date.now();
    const msg = await sock.sendMessage(chat, { text: "⚡ Testing speed..." });
    const end = Date.now();
    await sock.sendMessage(chat, {
      text: `🏓 Ping: ${end - start} ms`,
      edit: msg.key
    });
  },
};
