// src/commands/blacklist.js
// One implementation serving: .blacklist add/remove/list <n>, .ban <n>, .unban <n>, .banlist
const helpers = require("../utils/helpers");

module.exports = {
  name: "blacklist",
  scope: "OWNER",
  aliases: ["ban", "unban", "banlist"],
  description: "Block/unblock a number from using the bot (owner only). .blacklist add/remove/list <n> | .ban <n> | .unban <n> | .banlist",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (!helpers.isOwner(sender) && !m.key?.fromMe) {
      return sock.sendMessage(chat, { text: "❌ Owner only command." });
    }

    const commandUsed = helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase();
    let sub, numberArg;
    if (commandUsed === "ban") { sub = "add"; numberArg = args.join(""); }
    else if (commandUsed === "unban") { sub = "remove"; numberArg = args.join(""); }
    else if (commandUsed === "banlist") { sub = "list"; }
    else { sub = args[0]?.toLowerCase(); numberArg = args.slice(1).join(""); }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.blacklist = settings.global.blacklist || [];

    if (sub === "list") {
      if (settings.global.blacklist.length === 0) return sock.sendMessage(chat, { text: "ℹ️ Blacklist is empty." });
      return sock.sendMessage(chat, { text: `🚫 *Blacklisted numbers:*\n${settings.global.blacklist.map(n => "+" + n).join("\n")}` });
    }

    if (sub !== "add" && sub !== "remove") {
      return sock.sendMessage(chat, { text: "❌ Usage: .blacklist add/remove/list <number>  |  .ban <number>  |  .unban <number>  |  .banlist" });
    }

    // Accept a @mention, a replied-to user, or a typed number. Normalize to bare digits so
    // "+255 778..." / "255778...@s.whatsapp.net" / "255778...:12@s.whatsapp.net" all match.
    const ctx = m.message?.extendedTextMessage?.contextInfo;
    const target = ctx?.mentionedJid?.[0] || ctx?.participant || numberArg || "";
    const number = helpers.normalizeJid(target);
    if (number.length < 7 || number.length > 15) {
      return sock.sendMessage(chat, { text: `❌ Give a valid number with country code, or @mention/reply to the user.\nUsage: .${commandUsed === "blacklist" ? "blacklist " + sub : commandUsed} <number>` });
    }

    if (sub === "add") {
      if (helpers.isTrueOwner(number + "@s.whatsapp.net")) {
        return sock.sendMessage(chat, { text: "❌ You can't blacklist the bot's owner." });
      }
      if (!settings.global.blacklist.includes(number)) {
        settings.global.blacklist.push(number);
        saveSettings(settings);
      }
      return sock.sendMessage(chat, { text: `✅ +${number} blacklisted. The bot will now ignore all messages from them.` });
    }

    settings.global.blacklist = settings.global.blacklist.filter(n => n !== number);
    saveSettings(settings);
    return sock.sendMessage(chat, { text: `✅ +${number} removed from the blacklist.` });
  }
};
