// src/commands/ping2.js
module.exports = {
  name: "ping2",
  scope: "BOTH",
  description: "Alternative ping command",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const start = Date.now();
    const msg = await sock.sendMessage(chat, { text: "Testing..." });
    const end = Date.now();

    await sock.sendMessage(chat, {
      text: `⚡ Speed: ${end - start} ms`,
      edit: msg.key
    });
  },
};
