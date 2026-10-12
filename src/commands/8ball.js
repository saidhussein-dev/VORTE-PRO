// src/commands/8ball.js
module.exports = {
  name: "8ball",
  scope: "BOTH",
  description: "Ask the magic 8-ball a question",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const question = args.join(" ");
    if (!question) return sock.sendMessage(chat, { text: "❌ Usage: .8ball <question>" });

    const answers = [
      "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.",
      "As I see it, yes.", "Most likely.", "Outlook good.", "Signs point to yes.",
      "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
      "Cannot predict now.", "Concentrate and ask again.",
      "Don't count on it.", "My reply is no.", "My sources say no.",
      "Outlook not so good.", "Very doubtful."
    ];
    const answer = answers[Math.floor(Math.random() * answers.length)];

    await sock.sendMessage(chat, { text: `🎱 *${question}*\n\n${answer}` });
  }
};
