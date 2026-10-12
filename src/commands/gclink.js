// src/commands/gclink.js
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "gclink",
  scope: "GROUP",
  botAdmin: true,
  description: "Get the group invite link",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    try {
      const code = await sock.groupInviteCode(chat);
      if (!code) throw new Error("WhatsApp returned no link");
      await sock.sendMessage(chat, { text: panel(TITLE, [`🔗 Group link: https://chat.whatsapp.com/${code}`]) });
    } catch (err) {
      await sock.sendMessage(chat, { text: panel(TITLE, [`❌ I couldn't get the link: ${groupOps.errorReason(err)}.`]) });
    }
  }
};
