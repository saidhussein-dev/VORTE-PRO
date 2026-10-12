// src/commands/newgc.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "newgc",
  scope: "OWNER",
  description: "Create a new group (owner only). Usage: .newgc Group Name @user1 @user2",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    if (!helpers.isOwner(sender) && !m.key?.fromMe) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    // Group name = the text with @mentions stripped out
    const subject = args.filter(a => !a.startsWith("@")).join(" ").trim().slice(0, 100);
    if (!subject || !mentioned.length) {
      return sock.sendMessage(chat, { text: "Usage: .newgc <group name> @user1 @user2\n(at least one other person must be @mentioned)" });
    }
    try {
      const group = await sock.groupCreate(subject, mentioned);
      await sock.sendMessage(chat, { text: `✅ Group "${subject}" created.` });
      if (group?.id) await sock.sendMessage(group.id, { text: `👋 Welcome to ${subject}!` });
    } catch (err) {
      console.error("❌ newgc error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Couldn't create the group." });
    }
  }
};
