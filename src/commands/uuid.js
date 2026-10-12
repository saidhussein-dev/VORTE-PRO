// src/commands/uuid.js — .uuid [count]
const crypto = require("crypto");
const { panel } = require("../utils/ui");

module.exports = {
  name: "uuid",
  scope: "BOTH",
  description: "Generate random UUIDs (v4). Usage: .uuid [1-10]",
  async execute(sock, m, args) {
    const n = Math.min(Math.max(parseInt(args[0], 10) || 1, 1), 10);
    const ids = Array.from({ length: n }, () => "`" + crypto.randomUUID() + "`");
    await sock.sendMessage(m.key.remoteJid, { text: panel(`🆔 UUID${n > 1 ? "s" : ""}`, ids) });
  }
};
