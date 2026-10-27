// src/config/config.js
require('dotenv').config();
const path = require('path');

// Owner numbers (permissions) come ONLY from environment variables — no hardcoded fallback.
const ownerRaw = [process.env.OWNER_1, process.env.OWNER_2].filter(Boolean);
const ownerDigits = ownerRaw.map((n) => n.replace(/[^0-9]/g, ''));

module.exports = {
  // Bot Settings
  botName: process.env.BOT_NAME || "VORTE PRO",
  // PREFIX like Queen Anita: "." | ".!*" (each character works) | "all" (any symbol, or none). Parsed ONLY by utils/prefix.js.
  prefixSpec: process.env.PREFIX || ".",
  prefix: (process.env.PREFIX && process.env.PREFIX.toLowerCase() !== "all" ? [...process.env.PREFIX.trim()][0] : null) || ".", // display only

  // Server Settings
  port: process.env.PORT || 20202,

  // Creator of the bot: DISPLAY ONLY (menu "Owner no", .owner, contact card when OWNER_1 is not set). Grants NO permissions.
  creator: "255778271055",

  // Owner Details — set OWNER_1 / OWNER_2 in your .env, e.g. OWNER_1=+255700000000
  owners: ownerRaw.map((num, i) => [num, i === 0 ? "Primary Owner" : "Secondary Owner", true]),
  owner1: ownerDigits[0] || null,
  owner2: ownerDigits[1] || null,
  sudo: ownerDigits,

  // WhatsApp Channel — see CHANNEL INTEGRATION LIMITATION note: Baileys cannot
  // attribute normal chat replies to a channel (no such protocol capability).
  // This is just a centralized link/name so commands can promote it honestly.
  channel: {
    name: "VORTE PRO WhatsApp Channel",
    url: "https://whatsapp.com/channel/0029VbBqa4HHbFVBar2vwO3H"
  },

  // Session & Storage (resolved relative to this file, not the process CWD)
  settingsPath: path.join(__dirname, '../../storage/settings.json'),
  sessionFolder: process.env.SESSION_FOLDER ? path.resolve(process.env.SESSION_FOLDER) : path.join(__dirname, '../../storage/session'),

  // API Keys
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  imdbApiKey: process.env.OMDB_API_KEY || process.env.IMDB_API_KEY || "",
  tmdbApiKey: process.env.TMDB_API_KEY || "",
  tmdbRegion: process.env.TMDB_REGION || "US", // used for "where to watch" results
  rapidApiKey: process.env.RAPIDAPI_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekModel: process.env.DEEPSEEK_MODEL || "",
  openaiModel: process.env.OPENAI_MODEL || "",

  // TikTok — official developer credentials only (see services/providers.js
  // for why arbitrary public-video downloading isn't available this way)
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || "",
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || "",

  // Instagram / Meta — official Graph API credentials
  metaAppId: process.env.META_APP_ID || "",
  metaAppSecret: process.env.META_APP_SECRET || "",
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || "",

  // Helper to check if a service is enabled (has API key)
  isServiceEnabled: (key) => !!key && key.trim().length > 0,

  // Standard error message for missing keys
  missingKeyMessage: "⚠️ This feature is currently unavailable. Please try again later."
};
