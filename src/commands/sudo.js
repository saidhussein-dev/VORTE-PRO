// src/commands/sudo.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "sudo",
  scope: "OWNER",
  description: "Execute arbitrary JavaScript code (Owner only)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    // SECURITY: this runs arbitrary code on the host (it can read env vars/API keys,
    // creds.json, run shell commands). It is therefore (1) restricted to the TRUE
    // owner — sudo-list users can't use it — and (2) disabled unless the host
    // explicitly opts in with ENABLE_EVAL=true.
    if (!(await helpers.senderIsTrueOwner(sock, m))) return sock.sendMessage(chat, { text: "❌ Owner only command." });
    if (process.env.ENABLE_EVAL !== "true") {
      return sock.sendMessage(chat, { text: "🔒 The code-execution command is disabled. Set ENABLE_EVAL=true in the host environment to enable it (security risk — only do this if you understand it)." });
    }

    const code = args.join(" ");
    if (!code) return sock.sendMessage(chat, { text: "Usage: .sudo <javascript code>" });

    try {
      // Provide some context variables for convenience
      const result = await eval(`(async () => { ${code} })()`);
      const resultStr = String(result).slice(0, 2000);
      await sock.sendMessage(chat, { text: `✅ Result:\n\`\`\`${resultStr}\`\`\`` });
    } catch (err) {
      await sock.sendMessage(chat, { text: `❌ Error:\n\`\`\`${String(err)}\`\`\`` });
    }
  },
};
