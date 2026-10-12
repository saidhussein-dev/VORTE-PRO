// src/commands/tictactoe.js
const helpers = require("../utils/helpers");
const gameService = require("../services/gameService");

module.exports = {
  name: "tictactoe",
  scope: "BOTH",
  description: "Challenge a user to Tic-Tac-Toe",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (mentioned.length === 0) {
      return sock.sendMessage(chat, { text: "Usage: .tictactoe @user — mention the user you challenge" });
    }

    const opponent = mentioned[0];
    const initiator = m.key.participant || m.key.remoteJid;

    if (opponent === initiator) {
      return sock.sendMessage(chat, { text: "You cannot challenge yourself." });
    }

    if (gameService.getTTT(chat)) {
      return sock.sendMessage(chat, { text: "❌ A game is already in progress in this chat." });
    }

    const game = {
      board: Array(9).fill(""),
      players: [initiator, opponent],
      turn: initiator,
      status: "playing",
      createdAt: Date.now()
    };

    gameService.setTTT(chat, game);

    await sock.sendMessage(chat, { 
      text: `🎮 *Tic Tac Toe Started!*\n\nPlayer X: @${helpers.jidToNumber(initiator)}\nPlayer O: @${helpers.jidToNumber(opponent)}\n\nCurrent board:\n${helpers.tttBoardToText(game.board)}\n\nIt's X's turn! Use .tttmove <1-9>`,
      mentions: [initiator, opponent]
    });
  },
};
