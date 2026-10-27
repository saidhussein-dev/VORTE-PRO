
function formatUptime(totalSeconds) {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor((totalSeconds / 3600) % 24);
  const days = Math.floor(totalSeconds / 86400);

  const time = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');

  return days > 0 ? `${days}d ${time}` : time;
}

module.exports = {
  name: 'ping2',
  scope: 'BOTH',
  description: 'Show premium runtime dashboard',

  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const start = Date.now();

    await sock.sendMessage(chat, {
      text: '◉ Collecting system metrics...',
    });

    const latency = Date.now() - start;
    const uptime = formatUptime(process.uptime());
    const memoryMb = (
      process.memoryUsage().heapUsed / 1024 / 1024
    ).toFixed(1);

    const socketStatus = sock.user
      ? 'CONNECTED'
      : 'INITIALIZING';

    await sock.sendMessage(chat, {
      text: [
        '┌────── VORTE PRO ──────┐',
        '│',
        `│  ◉ SYSTEM ${socketStatus}`,
        '│',
        `│  LATENCY   ${latency} ms`,
        `│  UPTIME    ${uptime}`,
        `│  HEAP      ${memoryMb} MB`,
        '│  RUNTIME   Node.js',
        '│',
        '│  STATUS: MONITORING',
        '│',
        '└───────────────────────┘',
      ].join('\n'),
    });
  },
};
