// src/commands/revoke.js — reset the invite link (the old link stops working).
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "revoke",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Reset (revoke) the group invite link (admin only)",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    try {
      const code = await sock.groupRevokeInvite(chat);
      if (!code) throw new Error("WhatsApp returned no link");
      await sock.sendMessage(chat, { text: panel(TITLE, ["✅ Invite link reset. The old link no longer works.", `New link: https://chat.whatsapp.com/${code}`]) });
    } catch (err) {
      await sock.sendMessage(chat, { text: panel(TITLE, [`❌ I couldn't reset the link: ${groupOps.errorReason(err)}.`]) });
    }
  }
};
