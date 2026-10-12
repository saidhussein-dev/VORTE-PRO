// src/commands/update.js
const helpers = require("../utils/helpers");
const { exec } = require("child_process");

module.exports = {
  name: "update",
  scope: "OWNER",
  description: "Pull the latest updates from Git (Owner only)",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isTrueOwner(sender)) return sock.sendMessage(chat, { text: "❌ Owner only command." });

    await sock.sendMessage(chat, { text: "⬇️ Pulling latest updates..." });

    exec("git pull", (err, stdout, stderr) => {
      if (err) { console.error("❌ update failed:", err.message); return sock.sendMessage(chat, { text: "❌ Update failed. Check the server logs for details." }); }
      if (stderr && stderr.includes('error:')) { console.error("⚠️ update stderr:", stderr); return sock.sendMessage(chat, { text: "⚠️ The update reported issues. Check the server logs for details." }); }

      sock.sendMessage(chat, { text: `✅ Update complete:\n${String(stdout).slice(0, 500)}\n\nRestarting bot...` }).then(() => {
        // Restart after update
        process.exit(1);
      });
    });
  },
};
