// src/commands/weather.js
const axios = require("axios");

module.exports = {
  name: "weather",
  scope: "BOTH",
  description: "Get current weather for a city",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const city = args.join(" ");
    if (!city) return sock.sendMessage(chat, { text: "❌ Usage: .weather <city>" });

    try {
      const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}`, {
        params: { format: "j1" },
        headers: { "User-Agent": "curl" } // wttr.in expects a curl-like UA for the JSON endpoint
      });
      const data = response.data;
      const current = data.current_condition?.[0];
      const area = data.nearest_area?.[0];

      if (!current) throw new Error("No data");

      const text = `🌤️ *Weather in ${area?.areaName?.[0]?.value || city}, ${area?.country?.[0]?.value || ""}*\n\n` +
        `🌡️ Temp: ${current.temp_C}°C (feels like ${current.FeelsLikeC}°C)\n` +
        `☁️ ${current.weatherDesc?.[0]?.value}\n` +
        `💧 Humidity: ${current.humidity}%\n` +
        `💨 Wind: ${current.windspeedKmph} km/h`;

      await sock.sendMessage(chat, { text });
    } catch (err) {
      console.error("❌ Weather error:", err.message);
      await sock.sendMessage(chat, { text: `❌ Couldn't get weather for "${city}". Check the spelling and try again.` });
    }
  }
};
