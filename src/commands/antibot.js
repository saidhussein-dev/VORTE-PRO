// src/commands/antibot.js
// Per-group list of numbers YOU have identified as bots, with enforcement.
// (WhatsApp offers no way to automatically detect bots, so detection is manual —
// see .antibothelp.) Serves: .antibot .botlist .kickbot .antibothelp
const helpers = require("../utils/helpers");
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const antiActions = require("../utils/antiActions");
const { panel } = require("../utils/ui");

module.exports = {
  name: "antibot",
  scope: "GROUP",
  admin: true,
  scopes: { antibothelp: { scope: "BOTH", admin: false }, kickbot: { botAdmin: true } },
  aliases: ["botlist", "kickbot", "antibothelp"],
  description: "Flag known bot accounts and act on them: .antibot on/off/warn/delete/remove | add/unflag/list <n> | .botlist | .kickbot | .antibothelp",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const cmd = helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase();

    if (cmd === "antibothelp") {
      return sock.sendMessage(chat, {
        text: panel("🤖 ANTIBOT HELP", [
          "WhatsApp doesn't tell us which accounts are bots, so YOU flag them and I enforce it:",
          "",
          "• .antibot add <number|@user> — flag a number as a bot in this group",
          "• .antibot unflag <number|@user> — unflag (.antibot remove <number> also works)",
          "• .antibot list (or .botlist) — show flagged bots",
          "• .antibot on / off — turn enforcement on or off",
          "• .antibot warn | delete | remove — choose what happens when a flagged bot speaks",
          "     warn = delete + warning (3rd warning removes) · delete = delete only · remove = delete + remove",
          "• .kickbot — remove every flagged bot currently in the group",
          "",
          "I must be a group admin to delete messages or remove anyone."
        ])
      });
    }

    if (cmd === "antibot" && !args.length) {
      const st = getSettings();
      const c = antiActions.getConfig(st, chat, "antibot");
      return sock.sendMessage(chat, { text: antiActions.describe("antibot", c) + `\nFlagged bots: ${(st[chat]?.knownBots || []).length}\n\nUsage: .antibot on|off|warn|delete|remove|add|unflag|list` });
    }

    const settings = getSettings();
    if (!settings[chat]) settings[chat] = {};
    const cs = settings[chat];
    cs.knownBots = cs.knownBots || [];

    if (cmd === "botlist" || (cmd === "antibot" && args[0]?.toLowerCase() === "list")) {
      return sock.sendMessage(chat, {
        text: cs.knownBots.length
          ? `🤖 *Flagged bots (${cs.knownBots.length}):*\n${cs.knownBots.map(n => "+" + n).join("\n")}\n\nAuto-remove: ${cs.antibot ? "ON" : "OFF"}`
          : "ℹ️ No bots flagged in this group. Use .antibot add <number>."
      });
    }

    if (cmd === "kickbot") {
      const md = await identity.getMetadata(sock, chat, { force: true });
      const botKeys = new Set(identity.botKeys(sock));
      const targets = md.participants
        .filter((p) => !p.admin)
        .filter((p) => !identity.participantKeys(p).some((k) => botKeys.has(k)))
        .filter((p) => cs.knownBots.some((n) => identity.participantKeys(p).includes(`pn:${n}`) || identity.participantKeys(p).includes(`lid:${n}`)))
        .map((p) => p.id);
      if (!targets.length) return sock.sendMessage(chat, { text: "ℹ️ No flagged bots (that I can remove) are in this group right now." });
      const res = await groupOps.participantAction(sock, chat, targets, "remove");
      const lines = [];
      if (res.ok.length) lines.push(`✅ Removed ${res.ok.length} flagged bot(s).`);
      for (const f of res.failed) lines.push(`⚠️ ${groupOps.mentionText(f.jid)}: ${f.reason}`);
      return sock.sendMessage(chat, { text: lines.join("\n"), mentions: targets });
    }

    // .antibot <on|off|warn|delete|remove|add|unflag> ...
    const sub = args[0]?.toLowerCase();
    const isFlagTarget = sub === "remove" && args.length > 1; // ".antibot remove <number>" keeps its old meaning: unflag
    if (["on", "off", "warn", "delete"].includes(sub) || (sub === "remove" && !isFlagTarget)) {
      const next = antiActions.applyArg(settings, chat, "antibot", sub);
      saveSettings(settings);
      let text = antiActions.describe("antibot", next) + `\nFlagged bots: ${cs.knownBots.length}`;
      if (next.enabled && !(await helpers.isBotAdmin(sock, chat))) text += "\n\n⚠️ I need to be a group admin to perform this action. Make me an admin so AntiBot can enforce.";
      return sock.sendMessage(chat, { text });
    }
    if (sub === "add" || sub === "unflag" || isFlagTarget) {
      const ctx = m.message?.extendedTextMessage?.contextInfo;
      const arg = isFlagTarget ? args[1] : args[1];
      const number = helpers.normalizeJid(ctx?.mentionedJid?.[0] || ctx?.participant || arg || "");
      const pn = identity.toPn(ctx?.mentionedJid?.[0] || ctx?.participant || "") || number;
      if (pn.length < 7 || pn.length > 15) return sock.sendMessage(chat, { text: `Usage: .antibot ${sub === "add" ? "add" : "unflag"} <number>  (or @mention / reply)` });
      if (helpers.isTrueOwner(pn + "@s.whatsapp.net")) return sock.sendMessage(chat, { text: "❌ Can't flag the bot's owner." });
      if (sub === "add") { if (!cs.knownBots.includes(pn)) cs.knownBots.push(pn); }
      else cs.knownBots = cs.knownBots.filter((n) => n !== pn && n !== number);
      saveSettings(settings);
      return sock.sendMessage(chat, { text: `✅ +${pn} ${sub === "add" ? "flagged as a bot" : "unflagged"}.` });
    }

    return sock.sendMessage(chat, { text: "Usage: .antibot on|off|warn|delete|remove | add|unflag|list <number> — see .antibothelp" });
  }
};
