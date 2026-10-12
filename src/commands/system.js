// src/commands/system.js
const os = require("os");

module.exports = {
  name: "system",
  scope: "BOTH",
  description: "Get system information",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const info = `
💻 *SYSTEM INFO*
➤ Platform : ${os.platform()}
➤ CPU      : ${os.cpus()[0].model}
➤ Cores    : ${os.cpus().length}
➤ RAM      : ${(os.totalmem() / 1024 / 1024).toFixed(0)} MB
➤ Hostname : ${os.hostname()}
`;
    await sock.sendMessage(chat, { text: info });
  },
};
