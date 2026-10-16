// src/bot/events/groupHandler.js
const helpers = require("../../utils/helpers");
const identity = require("../../utils/identity");
const groupOps = require("../../utils/groupOps");
const antiActions = require("../../utils/antiActions");

const { buildWelcome } = require("../../utils/welcomeMessage");
const welcomePicture = require("../../utils/welcomePicture");

function applyTemplate(template, user, groupName) {
  return template
    .replace(/\{user\}/g, `@${user.split("@")[0]}`)
    .replace(/\{group\}/g, groupName);
}

async function handleGroupUpdate(sock, update, getSettings) {
  try {
    const { id, action } = update;
    require("../../utils/identity").invalidate(id); // roles/membership changed — drop cached metadata
    // Newer Baileys can report participants as objects; accept both shapes.
    const participants = (update.participants || []).map(p => (typeof p === "string" ? p : (p.id || p.jid))).filter(Boolean);
    const settings = getSettings();
    const chatSetting = settings[id] || {};
    // Anti-bot: a flagged bot number that JOINS is removed — when the configured action is REMOVE
    // (warn/delete act on the bot's messages once it speaks; there is nothing to delete at join time).
    if (action === "add" && chatSetting.antibot && (chatSetting.knownBots || []).length
        && antiActions.getConfig(settings, id, "antibot").action === "remove") {
      const raw = (update.participants || []);
      const flagged = raw.filter((p) => {
        const keys = identity.participantKeys(typeof p === "string" ? { id: p } : p);
        return chatSetting.knownBots.some((n) => keys.includes(`pn:${n}`) || keys.includes(`lid:${n}`));
      }).map((p) => (typeof p === "string" ? p : (p.id || p.jid)));
      if (flagged.length && (await helpers.isBotAdmin(sock, id))) {
        const res = await groupOps.participantAction(sock, id, flagged, "remove");
        if (res.ok.length) await sock.sendMessage(id, { text: `🤖 Removed ${res.ok.length} flagged bot(s).` }).catch(() => {});
        else console.error("❌ antibot join-removal failed:", res.failed[0]?.reason);
      }
    }

    if (!chatSetting.welcome && !chatSetting.goodbye) return;

    const metadata = await sock.groupMetadata(id);
    const groupName = metadata.subject;

    const rawByUser = new Map((update.participants || []).map((p) => [typeof p === "string" ? p : (p.id || p.jid), p]));
    for (let user of participants) {
      if (action === "add" && chatSetting.welcome) {
        // Real group description (fetched fresh on every join); the default rules only when there is none.
        const { caption, followUp } = buildWelcome({ user, groupName, description: metadata.desc, template: chatSetting.welcomeMessage });
        // The picture of the member WHO JOINED (every address we know for them), else the group's picture, else none.
        let pic = null;
        try { pic = await welcomePicture.findWelcomePicture(sock, id, rawByUser.get(user) || user); }
        catch (e) { console.error("⚠️ welcome picture lookup failed:", e.message); }
        let sentImage = false;
        if (pic) {
          try {
            await sock.sendMessage(id, { image: pic.image, caption, mentions: [user] });
            sentImage = true;
          } catch (e) { console.error("⚠️ welcome picture could not be sent, sending text:", e.message); }
        }
        if (!sentImage) { // no picture (or it could not be sent) — the welcome text must still go out
          await sock.sendMessage(id, { text: [caption, followUp].filter(Boolean).join("\n\n"), mentions: [user] });
          continue;
        }
        if (followUp) await sock.sendMessage(id, { text: followUp, mentions: [user] });
      }

      if (action === "remove" && chatSetting.goodbye) {
        const text = chatSetting.goodbyeMessage
          ? applyTemplate(chatSetting.goodbyeMessage, user, groupName)
          : `┏▣ ◈ GOODBYE ◈\n┃ 😢 @${user.split("@")[0]} left the group\n┃ 👋 Farewell!\n┗▣`;

        await sock.sendMessage(id, {
          text,
          mentions: [user],
        });
      }
    }
  } catch (err) {
    console.error("Welcome system error:", err);
  }
}

module.exports = { handleGroupUpdate };
