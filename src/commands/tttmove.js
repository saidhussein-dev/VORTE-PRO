// src/commands/tttmove.js
const helpers = require("../utils/helpers");
const gameService = require("../services/gameService");

module.exports = {
  name: "tttmove",
  scope: "BOTH",
  description: "Make a move in Tic-Tac-Toe",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const game = gameService.getTTT(chat);
    if (!game) return sock.sendMessage(chat, { text: "No active game. Start with .tictactoe @user" });

    const move = parseInt(args[0]);
    if (!move || move < 1 || move > 9) return sock.sendMessage(chat, { text: "Usage: .tttmove <1-9>" });

    const player = m.key.participant || m.key.remoteJid;
    if (player !== game.turn) return sock.sendMessage(chat, { text: "It's not your turn!" });

    if (game.board[move - 1]) return sock.sendMessage(chat, { text: "Cell already taken!" });

    const symbol = game.players[0] === player ? "X" : "O";
    game.board[move - 1] = symbol;

    const wins = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];

    let winner = null;
    for (const [a,b,c] of wins) {
      if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
        winner = game.board[a];
        break;
      }
    }

    let boardText = helpers.tttBoardToText(game.board);

    if (winner) {
      const winnerJid = game.players[winner === "X" ? 0 : 1];
      const winnerNum = helpers.jidToNumber(winnerJid);
      await sock.sendMessage(chat, { 
        text: `🎉 *Game Over!*\n\n${boardText}\n\nWinner: @${winnerNum} (${winner})`, 
        mentions: [winnerJid] 
      });
      gameService.deleteTTT(chat);
      return;
    }

    if (game.board.every(cell => cell)) {
      await sock.sendMessage(chat, { text: `🤝 *Draw!*\n\n${boardText}` });
      gameService.deleteTTT(chat);
      return;
    }

    game.turn = game.players.find(p => p !== player);
    const nextPlayerNum = helpers.jidToNumber(game.turn);
    const nextSymbol = game.players[0] === game.turn ? "X" : "O";

    await sock.sendMessage(chat, { 
      text: `Next move:\n\n${boardText}\n\nTurn: @${nextPlayerNum} (${nextSymbol})`, 
      mentions: [game.turn] 
    });
  },
};
