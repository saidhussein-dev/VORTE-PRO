
const identity = require("../utils/identity");
const { panel } = require("../utils/ui");

module.exports = {
  name: "hidetag",
  scope: "GROUP",
  admin: true,
  description: "Tag all group members without displaying mentions. Usage: .hidetag <message>",

  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    const body =
      args.join(" ").trim() ||
      quoted?.conversation ||
      quoted?.extendedTextMessage?.text ||
      "";

    if (!body) {
      return sock.sendMessage(chat, {
        text: panel("GROUP MANAGEMENT", [
          "Usage: .hidetag <message>",
          "Or reply to a text message with .hidetag",
        ]),
      });
    }

    const meta = await identity.getMetadata(sock, chat);
    const mentions = (meta.participants || []).map((p) => p.id);

    // Delete the command message from the group.
    try {
      await sock.sendMessage(chat, {
        delete: m.key,
      });
    } catch (err) {
      console.error("[hidetag] Failed to delete command:", err.message);
    }

    // Send the requested text with hidden mentions.
    return sock.sendMessage(chat, {
      text: body,
      mentions,
    });
  },
};
