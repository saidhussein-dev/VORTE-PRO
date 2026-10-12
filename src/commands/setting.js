// src/commands/setting.js
// One command file serves every toggle (see aliases). Syntax is unchanged:
//   .<key> <value>            e.g. .antilink warn   .autotyping private   .antidelete on
//   .setting <key> <value>    same thing
//   .settings                 overview of what is on
//
// Values by kind:
//   automation (owner, global)  autotyping autorecording autoread autoreact : on | off | private | groups | both
//   antidelete (owner, global)  on | off
//   status     (owner, global)  autostatusview autoreacttostatus            : on | off
//   anti       (group admin)    antilink antispam antimention antibug       : on | off | warn | delete | remove
//   chat       (group admin)    welcome goodbye antiedit                    : on | off
const helpers = require("../utils/helpers");
const automation = require("../utils/automation");
const antiActions = require("../utils/antiActions");
const { MSG, panel, onOff } = require("../utils/ui");

const STATUS_KEYS = ["autostatusview", "autoreacttostatus"];
const KEY_ALIASES = { autoviewstatus: "autostatusview", statusview: "autostatusview", recording: "autorecording", antidel: "antidelete" };
const AUTOMATION_KEYS = automation.KEYS;
const ANTI_KEYS = ["antilink", "antispam", "antimention", "antibug"];
const CHAT_KEYS = ["welcome", "goodbye", "antiedit"];
const ALL_KEYS = [...AUTOMATION_KEYS, "antidelete", ...STATUS_KEYS, ...ANTI_KEYS, ...CHAT_KEYS];

const TITLES = { antidelete: "🗑️ ANTI-DELETE", antiedit: "✏️ ANTI-EDIT", welcome: "👋 WELCOME", goodbye: "👋 GOODBYE", autostatusview: "👁️ AUTO STATUS VIEW", autoreacttostatus: "😀 AUTO REACT TO STATUS" };

/** Which key (and value) does this invocation mean? */
function parse(name, args) {
  if (name === "setting" || name === "settings") return { key: KEY_ALIASES[args[0]?.toLowerCase()] || args[0]?.toLowerCase(), value: args[1]?.toLowerCase() };
  return { key: KEY_ALIASES[name] || name, value: args[0]?.toLowerCase() };
}

module.exports = {
  name: "setting",
  aliases: [...ALL_KEYS, ...Object.keys(KEY_ALIASES), "settings"],
  scope: "BOTH",
  description: "Toggle bot settings (some per-chat, some global — see .menu)",

  // Permission depends on WHICH setting is being CHANGED. Reading a status needs none.
  getAccess(name, args) {
    const { key, value } = parse(name, args);
    if (!key || !ALL_KEYS.includes(key) || !value) return {};
    if (AUTOMATION_KEYS.includes(key) || STATUS_KEYS.includes(key) || key === "antidelete") return { scope: "OWNER" };
    if (ANTI_KEYS.includes(key) || key === "welcome" || key === "goodbye") return { scope: "GROUP", admin: true };
    return {}; // antiedit: group admin in a group / owner in private — checked in execute()
  },

  async execute(sock, m, args, getSettings, saveSettings, context) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const isGroup = helpers.isGroup(chat);
    const name = context?.commandName || helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase();
    const prefix = ".";   // commands are written against "."; the real prefix is shown by utils/prefix.js
    const { key, value } = parse(name, args);
    const settings = getSettings();
    const reply = (text, extra = {}) => sock.sendMessage(chat, { text, ...extra });

    // ---- .settings (overview) ----
    if (!key || (name === "settings" || name === "setting") && !ALL_KEYS.includes(key)) {
      if (key && !ALL_KEYS.includes(key)) return reply(`❌ Unknown setting "${key}".\nValid: ${ALL_KEYS.join(", ")}`);
      const lines = ["⚙️ SETTINGS", ""];
      for (const k of AUTOMATION_KEYS) { const c = automation.getConfig(settings, k); lines.push(`${k}: ${c.enabled ? "✅ " + automation.SCOPE_LABEL[c.scope] : "❌ OFF"}`); }
      lines.push(`antidelete: ${onOff(settings.global?.antidelete?.enabled)}`);
      for (const k of STATUS_KEYS) lines.push(`${k}: ${onOff(settings.global?.[k])}`);
      if (isGroup) {
        lines.push("", "👥 This group:");
        for (const k of ANTI_KEYS) { const c = antiActions.getConfig(settings, chat, k); lines.push(`${k}: ${c.enabled ? "✅ " + antiActions.ACTION_LABEL[c.action] : "❌ OFF"}`); }
        for (const k of CHAT_KEYS) lines.push(`${k}: ${onOff(settings[chat]?.[k])}`);
      }
      lines.push("", `Change one with ${prefix}<setting> <value>, e.g. ${prefix}antilink warn`);
      return reply(lines.join("\n"));
    }

    if (!ALL_KEYS.includes(key)) return reply(`❌ Invalid setting. Valid options: ${ALL_KEYS.join(", ")}`);

    const cmd = `${prefix}${key}`;

    // ---- automation (global, scoped) ----
    if (AUTOMATION_KEYS.includes(key)) {
      if (!value) return reply(automation.describe(key, automation.getConfig(settings, key)) + `\n\nUsage: ${cmd} on|off|private|groups|both`);
      const next = automation.applyArg(settings, key, value);
      if (!next) return reply(`❌ Usage: ${cmd} on|off|private|groups|both`);
      saveSettings(settings);
      return reply(automation.describe(key, next));
    }

    // ---- antidelete (global) ----
    if (key === "antidelete") {
      const cur = !!settings.global?.antidelete?.enabled;
      if (!value) return reply(panel(TITLES.antidelete, [`Status: ${onOff(cur)}`, "Scope: 🌐 All Chats (private + groups)", "Delivery: 📥 Owner inbox"]) + `\n\nUsage: ${cmd} on|off`);
      if (value !== "on" && value !== "off") return reply(`❌ Usage: ${cmd} on|off`);
      settings.global = settings.global || {};
      settings.global.antidelete = { enabled: value === "on" };
      saveSettings(settings);
      return reply(panel(TITLES.antidelete, [`Status: ${onOff(value === "on")}`, "Scope: 🌐 All Chats (private + groups)", "Delivery: 📥 Owner inbox"]));
    }

    // ---- status automation (global on/off) ----
    if (STATUS_KEYS.includes(key)) {
      if (!value) return reply(panel(TITLES[key], [`Status: ${onOff(settings.global?.[key])}`]) + `\n\nUsage: ${cmd} on|off`);
      if (value !== "on" && value !== "off") return reply(`❌ Usage: ${cmd} on|off`);
      settings.global = settings.global || {};
      settings.global[key] = value === "on";
      saveSettings(settings);
      return reply(panel(TITLES[key], [`Status: ${onOff(value === "on")}`, "Applies to all statuses"]));
    }

    // ---- anti features (per group: on/off/warn/delete/remove) ----
    if (ANTI_KEYS.includes(key)) {
      if (!value) return reply(antiActions.describe(key, antiActions.getConfig(settings, chat, key)) + `\n\nUsage: ${cmd} on|off|warn|delete|remove`);
      const next = antiActions.applyArg(settings, chat, key, value);
      if (!next) return reply(`❌ Usage: ${cmd} on|off|warn|delete|remove`);
      saveSettings(settings);
      let text = antiActions.describe(key, next);
      if (next.enabled && !(await helpers.isBotAdmin(sock, chat))) text += `\n\n${MSG.botNotAdmin}\nMake me an admin so ${key} can actually enforce its rule.`;
      return reply(text);
    }

    // ---- per-chat toggles: welcome / goodbye / antiedit ----
    if (!value) return reply(panel(TITLES[key], [`Status: ${onOff(settings[chat]?.[key])}`]) + `\n\nUsage: ${cmd} on|off`);
    if (value !== "on" && value !== "off") return reply(`❌ Usage: ${cmd} on|off`);
    if (key === "antiedit") { // group admin / owner in a group; owner only in a private chat
      const perms = await helpers.getPermissions(sock, m);
      if (!perms.isOwner && !(isGroup && perms.isAdmin)) return reply(isGroup ? MSG.adminOnly : MSG.ownerOnly);
    }
    settings[chat] = settings[chat] || {};
    settings[chat][key] = value === "on";
    saveSettings(settings);
    return reply(panel(TITLES[key], [`Status: ${onOff(value === "on")}`]));
  }
};
