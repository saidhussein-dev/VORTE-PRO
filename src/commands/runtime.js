// src/commands/runtime.js
module.exports = {
  name: "runtime",
  scope: "BOTH",
  description: "Get bot runtime",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    await sock.sendMessage(chat, { text: `⏱️ Bot runtime: ${hours}h ${minutes}m ${seconds}s` });
  },
};
