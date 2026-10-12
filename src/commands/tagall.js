// src/commands/tagall.js — mention everyone (admin/owner only: anyone-can-ping-everyone is abuse).
const identity = require("../utils/identity");
const { panel } = require("../utils/ui");

const CHUNK = 150; // keep each message comfortably small

module.exports = {
  name: "tagall",
  scope: "GROUP",
  admin: true,
  description: "Tag everyone in the group (admins only). Usage: .tagall [message]",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const meta = await identity.getMetadata(sock, chat);
    const members = (meta.participants || []).map((p) => p.id);
    const note = args.join(" ").trim();
    for (let i = 0; i < members.length; i += CHUNK) {
      const part = members.slice(i, i + CHUNK);
      const lines = part.map((j) => `@${j.split("@")[0].split(":")[0]}`).join("\n");
      const head = i === 0 ? `📣 *Tagging Everyone*${note ? `\n${note}` : ""}\n\n` : "";
      await sock.sendMessage(chat, { text: head + lines, mentions: part });
    }
  }
};
