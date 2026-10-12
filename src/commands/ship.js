// src/commands/ship.js
module.exports = {
  name: "ship",
  scope: "BOTH",
  description: "Ship two people for a fun compatibility %. Usage: .ship @user1 @user2",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentions.length < 2) {
      return sock.sendMessage(chat, { text: "❌ Usage: .ship @user1 @user2" });
    }

    const [a, b] = mentions;
    // deterministic-ish "random" % based on the pair, so the same pair gets the same result each time
    const seed = (a + b).split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const percent = seed % 101;

    const bar = "▓".repeat(Math.round(percent / 10)) + "░".repeat(10 - Math.round(percent / 10));
    const verdict = percent >= 80 ? "Soulmates! 💘" : percent >= 50 ? "There's potential 😏" : percent >= 20 ? "...it's complicated 😬" : "Not happening 💀";

    await sock.sendMessage(chat, {
      text: `💘 *Ship Calculator*\n\n@${a.split("@")[0]} + @${b.split("@")[0]}\n\n${bar} ${percent}%\n\n${verdict}`,
      mentions: [a, b]
    });
  }
};
