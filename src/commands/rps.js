// src/commands/rps.js
module.exports = {
  name: "rps",
  scope: "BOTH",
  description: "Play rock-paper-scissors against the bot",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const choice = args[0]?.toLowerCase();
    const valid = ["rock", "paper", "scissors"];

    if (!valid.includes(choice)) {
      return sock.sendMessage(chat, { text: "❌ Usage: .rps rock/paper/scissors" });
    }

    const botChoice = valid[Math.floor(Math.random() * 3)];
    const emoji = { rock: "🪨", paper: "📄", scissors: "✂️" };

    let result;
    if (choice === botChoice) {
      result = "It's a tie!";
    } else if (
      (choice === "rock" && botChoice === "scissors") ||
      (choice === "paper" && botChoice === "rock") ||
      (choice === "scissors" && botChoice === "paper")
    ) {
      result = "You win! 🎉";
    } else {
      result = "I win! 🤖";
    }

    await sock.sendMessage(chat, {
      text: `${emoji[choice]} vs ${emoji[botChoice]}\n\nYou: ${choice}\nMe: ${botChoice}\n\n${result}`
    });
  }
};
