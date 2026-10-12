// src/commands/wiki.js
const axios = require("axios");

module.exports = {
  name: "wiki",
  scope: "BOTH",
  description: "Get a Wikipedia summary",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const topic = args.join(" ");
    if (!topic) return sock.sendMessage(chat, { text: "❌ Usage: .wiki <topic>" });

    try {
      const response = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`
      );
      const data = response.data;

      if (data.type === "disambiguation") {
        return sock.sendMessage(chat, { text: `❓ "${topic}" could mean several things. Try being more specific.\n🔗 ${data.content_urls?.desktop?.page || ""}` });
      }

      const text = `📖 *${data.title}*\n\n${data.extract}\n\n🔗 ${data.content_urls?.desktop?.page || ""}`;

      if (data.thumbnail?.source) {
        return sock.sendMessage(chat, { image: { url: data.thumbnail.source }, caption: text });
      }
      await sock.sendMessage(chat, { text });
    } catch (err) {
      if (err.response?.status === 404) {
        return sock.sendMessage(chat, { text: `❌ No Wikipedia article found for "${topic}".` });
      }
      console.error("❌ Wiki error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Wikipedia lookup failed. Try again later." });
    }
  }
};
