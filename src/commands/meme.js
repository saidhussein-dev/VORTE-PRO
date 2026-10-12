// src/commands/meme.js
const axios = require("axios");

module.exports = {
  name: "meme",
  scope: "BOTH",
  description: "Get a random meme",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    try {
      const response = await axios.get("https://meme-api.com/gimme");
      const data = response.data;

      if (!data.url) throw new Error("No meme returned");

      await sock.sendMessage(chat, {
        image: { url: data.url },
        caption: `😂 *${data.title || "Meme"}*\nr/${data.subreddit || "memes"}`
      });
    } catch (err) {
      console.error("❌ Meme error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't fetch a meme right now. Try again later." });
    }
  }
};
