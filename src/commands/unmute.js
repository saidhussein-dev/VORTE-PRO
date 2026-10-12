// src/commands/unmute.js
const identity = require("../utils/identity");
const helpers = require("../utils/helpers");
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";

module.exports = {
  name: "unmute",
  scope: "GROUP",
  admin: true,
  description: "Lift a mute early. Usage: .unmute @user (or reply to their message)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const target = groupOps.resolveTargets(m, [])[0];
    if (!target) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .unmute @user  (or reply to their message)"]) });
    const settings = getSettings();
    const muted = settings[chat]?.mutedUsers;
    let wasMuted = false;
    if (muted) {
      const meta = await identity.getMetadata(sock, chat).catch(() => null);
      const p = meta && groupOps.findParticipant(meta, target);
      for (const k of [identity.toPn(target), helpers.normalizeJid(target), p && identity.toPn(p.id), p && helpers.normalizeJid(p.id)].filter(Boolean)) {
        if (k in muted) { delete muted[k]; wasMuted = true; }
      }
      saveSettings(settings);
    }
    await sock.sendMessage(chat, { text: panel(TITLE, [wasMuted ? `🔊 ${groupOps.mentionText(target)} has been unmuted.` : `ℹ️ ${groupOps.mentionText(target)} was not muted.`]), mentions: [target] });
  }
};
