const botInfo = require('../utils/botInfo');
// src/commands/stats.js
module.exports = {
  name: 'stats',
  scope: "BOTH",
  description: 'Show bot statistics',
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const stats = `📊 *Bot Statistics*
• Number: ${botInfo.botPhone(sock)}
• Uptime: ${hours}h ${minutes}m ${seconds}s
• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
• Platform: ${process.platform}`;

    await sock.sendMessage(chat, { text: stats });
  }
};
