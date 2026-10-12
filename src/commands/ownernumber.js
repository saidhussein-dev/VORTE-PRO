// src/commands/ownernumber.js
// VIEW-ONLY on purpose. A chat command that could CHANGE who the owner is would
// be a serious security hole — whoever could run it (or trick the owner into
// running it) could permanently take over the bot. Owner numbers are a
// deploy-time decision, set via the OWNER_1 / OWNER_2 environment variables.
// The bot's OWN number is read live from the linked account, so it is always current.
const botInfo = require("../utils/botInfo");
const { panel } = require("../utils/ui");

module.exports = {
  name: "ownernumber",
  scope: "BOTH",
  description: "Show the bot owner's number(s) and the bot's own number",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const owners = botInfo.ownerNumbers(sock);
    const lines = [
      ...(owners.length ? owners.map((n, i) => `${owners.length > 1 ? `Owner ${i + 1}` : "Owner"}: ${botInfo.formatPhone(n)}`) : ["Owner: not configured (set OWNER_1)"]),
      `Bot number: ${botInfo.botPhone(sock)}`
    ];
    await sock.sendMessage(chat, { text: panel("👑 OWNER NUMBER", lines) });
  }
};
