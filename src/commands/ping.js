
module.exports = {
  name: 'ping',
  scope: 'BOTH',
  description: 'Check bot response speed',

  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const start = Date.now();

    

    const latency = Date.now() - start;
    const state =
      latency < 300 ? 'STABLE' :
      latency < 800 ? 'BUSY' : 'SLOW';

    await sock.sendMessage(chat, {
      text: [
        '╭━━━〔 VORTE PRO 〕━━━╮',
        '┃',
        '┃  SYSTEM: ONLINE',
        `┃  SPEED: ${latency}ms`,
        `┃  STATE: ${state}`,
        '┃',
        '┃  ⚡ RESPONSE VERIFIED',
        '┃  ▰▰▰▰▰▰▰▰▰▰ 100%',
        '┃',
        '╰━━━━━━━━━━━━━━━━━━╯',
      ].join('\n'),
    });
  },
};
