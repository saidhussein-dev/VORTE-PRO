// src/commands/decode.js — .decode <type> <text>   (or reply to a text)
const codec = require("../utils/codec");
const { repliedText } = require("../utils/quoted");
const { panel } = require("../utils/ui");

module.exports = {
  name: "decode",
  scope: "BOTH",
  description: "Decode text. Usage: .decode <base64|base64url|hex|url|binary|morse|rot13> <text>  (or reply to a text)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const reply = (lines) => sock.sendMessage(chat, { text: panel("🔠 DECODE", lines) });
    const type = (args.shift() || "").toLowerCase();
    const text = args.join(" ") || repliedText(m);
    if (!type || !codec.TYPES.includes(type) || !text) {
      return reply([`Usage: .decode <type> <text>  (or reply to a text)`, `Types: ${codec.TYPES.join(", ")}`, "e.g. .decode base64 hello"]);
    }
    try {
      const out = codec.decode(type, text);
      return reply([`Type: ${type}`, "", "`" + (out.length > 3000 ? out.slice(0, 3000) + "…" : out) + "`"]);
    } catch (e) {
      return reply([`❌ ${e.message}`]);
    }
  }
};
