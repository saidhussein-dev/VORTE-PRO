// src/commands/hidetag.js — a message that notifies everyone without showing @mentions.
const identity = require("../utils/identity");
const { panel } = require("../utils/ui");

module.exports = {
  name: "hidetag",
  scope: "GROUP",
  admin: true,
  description: "Send a message that tags all members without showing the tags. Usage: .hidetag <message> (or reply to a text)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const body = args.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    if (!body) return sock.sendMessage(chat, { text: panel("👥 GROUP MANAGEMENT", ["Usage: .hidetag <message>  (or reply to a text message)"]) });
    const meta = await identity.getMetadata(sock, chat);
    await sock.sendMessage(chat, { text: body, mentions: (meta.participants || []).map((p) => p.id) });
  }
};
