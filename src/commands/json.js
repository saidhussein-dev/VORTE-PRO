// src/commands/json.js — .json <json>   |   .json min <json>   (or reply to a message holding JSON)
const { repliedText } = require("../utils/quoted");
const { panel } = require("../utils/ui");

module.exports = {
  name: "json",
  scope: "BOTH",
  description: "Check and format JSON. Usage: .json <json>  |  .json min <json>  (or reply to a message)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const reply = (lines) => sock.sendMessage(chat, { text: panel("🧾 JSON", lines) });
    const minify = (args[0] || "").toLowerCase() === "min";
    if (minify) args.shift();
    const raw = (args.join(" ") || repliedText(m)).trim();
    if (!raw) return reply(["Usage: .json <json>  |  .json min <json>", "or reply to a message that contains JSON."]);
    try {
      const value = JSON.parse(raw);
      const out = minify ? JSON.stringify(value) : JSON.stringify(value, null, 2);
      const body = out.length > 3300 ? out.slice(0, 3300) + "\n… (cut: too long for one message)" : out;
      return reply([`✅ Valid JSON${Array.isArray(value) ? ` (array, ${value.length} items)` : value && typeof value === "object" ? ` (object, ${Object.keys(value).length} keys)` : ""}`, "", "```" + body + "```"]);
    } catch (e) {
      return reply(["❌ Not valid JSON", String(e.message).replace(/^JSON\.parse: /, "")]);
    }
  }
};
