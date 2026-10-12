// src/commands/status.js
const os = require("os");
const botInfo = require("../utils/botInfo");

module.exports = {
  name: "status",
  scope: "BOTH",
  description: "Get bot status and resource usage",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const usedRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalRam = (os.totalmem() / 1024 / 1024).toFixed(0);

    const info = `
⚡ *BOT STATUS*
➤ RAM Usage: ${usedRam}MB / ${totalRam}MB
➤ Platform : ${os.platform()}
➤ CPU      : ${os.cpus()[0].model}
➤ Cores    : ${os.cpus().length}
➤ Hostname : ${os.hostname()}
`;
    await sock.sendMessage(chat, { text: info });
  },
};
