// src/commands/image.js
const openai = require("../services/openai");
const helpers = require("../utils/helpers");
const rateLimiter = require("../utils/imageRateLimiter");

module.exports = {
  name: "image",
  scope: "BOTH",
  description: "Generate an image from a text prompt (30 per 5 hours, per user)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const prompt = args.join(" ");

    if (!openai.isAvailable()) {
      return sock.sendMessage(chat, { text: "❌ This feature is currently unavailable because its API provider is not configured." });
    }
    if (!prompt) return sock.sendMessage(chat, { text: "Usage: .image <prompt>" });

    // Fall back to the raw JID so an ID that normalizes to "" can never merge users into one bucket
    const rawSender = m.key.participant || m.key.remoteJid;
    const sender = helpers.normalizeJid(rawSender) || rawSender;
    const check = rateLimiter.canGenerate(sender);
    if (!check.allowed) {
      return sock.sendMessage(chat, {
        text: `⏳ You've hit the image-generation limit (${rateLimiter.LIMIT} per 5 hours). Try again in ${rateLimiter.formatDuration(check.retryAfterMs)}.`
      });
    }

    await sock.sendMessage(chat, { text: `🎨 Generating your image... (${check.remaining - 1} left after this one)` });

    try {
      const imageUrl = await openai.generateImage(prompt);
      if (!imageUrl) return sock.sendMessage(chat, { text: "❌ Failed to generate image. Try again later." });

      rateLimiter.recordGeneration(sender);
      await sock.sendMessage(chat, { image: { url: imageUrl }, caption: `✨ "${prompt}"` });
    } catch (err) {
      console.error("❌ .image error:", err.message);
      await sock.sendMessage(chat, { text: "❌ An error occurred generating that image." });
    }
  }
};
