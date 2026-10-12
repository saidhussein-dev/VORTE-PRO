// src/commands/prefix.js — view or change the command prefix (owner only). Rules live in utils/prefix.js.
//   .prefix            show the current prefix
//   .prefix !          only "!" works
//   .prefix .!*        several prefixes: each character works
//   .prefix all        any symbol works, and no prefix at all
//   .prefix reset      back to the PREFIX setting (or ".")
const prefixLib = require("../utils/prefix");
const config = require("../config/config");
const { panel } = require("../utils/ui");

const TITLE = "🔣 PREFIX";

module.exports = {
  name: "prefix",
  scope: "OWNER",
  description: "Show or change the command prefix (owner only): .prefix | .prefix .!* | .prefix all | .prefix reset",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const settings = getSettings();
    const reply = (lines) => sock.sendMessage(chat, { text: panel(TITLE, lines) });
    const arg = args.join(" ").trim();

    if (!arg) {
      return reply([
        `Current: ${prefixLib.headline(settings)}`,
        "",
        "Change it:",
        ".prefix !          only !",
        ".prefix .!*        each of . ! * works",
        ".prefix all        any symbol, or none",
        ".prefix reset      back to the default"
      ]);
    }

    settings.global = settings.global || {};
    if (arg.toLowerCase() === "reset") {
      delete settings.global.prefix;
      delete settings.global.customPrefix;
      saveSettings(settings);
      return reply(["✅ Prefix reset.", `Now: ${prefixLib.headline(settings)}`]);
    }

    const parsed = prefixLib.parse(arg);
    if (parsed.error) return reply([`❌ ${parsed.error}`, "Examples: .prefix !   .prefix .!*   .prefix all"]);

    settings.global.prefix = parsed.all ? "all" : parsed.chars.join("");
    delete settings.global.customPrefix; // replaced by the new setting
    saveSettings(settings);
    const shown = prefixLib.display(settings);
    return reply([
      "✅ Prefix updated.",
      `Now: ${prefixLib.headline(settings)}`,
      "",
      `Use it from now on, e.g. ${shown}menu`,
      "If you ever lose it, send  .prefix reset"
    ]);
  }
};
