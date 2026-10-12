// src/commands/poll.js
const { panel } = require("../utils/ui");

module.exports = {
  name: "poll",
  scope: "GROUP",
  admin: true,
  description: "Create a poll in the group. Usage: .poll question|option1|option2|...",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const [question, ...rest] = args.join(" ").split("|").map((s) => s.trim());
    const options = rest.filter(Boolean);
    if (!question || options.length < 2) return sock.sendMessage(chat, { text: panel("👥 GROUP MANAGEMENT", ["Usage: .poll question|option1|option2|...", "(2–12 options)"]) });
    if (options.length > 12) return sock.sendMessage(chat, { text: panel("👥 GROUP MANAGEMENT", ["❌ A WhatsApp poll can have at most 12 options."]) });
    await sock.sendMessage(chat, { poll: { name: question, values: options, selectableCount: 1 } });
  }
};
