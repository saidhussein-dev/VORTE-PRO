// src/commands/warn.js — manual warning (3 = removal). Separate from the automatic anti* counters.
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const antiActions = require("../utils/antiActions");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";
const LIMIT = 3;

module.exports = {
  name: "warn",
  scope: "GROUP",
  admin: true,
  description: "Give a warning to a user (3 warnings = removal). Usage: .warn @user (or reply to their message)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const target = groupOps.resolveTargets(m, [])[0];
    if (!target) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .warn @user  (or reply to their message)"]) });

    const meta = await identity.getMetadata(sock, chat);
    const { blocked } = groupOps.protect(sock, meta, [target], "remove");
    const p = groupOps.findParticipant(meta, target);
    if (blocked.length || p?.admin) {
      return sock.sendMessage(chat, { text: panel(TITLE, [`⚠️ I can't warn ${groupOps.mentionText(target)}: ${blocked[0]?.reason || "they are an admin"}.`]), mentions: [target] });
    }

    const settings = getSettings();
    settings[chat] = settings[chat] || {};
    settings[chat].warnings = settings[chat].warnings || {};
    const key = antiActions.personKey(target);
    const oldKey = target; // warnings saved by earlier versions used the raw JID
    const warns = (settings[chat].warnings[key] || settings[chat].warnings[oldKey] || 0) + 1;
    delete settings[chat].warnings[oldKey];
    settings[chat].warnings[key] = warns;
    saveSettings(settings);

    const tag = groupOps.mentionText(target);
    if (warns < LIMIT) {
      return sock.sendMessage(chat, { text: panel(TITLE, [`⚠️ ${tag} has been warned.`, `Total warnings: ${warns}/${LIMIT}`]), mentions: [target] });
    }

    const res = await groupOps.participantAction(sock, chat, [target], "remove");
    if (res.ok.length) {
      delete settings[chat].warnings[key];
      saveSettings(settings);
      return sock.sendMessage(chat, { text: panel(TITLE, [`🚫 ${tag} reached ${LIMIT}/${LIMIT} warnings and was removed.`]), mentions: [target] });
    }
    return sock.sendMessage(chat, { text: panel(TITLE, [`⚠️ ${tag} reached ${LIMIT}/${LIMIT} warnings, but I couldn't remove them: ${res.failed[0]?.reason || "WhatsApp refused"}.`]), mentions: [target] });
  }
};
