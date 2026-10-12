// src/commands/delete.js
const helpers = require("../utils/helpers");
const { guardGroupAdmin } = require("../utils/guards");

module.exports = {
  name: "delete",
  scope: "GROUP",
  admin: true,
  description: "Reply to a message with .delete to remove it (admin only)",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    if (!(await guardGroupAdmin(sock, m))) return;

    const ctx = m.message?.extendedTextMessage?.contextInfo;
    if (!ctx?.stanzaId) return sock.sendMessage(chat, { text: "❌ Reply to the message you want deleted with .delete" });

    const targetIsBot = ctx.participant && helpers.normalizeJid(ctx.participant) === helpers.normalizeJid(sock.user?.id);
    if (!targetIsBot && !(await helpers.isBotAdmin(sock, chat))) {
      return sock.sendMessage(chat, { text: "❌ I need to be a group admin to delete other people's messages." });
    }
    try {
      await sock.sendMessage(chat, {
        delete: { remoteJid: chat, fromMe: !!targetIsBot, id: ctx.stanzaId, participant: ctx.participant }
      });
    } catch (err) {
      console.error("❌ delete error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't delete that message." });
    }
  }
};
