// src/commands/imdb.js
// Kept the "imdb" name/behavior for backward compatibility, but the actual
// data source is now TMDB (The Movie Database) — better metadata, and real
// "where to watch" data, which OMDb never provided. Not used for downloading
// anything, just info.
const tmdb = require("../services/tmdb");
const providers = require("../services/providers");
const helpers = require("../utils/helpers");

module.exports = {
  name: 'imdb',
  scope: "BOTH",
  description: 'Look up a movie/show: rating, release year, where to watch',
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;

    if (!tmdb.isAvailable()) {
      return sock.sendMessage(chat, { text: providers.UNAVAILABLE_MESSAGE + "\n(Set TMDB_API_KEY — free at themoviedb.org.)" });
    }

    const commandUsed = helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase();
    const isTv = args[0]?.toLowerCase() === "tv";
    const type = isTv ? "tv" : "movie";
    const query = (isTv ? args.slice(1) : args).join(" ").trim();

    if (!query) return sock.sendMessage(chat, { text: `🎬 Usage: .${commandUsed} <title>  (or .${commandUsed} tv <title> for a TV show)` });

    const details = await tmdb.lookup(query, type);
    if (!details) return sock.sendMessage(chat, { text: `❌ "${query}" not found.` });

    const title = details.title || details.name;
    const year = (details.release_date || details.first_air_date || "").slice(0, 4) || "N/A";
    const genres = (details.genres || []).map(g => g.name).join(", ") || "N/A";
    const director = (details.credits?.crew || []).find(c => c.job === "Director")?.name;
    const cast = (details.credits?.cast || []).slice(0, 4).map(c => c.name).join(", ");

    const watch = tmdb.watchProvidersFor(details);
    let watchText = "ℹ️ No streaming/rental info available for this title in this region.";
    if (watch && (watch.stream.length || watch.rent.length || watch.buy.length)) {
      watchText = "📺 *Where to watch* (" + watch.region + "):\n";
      if (watch.stream.length) watchText += `  Stream: ${watch.stream.join(", ")}\n`;
      if (watch.rent.length) watchText += `  Rent: ${watch.rent.join(", ")}\n`;
      if (watch.buy.length) watchText += `  Buy: ${watch.buy.join(", ")}\n`;
      if (watch.link) watchText += `  More options: ${watch.link}`;
    }

    const info =
      `🎬 *${title}* (${year})\n\n` +
      `⭐ Rating: ${details.vote_average ? details.vote_average.toFixed(1) + "/10" : "N/A"} (${details.vote_count || 0} votes)\n` +
      `🎭 Genre: ${genres}\n` +
      (director ? `👨‍💼 Director: ${director}\n` : "") +
      (cast ? `🎞️ Cast: ${cast}\n` : "") +
      `📝 ${details.overview || "No description available."}\n\n` +
      watchText;

    const poster = tmdb.posterUrl(details);
    if (poster) {
      return sock.sendMessage(chat, { image: { url: poster }, caption: info });
    }
    await sock.sendMessage(chat, { text: info });
  }
};
