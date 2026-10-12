// src/commands/randommovie.js
const imdb236 = require("../services/imdb236");
const config = require("../config/config");

module.exports = {
  name: "randommovie",
  scope: "BOTH",
  aliases: ["randomtv"],
  description: "Get a random movie (or TV show via .randomtv), optionally filtered by genre",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;

    if (!imdb236.isAvailable()) {
      return sock.sendMessage(chat, { text: config.missingKeyMessage });
    }

    const body = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const commandUsed = body.slice(1).split(/\s+/)[0].toLowerCase();
    const type = commandUsed === "randomtv" ? "tvSeries" : "movie";

    // Usage: .randommovie Action, Comedy   (genres are optional, comma or space separated)
    const genres = args.join(" ")
      .split(",")
      .map(g => g.trim())
      .filter(Boolean)
      .map(g => g.charAt(0).toUpperCase() + g.slice(1).toLowerCase());

    const title = await imdb236.getRandomTitle(type, genres);

    if (!title || !title.primaryTitle) {
      return sock.sendMessage(chat, { text: "❌ Couldn't find a random title right now. Try again, or check the genre spelling." });
    }

    const caption = `🎬 *${title.primaryTitle}* ${title.startYear ? `(${title.startYear})` : ""}\n\n` +
      `⭐ Rating: ${title.averageRating ?? "N/A"} (${title.numVotes ?? 0} votes)\n` +
      `⏱️ Runtime: ${title.runtimeMinutes ? `${title.runtimeMinutes} min` : "N/A"}\n` +
      `🎭 Genres: ${(title.genres || []).join(", ") || "N/A"}\n\n` +
      `${title.description || "No description available."}\n\n` +
      `🔗 ${title.url || ""}`;

    if (title.primaryImage) {
      return sock.sendMessage(chat, { image: { url: title.primaryImage }, caption });
    }
    return sock.sendMessage(chat, { text: caption });
  }
};
