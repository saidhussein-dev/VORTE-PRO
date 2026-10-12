// src/commands/botdp.js
const helpers = require("../utils/helpers");
const { downloadMediaMessage } = require("baileys");

module.exports = {
  name: "botdp",
  scope: "OWNER",
  description: "Reply to an image with .botdp to set it as the bot's profile picture (owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const ctx = m.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) return sock.sendMessage(chat, { text: "❌ Reply to an image with .botdp" });

    try {
      const fakeMsg = { key: { remoteJid: chat, id: ctx.stanzaId, participant: ctx.participant }, message: quoted };
      const buffer = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: sock.logger });
      if (buffer.length > 5 * 1024 * 1024) return sock.sendMessage(chat, { text: "❌ Image too large (max 5MB)." });
      await sock.updateProfilePicture(sock.user.id, buffer);
      await sock.sendMessage(chat, { text: "✅ Bot profile picture updated." });
    } catch (err) {
      console.error("❌ botdp error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't update the profile picture." });
    }
  }
};
