// src/commands/add.js — add number(s) to the group.
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "add",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Add someone to the group (admin only). Usage: .add 255700000000 [more numbers]",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const numbers = [...new Set(args.map((a) => a.replace(/[^0-9]/g, "")).filter((n) => n.length >= 7 && n.length <= 15))].slice(0, 10);
    if (!numbers.length) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .add <number with country code> [more numbers]"]) });

    const jids = numbers.map((n) => `${n}@s.whatsapp.net`);
    const res = await groupOps.participantAction(sock, chat, jids, "add");
    const lines = [];
    if (res.ok.length) lines.push(`✅ Added: ${res.ok.map((j) => "+" + groupOps.digits(j)).join(", ")}`);
    for (const f of res.failed) {
      const hint = /privacy/.test(f.reason) ? " — send them the invite link instead (.gclink)" : "";
      lines.push(`⚠️ +${groupOps.digits(f.jid)}: ${f.reason}${hint}`);
    }
    await sock.sendMessage(chat, { text: panel(TITLE, lines) });
  }
};
