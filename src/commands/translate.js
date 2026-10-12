// src/commands/translate.js
const axios = require("axios");

// Using a free public LibreTranslate mirror — no key needed, but public instances
// can be slow/rate-limited/occasionally down. If this stops working, swap
// LIBRETRANSLATE_URL for another public instance or a self-hosted one.
const LIBRETRANSLATE_URL = "https://translate.astian.org/translate";

module.exports = {
  name: "translate",
  scope: "BOTH",
  description: "Translate text. Usage: .translate <lang_code> <text>  (e.g. .translate es Hello there)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    if (args.length < 2) {
      return sock.sendMessage(chat, { text: "❌ Usage: .translate <lang_code> <text>\ne.g. .translate es Hello there\n(sw = Swahili, fr = French, es = Spanish, ar = Arabic, zh = Chinese...)" });
    }

    const targetLang = args[0].toLowerCase();
    const text = args.slice(1).join(" ");

    try {
      const response = await axios.post(LIBRETRANSLATE_URL, {
        q: text,
        source: "auto",
        target: targetLang,
        format: "text"
      }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });

      const translated = response.data?.translatedText;
      if (!translated) throw new Error("No translation returned");

      await sock.sendMessage(chat, { text: `🌐 *Translated (${targetLang}):*\n${translated}` });
    } catch (err) {
      console.error("❌ Translate error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Translation service is unavailable right now (free public translator can be flaky). Try again in a bit." });
    }
  }
};
