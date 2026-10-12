// src/commands/kick.js — remove user(s). Targets: @mention(s), a replied-to message, or a number.
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "kick",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Remove a user from the group. Usage: .kick @user (or reply to their message)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const targets = groupOps.resolveTargets(m, args);
    if (!targets.length) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .kick @user  (or reply to their message)"]) });

    const meta = await identity.getMetadata(sock, chat);
    const { allowed, blocked } = groupOps.protect(sock, meta, targets, "remove");
    const res = allowed.length ? await groupOps.participantAction(sock, chat, allowed, "remove") : { ok: [], failed: [] };

    const lines = [];
    if (res.ok.length) lines.push(`👢 Removed: ${res.ok.map(groupOps.mentionText).join(", ")}`);
    for (const f of [...res.failed, ...blocked]) lines.push(`⚠️ Couldn't remove ${groupOps.mentionText(f.jid)}: ${f.reason}`);
    await sock.sendMessage(chat, { text: panel(TITLE, lines), mentions: targets });
  }
};
