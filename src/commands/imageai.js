// src/commands/imageai.js
const openai = require("../services/openai");
const helpers = require("../utils/helpers");
const rateLimiter = require("../utils/imageRateLimiter");

const imageStyles = {
  "1917style": "1917 cinematic, realistic",
  "advancedglow": "advanced glow, futuristic",
  "cartoonstyle": "cartoon style, colorful",
  "luxurygold": "luxury gold, elegant, shiny",
  "matrix": "matrix cyberpunk, green digital",
  "sand": "sand texture, desert, grainy",
  "papercutstyle": "papercut art style, layered"
};

module.exports = {
  name: "imageai",
  scope: "BOTH",
  aliases: Object.keys(imageStyles),
  description: "Generate images with various styles",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const body = helpers.getBody(m);
    const prefix = body.charAt(0);
    const commandUsed = body.slice(1).split(/\s+/)[0].toLowerCase();
    
    const style = imageStyles[commandUsed];
    if (!style) return sock.sendMessage(chat, { text: "❌ Invalid style." });

    const prompt = args.join(" ");
    if (!prompt) return sock.sendMessage(chat, { text: `Usage: ${prefix}${commandUsed} <prompt>` });

    if (!openai.isAvailable()) return sock.sendMessage(chat, { text: "⚠️ OpenAI service is not available." });

    // Fall back to the raw JID so an ID that normalizes to "" can never merge users into one bucket
    const rawSender = m.key.participant || m.key.remoteJid;
    const sender = helpers.normalizeJid(rawSender) || rawSender;
    const check = rateLimiter.canGenerate(sender);
    if (!check.allowed) {
      return sock.sendMessage(chat, {
        text: `⏳ You've hit the image-generation limit (${rateLimiter.LIMIT} per 5 hours). Try again in ${rateLimiter.formatDuration(check.retryAfterMs)}.`
      });
    }

    await sock.sendMessage(chat, { text: `🎨 Generating ${commandUsed} image... (${check.remaining - 1} left after this one)` });

    try {
      const imageUrl = await openai.generateImage(prompt, style);
      if (!imageUrl) return sock.sendMessage(chat, { text: "❌ Failed to generate image." });

      rateLimiter.recordGeneration(sender); // only counts on real success, per spec

      await sock.sendMessage(chat, { image: { url: imageUrl }, caption: `✨ *${commandUsed} image* for: "${prompt}"` });
    } catch (err) {
      console.error(err);
      await sock.sendMessage(chat, { text: "❌ An error occurred." });
    }
  },
};
