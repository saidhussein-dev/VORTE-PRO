// src/commands/quiz.js
const helpers = require("../utils/helpers");
const gameService = require("../services/gameService");

module.exports = {
  name: "quiz",
  scope: "BOTH",
  aliases: ["quizstart", "quizanswer"],
  description: "Play a quick quiz",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const body = helpers.getBody(m);
    const commandUsed = body.slice(1).split(/\s+/)[0].toLowerCase();
    const answerText = args.join(" ");

    const isStart = commandUsed === "quizstart" || (commandUsed === "quiz" && args[0]?.toLowerCase() === "start");

    if (isStart) {
      if (gameService.getQuiz(chat)) {
        return sock.sendMessage(chat, { text: "❌ A quiz is already active in this chat!" });
      }

      const quizzes = [
        { q: "What is the capital of France?", choices: ["London", "Berlin", "Paris", "Madrid"], answer: "Paris" },
        { q: "How many continents are there?", choices: ["5", "6", "7", "8"], answer: "7" },
        { q: "What is 2+2?", choices: ["3", "4", "5", "6"], answer: "4" },
        { q: "What is the largest planet in our solar system?", choices: ["Earth", "Mars", "Jupiter", "Saturn"], answer: "Jupiter" }
      ];

      const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
      gameService.setQuiz(chat, { ...quiz, active: true, createdAt: Date.now() });

      await sock.sendMessage(chat, {
        text: `🧠 *Quiz Started!*\n\nQuestion: ${quiz.q}\n\nChoices: ${quiz.choices.join(", ")}\n\nAnswer with: quizanswer <answer>`
      });
      return;
    }

    // Otherwise: treat as an answer attempt (.quizanswer <x>, or .quiz <x>)
    const quiz = gameService.getQuiz(chat);
    if (!quiz || !quiz.active) return sock.sendMessage(chat, { text: "No active quiz. Start with quizstart" });

    if (!answerText) return sock.sendMessage(chat, { text: "Usage: quizanswer <your answer>" });

    const userAnswer = answerText.trim().toLowerCase();
    const correctAnswer = quiz.answer.toLowerCase();

    if (userAnswer === correctAnswer) {
      await sock.sendMessage(chat, { text: `✅ *Correct!* @${helpers.jidToNumber(m.key.participant || m.key.remoteJid)} got it right! The answer is ${quiz.answer}`, mentions: [m.key.participant || m.key.remoteJid] });
    } else {
      await sock.sendMessage(chat, { text: `❌ *Wrong!* The correct answer is ${quiz.answer}` });
    }

    gameService.deleteQuiz(chat);
  },
};
