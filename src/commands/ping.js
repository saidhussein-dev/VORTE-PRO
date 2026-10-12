// src/commands/ping.js
module.exports = {
  name: 'ping',
  scope: "BOTH",
  description: 'Check bot latency',
  async execute(sock, m, args) {
    const start = Date.now();
    await sock.sendMessage(m.key.remoteJid, { text: "Pinging..." });
    const latency = Date.now() - start;
    await sock.sendMessage(m.key.remoteJid, { text: `🏓 Pong! Latency: ${latency}ms` });
  }
};
