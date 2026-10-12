// src/commands/search.js
const axios = require("axios");

module.exports = {
  name: "search",
  scope: "BOTH",
  description: "Search the web via DuckDuckGo",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const query = args.join(" ");
    if (!query) return sock.sendMessage(chat, { text: "❌ Usage: .search <query>" });

    try {
      const response = await axios.get("https://api.duckduckgo.com/", {
        params: { q: query, format: "json", no_html: 1, skip_disambig: 1 }
      });
      const data = response.data;

      let text = "";
      if (data.AbstractText) {
        text = `🔎 *${data.Heading || query}*\n\n${data.AbstractText}`;
        if (data.AbstractURL) text += `\n\n🔗 ${data.AbstractURL}`;
      } else if (data.RelatedTopics?.length) {
        const top = data.RelatedTopics.filter(t => t.Text).slice(0, 5);
        if (top.length) {
          text = `🔎 *Results for:* ${query}\n\n` + top.map((t, i) => `${i + 1}. ${t.Text}${t.FirstURL ? `\n${t.FirstURL}` : ""}`).join("\n\n");
        }
      }

      if (!text) {
        text = `❌ No instant answer found for "${query}". Try: https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      }

      await sock.sendMessage(chat, { text });
    } catch (err) {
      console.error("❌ Search error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Search failed. Try again later." });
    }
  }
};
