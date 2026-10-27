
module.exports = {
  name: 'ping3',
  scope: 'BOTH',
  description: 'Run terminal-style connection diagnostics',

  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const start = Date.now();

    

    const latency = Date.now() - start;
    const socketConnected = Boolean(sock.user);
    const heapMb = (
      process.memoryUsage().heapUsed / 1024 / 1024
    ).toFixed(1);
    const uptimeSeconds = Math.floor(process.uptime());

    await sock.sendMessage(chat, {
      text: [
        'root@vorte:~$ ./diagnostics',
        '',
        '[ OK ] Process initialized',
        `[ ${socketConnected ? 'OK' : 'WARN'} ] WhatsApp socket ${
          socketConnected ? 'connected' : 'initializing'
        }`,
        `[ OK ] Message gateway responded in ${latency}ms`,
        `[ OK ] Heap usage: ${heapMb} MB`,
        `[ OK ] Process uptime: ${uptimeSeconds}s`,
        '',
        `RESULT: ${socketConnected ? 'PASS' : 'CHECK CONNECTION'}`,
        `EXIT CODE: ${socketConnected ? '0' : '1'}`,
        '',
        'root@vorte:~$ _',
      ].join('\n'),
    });
  },
};
