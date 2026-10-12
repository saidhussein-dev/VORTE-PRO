// src/commands/fact.js
const axios = require("axios");

module.exports = {
  name: "fact",
  scope: "BOTH",
  description: "Get a random fact",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    try {
      const response = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random", {
        params: { language: "en" }
      });
      await sock.sendMessage(chat, { text: `🧠 *Random Fact*\n\n${response.data.text}` });
    } catch (err) {
      console.error("❌ Fact error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't fetch a fact right now. Try again later." });
    }
  }
};
