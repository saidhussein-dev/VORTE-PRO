// src/commands/demote.js — remove admin rights from user(s).
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "demote",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Demote an admin to a regular member. Usage: .demote @user (or reply to their message)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const targets = groupOps.resolveTargets(m, args);
    if (!targets.length) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .demote @user  (or reply to their message)"]) });

    const meta = await identity.getMetadata(sock, chat);
    const { allowed, blocked } = groupOps.protect(sock, meta, targets, "demote");
    const res = allowed.length ? await groupOps.participantAction(sock, chat, allowed, "demote") : { ok: [], failed: [] };

    const lines = [];
    if (res.ok.length) lines.push(`⬇️ Demoted: ${res.ok.map(groupOps.mentionText).join(", ")}`);
    for (const f of [...res.failed, ...blocked]) lines.push(`⚠️ ${groupOps.mentionText(f.jid)}: ${f.reason}`);
    await sock.sendMessage(chat, { text: panel(TITLE, lines), mentions: targets });
  }
};
