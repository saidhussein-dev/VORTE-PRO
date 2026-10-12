// src/commands/hangman.js
const helpers = require("../utils/helpers");
const gameService = require("../services/gameService");

module.exports = {
  name: "hangman",
  scope: "BOTH",
  aliases: ["hangmanstart", "hangmanguess"],
  description: "Play Hangman",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const cmd = helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase(); // Get the actual command used
    
    if (cmd === "hangmanstart" || (cmd === "hangman" && args[0] === "start")) {
      if (gameService.getHangman(chat)) {
        return sock.sendMessage(chat, { text: "❌ A hangman game is already in progress in this chat." });
      }

      const words = ["javascript", "whatsapp", "computer", "internet", "android", "iphone", "python", "programming"];
      const word = words[Math.floor(Math.random() * words.length)];

      const game = {
        word: word.toLowerCase(),
        display: "_".repeat(word.length).split(""),
        tries: 6,
        guessed: [],
        createdAt: Date.now()
      };

      gameService.setHangman(chat, game);

      await sock.sendMessage(chat, { 
        text: `🎯 *Hangman Started!*\n\nWord: ${game.display.join(" ")}\nTries left: 6\n\nGuess a letter with: .hangmanguess <letter>` 
      });
      return;
    }

    if (cmd === "hangmanguess" || (cmd === "hangman" && args[0] !== "start")) {
      const game = gameService.getHangman(chat);
      if (!game) return sock.sendMessage(chat, { text: "No active game. Start with .hangmanstart" });

      const letter = (cmd === "hangmanguess" ? args[0] : args[0])?.toLowerCase();
      if (!letter || letter.length !== 1 || !/[a-z]/.test(letter)) {
        return sock.sendMessage(chat, { text: "Usage: .hangmanguess <single letter>" });
      }

      if (game.guessed.includes(letter)) {
        return sock.sendMessage(chat, { text: "Letter already guessed!" });
      }

      game.guessed.push(letter);
      let found = false;

      for (let i = 0; i < game.word.length; i++) {
        if (game.word[i] === letter) {
          game.display[i] = letter;
          found = true;
        }
      }

      if (!found) game.tries -= 1;

      if (game.display.join("") === game.word) {
        await sock.sendMessage(chat, { 
          text: `🎉 *You Won!*\n\nThe word was: *${game.word}*\nTries left: ${game.tries}` 
        });
        gameService.deleteHangman(chat);
        return;
      }

      if (game.tries <= 0) {
        await sock.sendMessage(chat, { 
          text: `💀 *Game Over!*\n\nThe word was: *${game.word}*\n\nBetter luck next time!` 
        });
        gameService.deleteHangman(chat);
        return;
      }

      const hangmanStates = [
        "  ____\n  |  |\n     |\n     |\n     |\n     |\n_____|___",
        "  ____\n  |  |\n  O  |\n     |\n     |\n     |\n_____|___",
        "  ____\n  |  |\n  O  |\n  |  |\n     |\n     |\n_____|___",
        "  ____\n  |  |\n  O  |\n /|  |\n     |\n     |\n_____|___",
        "  ____\n  |  |\n  O  |\n /|\\ |\n     |\n     |\n_____|___",
        "  ____\n  |  |\n  O  |\n /|\\ |\n /   |\n     |\n_____|___",
        "  ____\n  |  |\n  O  |\n /|\\ |\n / \\ |\n     |\n_____|___"
      ];

      const stateIndex = 6 - game.tries;
      await sock.sendMessage(chat, { 
        text: `${hangmanStates[stateIndex]}\n\nWord: ${game.display.join(" ")}\nTries left: ${game.tries}\nGuessed: ${game.guessed.join(", ")}` 
      });
    }
  },
};
