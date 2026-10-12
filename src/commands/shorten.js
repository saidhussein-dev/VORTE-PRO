// src/commands/shorten.js
const axios = require("axios");

module.exports = {
  name: "shorten",
  scope: "BOTH",
  description: "Shorten a URL",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const url = args[0];
    if (!url || !/^https?:\/\//i.test(url)) {
      return sock.sendMessage(chat, { text: "❌ Usage: .shorten <full URL, including http(s)://>" });
    }

    try {
      const response = await axios.get("https://is.gd/create.php", {
        params: { format: "simple", url }
      });
      const result = response.data;

      if (typeof result === "string" && result.startsWith("http")) {
        return sock.sendMessage(chat, { text: `🔗 ${result}` });
      }
      throw new Error(result);
    } catch (err) {
      console.error("❌ Shorten error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't shorten that URL. Make sure it's valid and try again." });
    }
  }
};
