// src/commands/wyr.js
module.exports = {
  name: "wyr",
  scope: "BOTH",
  description: "Get a random 'would you rather' prompt",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;

    const prompts = [
      "have the ability to fly, or be invisible?",
      "always be 10 minutes late, or always be 20 minutes early?",
      "have unlimited money but no friends, or unlimited friends but no money?",
      "be able to talk to animals, or speak every human language?",
      "live without music, or live without movies/TV?",
      "always have to sing instead of speak, or always have to dance everywhere you walk?",
      "never use social media again, or never watch another movie/show again?",
      "know how you will die, or know when you will die?",
      "be famous but broke, or rich but unknown?",
      "have a rewind button on your life, or a pause button?",
      "lose all your memories, or never be able to make new ones?",
      "be stuck on a deserted island alone, or with someone you dislike?"
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    await sock.sendMessage(chat, { text: `🤔 *Would you rather...*\n\n${prompt}` });
  }
};
