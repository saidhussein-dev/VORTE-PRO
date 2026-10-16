// src/commands/debugtaps.js — .debugtaps on | off | send | clear   (owner only)
// Records what WhatsApp really delivers when a button / poll is tapped, then sends the recording back as a file.
const tapDebug = require("../utils/tapDebug");

module.exports = {
  name: "debugtaps",
  scope: "OWNER",
  description: "Record what arrives when a menu button or poll is tapped, then send the log. Usage: .debugtaps on|off|send|clear",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const sub = String(args[0] || "").toLowerCase();

    if (sub === "on") {
      tapDebug.setEnabled(true);
      return sock.sendMessage(chat, { text: "🐞 Tap recording is ON.\n\n1. Send .menu\n2. Tap a button (or vote in the poll)\n3. Send .debugtaps send\n\nI will send you the log as a file." });
    }
    if (sub === "off") {
      tapDebug.setEnabled(false);
      return sock.sendMessage(chat, { text: "🐞 Tap recording is OFF." });
    }
    if (sub === "clear") {
      tapDebug.clear();
      return sock.sendMessage(chat, { text: "🐞 The recorded log was cleared." });
    }
    if (sub === "send") {
      const log = tapDebug.read();
      if (!log.trim()) return sock.sendMessage(chat, { text: `🐞 Nothing recorded yet.${tapDebug.enabled() ? "" : " Recording is OFF: send .debugtaps on first."}` });
      if (log.length < 3500) await sock.sendMessage(chat, { text: `🐞 TAP LOG\n\n${log}` });
      return sock.sendMessage(chat, { document: Buffer.from(log, "utf8"), mimetype: "text/plain", fileName: "taps-log.txt", caption: `🐞 Tap log (${log.split("\n").filter(Boolean).length} lines)` });
    }
    return sock.sendMessage(chat, { text: `🐞 Tap recording is ${tapDebug.enabled() ? "ON" : "OFF"} (${tapDebug.size()} bytes recorded).\n\nUsage: .debugtaps on | off | send | clear` });
  }
};
