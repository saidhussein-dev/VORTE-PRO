// src/commands/owner.js
const botInfo = require("../utils/botInfo");
const { panel } = require("../utils/ui");

module.exports = {
  name: "owner",
  scope: "BOTH",
  description: "Show bot owner info",
  async execute(sock, m, args, getSettings) {
    const chat = m.key.remoteJid;
    let name = null;
    try { name = (getSettings?.() || {}).global?.ownerName || null; } catch (e) {}
    const owners = botInfo.ownerNumbers(sock);
    const bot = botInfo.botNumber(sock);
    const lines = [
      name ? `Name: ${name}` : null,
      ...owners.map((n, i) => `${owners.length > 1 ? `Owner ${i + 1}` : "Owner"}: ${botInfo.formatPhone(n)}`),
      `Bot number: ${botInfo.botPhone(sock)}${owners.length === 1 && owners[0] === bot ? "  (the owner's own account)" : ""}`
    ];
    await sock.sendMessage(chat, { text: panel("👑 BOT OWNER", lines) });
    // a contact card so the number can be saved with one tap (the linked account = what people message)
    if (bot) {
      const display = name || "Bot Owner";
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${display}\nTEL;type=CELL;type=VOICE;waid=${bot}:+${bot}\nEND:VCARD`;
      try { await sock.sendMessage(chat, { contacts: { displayName: display, contacts: [{ vcard }] } }); } catch (e) { /* the text above already has the number */ }
    }
  }
};
