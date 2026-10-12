// src/commands/fun.js
const helpers = require("../utils/helpers");

const funCommands = ["joke", "quote", "truth", "dare", "dice", "coin", "guess", "hack"];

module.exports = {
  name: "fun",
  scope: "BOTH",
  aliases: funCommands,
  description: "Fun and entertainment commands",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const body = helpers.getBody(m);
    const prefix = body.charAt(0);
    const commandUsed = body.slice(1).split(/\s+/)[0].toLowerCase();

    switch (commandUsed) {
      case "joke":
        const jokes = [
          "Why don't scientists trust atoms? Because they make up everything!",
          "Why did the scarecrow win an award? He was outstanding in his field!",
          "What do you call a bear with no teeth? A gummy bear!",
          "Why don't eggs tell jokes? They'd crack each other up!"
        ];
        await sock.sendMessage(chat, { text: `😂 ${jokes[Math.floor(Math.random() * jokes.length)]}` });
        break;

      case "quote":
        const quotes = [
          "The only way to do great work is to love what you do. - Steve Jobs",
          "Innovation distinguishes between a leader and a follower. - Steve Jobs",
          "Your time is limited, don't waste it living someone else's life. - Steve Jobs",
          "Stay hungry, stay foolish. - Steve Jobs"
        ];
        await sock.sendMessage(chat, { text: `💬 "${quotes[Math.floor(Math.random() * quotes.length)]}"` });
        break;

      case "truth":
        const truths = [
          "What's your biggest fear?",
          "What's the most embarrassing thing you've ever done?",
          "Have you ever lied to get out of trouble?",
          "What's one thing you would change about yourself?"
        ];
        await sock.sendMessage(chat, { text: `🤔 Truth: ${truths[Math.floor(Math.random() * truths.length)]}` });
        break;

      case "dare":
        const dares = [
          "Send a voice note singing your favorite song!",
          "Change your profile picture to something funny for 1 hour!",
          "Send the last photo in your gallery!",
          "Call a random contact and say hello!"
        ];
        await sock.sendMessage(chat, { text: `😈 Dare: ${dares[Math.floor(Math.random() * dares.length)]}` });
        break;

      case "dice":
        const dice = Math.floor(Math.random() * 6) + 1;
        await sock.sendMessage(chat, { text: `🎲 You rolled: ${dice}` });
        break;

      case "coin":
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        await sock.sendMessage(chat, { text: `🪙 ${result}!` });
        break;

      case "guess":
        const number = Math.floor(Math.random() * 10) + 1;
        await sock.sendMessage(chat, { text: `🎲 I'm thinking of a number between 1-10...\nIt's *${number}*!` });
        break;

      case "hack":
        const steps = [
          "💻 Initializing hack...",
          "📡 Connecting to server...",
          "🔍 Scanning target...",
          "📂 Accessing files...",
          "🔓 Bypassing security...",
          "📤 Uploading virus...",
          "💀 Hack complete!"
        ];
        let i = 0;
        let msg = await sock.sendMessage(chat, { text: steps[0] });
        let interval = setInterval(async () => {
          i++;
          if (i >= steps.length) return clearInterval(interval);
          await sock.sendMessage(chat, { text: steps[i], edit: msg.key });
        }, 1000);
        interval.unref();
        break;
    }
  },
};
