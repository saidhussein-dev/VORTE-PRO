// src/commands/mute.js — their messages are deleted for N minutes (enforced in messageHandler).
const identity = require("../utils/identity");
const helpers = require("../utils/helpers");
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "mute",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Mute a user for N minutes (their messages get auto-deleted). Usage: .mute @user 10",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const targets = groupOps.resolveTargets(m, []); // numbers in args are the minutes, not people
    const target = targets[0];
    if (!target) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .mute @user <minutes (default 10)>  (or reply to their message)"]) });
    const minutes = Math.min(parseInt(args.find((a) => /^\d{1,5}$/.test(a))) || 10, 24 * 60);

    const meta = await identity.getMetadata(sock, chat);
    const { blocked } = groupOps.protect(sock, meta, [target], "remove");
    const p = groupOps.findParticipant(meta, target);
    if (blocked.length || p?.admin) {
      return sock.sendMessage(chat, { text: panel(TITLE, [`⚠️ I can't mute ${groupOps.mentionText(target)}: ${blocked[0]?.reason || "they are an admin"}.`]), mentions: [target] });
    }

    const settings = getSettings();
    settings[chat] = settings[chat] || {};
    settings[chat].mutedUsers = settings[chat].mutedUsers || {};
    const until = Date.now() + minutes * 60 * 1000;
    // store under every identity (phone digits AND LID digits) so the check matches however WhatsApp labels them
    for (const k of [identity.toPn(target), helpers.normalizeJid(target), p && identity.toPn(p.id)].filter(Boolean)) settings[chat].mutedUsers[k] = until;
    saveSettings(settings);
    await sock.sendMessage(chat, { text: panel(TITLE, [`🔇 ${groupOps.mentionText(target)} is muted for ${minutes} minute(s).`]), mentions: [target] });
  }
};
