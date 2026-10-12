// src/commands/define.js
const axios = require("axios");

module.exports = {
  name: "define",
  scope: "BOTH",
  description: "Look up a word's definition",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const word = args[0];
    if (!word) return sock.sendMessage(chat, { text: "❌ Usage: .define <word>" });

    try {
      const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const entry = response.data[0];

      let text = `📚 *${entry.word}*`;
      if (entry.phonetic) text += ` (${entry.phonetic})`;
      text += "\n";

      entry.meanings.slice(0, 3).forEach(meaning => {
        text += `\n*${meaning.partOfSpeech}*\n`;
        meaning.definitions.slice(0, 2).forEach((def, i) => {
          text += `${i + 1}. ${def.definition}\n`;
          if (def.example) text += `   e.g. "${def.example}"\n`;
        });
      });

      await sock.sendMessage(chat, { text: text.trim() });
    } catch (err) {
      if (err.response?.status === 404) {
        return sock.sendMessage(chat, { text: `❌ No definition found for "${word}".` });
      }
      console.error("❌ Define error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Dictionary lookup failed. Try again later." });
    }
  }
};
