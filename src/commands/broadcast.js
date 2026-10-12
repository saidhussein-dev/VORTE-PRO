// src/commands/broadcast.js
const helpers = require("../utils/helpers");
const chatStore = require("../utils/chatStore");

module.exports = {
  name: "broadcast",
  scope: "OWNER",
  description: "Broadcast a message to every known chat (owner only)",
  async execute(sock, m, args, getSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isOwner(sender)) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    const message = args.join(" ");
    if (!message) return sock.sendMessage(chat, { text: "Usage: .broadcast <message>" });

    const settings = getSettings?.() || {};
    const safemode = !!settings.global?.safemode;
    const delayMs = safemode ? 2500 : 500;

    try {
      await sock.sendMessage(chat, { text: `📢 Starting broadcast to all chats...${safemode ? " (safemode: slower pacing)" : ""}` });

      let success = 0;
      let failed = 0;

      const chats = chatStore.getKnownChats().slice(0, 200);

      if (chats.length === 0) {
        return sock.sendMessage(chat, { text: "ℹ️ No known chats yet — the bot only broadcasts to chats it has already seen a message in/from." });
      }

      for (const c of chats) {
        if (c.endsWith("@g.us") || c.endsWith("@s.whatsapp.net")) {
          try {
            await sock.sendMessage(c, { text: `📢 *Broadcast from VORTE PRO*\n\n${message}` });
            success++;
            await new Promise(resolve => setTimeout(resolve, delayMs)); // Delay to avoid spam filters
          } catch (e) {
            failed++;
          }
        }
      }

      await sock.sendMessage(chat, { text: `✅ Broadcast complete.\nSent: ${success}\nFailed: ${failed}` });
    } catch (err) {
      console.error("❌ Broadcast error:", err.message);
      await sock.sendMessage(chat, { text: "❌ Broadcast failed." });
    }
  }
};
