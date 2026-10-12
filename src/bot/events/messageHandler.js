// src/bot/events/messageHandler.js
const helpers = require("../../utils/helpers");
const commandHandler = require("../handlers/commandHandler");
const openai = require("../../services/openai");
const chatStore = require("../../utils/chatStore");
const identity = require("../../utils/identity");
const automation = require("../../utils/automation");
const antiDelete = require("../../utils/antiDelete");
const antiActions = require("../../utils/antiActions");
const prefixLib = require("../../utils/prefix");
const interactiveMenu = require("../../utils/interactiveMenu");

const lastCommand = {};
const recentMessages = {}; // for antispam flood detection

const ANTIBUG_MAX_TEXT_LENGTH = 4000;
const ANTIBUG_MAX_VCARD_LENGTH = 3000;
const ANTIMENTION_MAX_MENTIONS = 15;
const ANTISPAM_WINDOW_MS = 8000;
const ANTISPAM_MAX_MESSAGES = 6;
// http(s) links, www. links, and WhatsApp invite/short links (often typed without a scheme)
const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/i;

/** Keys a number can be known by (phone digits and/or LID digits) for the mute / flagged-bot lists. */
function senderNumbers(sender) {
  return [...new Set([identity.toPn(sender), helpers.normalizeJid(sender)].filter(Boolean))];
}

/**
 * Baileys may deliver several messages in ONE upsert (e.g. after a reconnect).
 * Every one of them is processed; one failing must not stop the rest.
 */
async function handleMessage(sock, upsert, getSettings, saveSettings) {
  if (upsert.type !== "notify") return;
  for (const m of upsert.messages || []) {
    try {
      await processMessage(sock, m, getSettings, saveSettings);
    } catch (err) {
      console.error("❌ message processing error:", err);
    }
  }
}

async function processMessage(sock, m, getSettings, saveSettings) {
  if (!m || !m.key) return;

  const chat = m.key.remoteJid;
  const sender = m.key.participant || m.key.remoteJid;
  const isGroupChat = helpers.isGroup(chat);
  chatStore.trackChat(chat);
  // Baileys v7: learn LID <-> phone pairs for this sender BEFORE any owner/admin check.
  try { await identity.resolveSender(sock, m); } catch (e) { console.error("❌ sender resolution failed:", e.message); }
  const settings = getSettings();
  const groupSetting = settings[chat] || {};
  const globalSetting = settings.global || { mode: "public" }; // Default to public

  // Remember this message for antiedit/antidelete BEFORE any gate below. Self mode, mute and anti-bot
  // decide who the bot ANSWERS — they must not stop it from keeping a copy, or a deleted message from
  // anyone else could never be recovered. (Text always; media too when AntiDelete is on.)
  // Not awaited: downloading media must never delay the command flow.
  antiDelete.remember(sock, m, settings).catch((e) => console.error("⚠️ antidelete remember failed:", e.message));

  // Enforcement: If in "self" (private) mode, only owner can use the bot
  const isOwner = helpers.isOwner(sender) || m.key?.fromMe;
  if (globalSetting.mode === "self" && !isOwner) return;

  // Enforcement: mute — auto-delete messages from currently-muted users
  if (isGroupChat && !isOwner && senderNumbers(sender).some((n) => groupSetting.mutedUsers?.[n] > Date.now())) {
    try { await sock.sendMessage(chat, { delete: m.key }); } catch (e) {}
    return;
  }

  // Enforcement: anti-bot — a flagged bot number speaking in a group gets the configured action
  if (isGroupChat && groupSetting.antibot && !isOwner && senderNumbers(sender).some((n) => (groupSetting.knownBots || []).includes(n))) {
    await antiActions.enforce(sock, { chat, sender, m, feature: "antibot", settings, saveSettings });
    return;
  }

  // Enforcement: ignore anyone on the blacklist entirely
  if (!isOwner && (globalSetting.blacklist || []).includes(helpers.normalizeJid(sender))) return;

  // Get message text
  const msgText =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    // a tap on one of the VORTE PRO menu buttons arrives as a response, not as text: treat it as ".menu <key>"
    interactiveMenu.responseToCommand(m.message, prefixLib.display(settings)) ||
    "";

  const body = (msgText || "").trim();

  // A button/list tap that is not one of ours (or that we could not read): say so in the console, with what
  // WhatsApp actually sent, instead of ignoring it silently.
  if (!body) {
    const tap = interactiveMenu.responseNode(m.message);
    if (tap) console.log("🔘 button tap NOT recognised (sent by WhatsApp as):", JSON.stringify(tap));
  }

  // Log incoming message to console for tracking
  if (body) {
    const senderNum = sender.split('@')[0];
    const chatNum = chat.split('@')[0];
    const context = isGroupChat ? `[Group: ${chatNum}]` : '[Private]';
    console.log(`💬  ${context} ${senderNum}: ${body}`);
  }

  // Allow self-commands: ignore fromMe ONLY if it's not a command
  const hit = prefixLib.match(body, settings);
  const isCommandText = (h) => !!h && (!h.loose || commandHandler.commands.has(h.rest.trim().split(/\s+/)[0].toLowerCase()));
  if (m.key?.fromMe && !isCommandText(hit)) return;

  // Online: keep presence set to available while enabled
  if (globalSetting.online) {
    try { await sock.sendPresenceUpdate("available"); } catch (e) {}
  }

  // Auto-read (scope: private / groups / both)
  if (automation.appliesTo(settings, "autoread", chat)) {
    try { await sock.readMessages([m.key]); } catch (e) {}
  }

  // Auto-typing / auto-recording presence (scope-aware; typing for text, recording for voice when both on)
  automation.runPresence(sock, settings, chat, m).catch(() => {});

  // AI Auto-reply
  if (body.toLowerCase().includes("@bot") && openai.isAvailable()) {
    const query = body.replace(/@bot/gi, "").trim();
    if (query) {
      const reply = await openai.chatCompletion(query);
      if (reply) await sock.sendMessage(chat, { text: reply });
    }
    return;
  }

  // Anti-Link Moderation (WARN / DELETE / REMOVE)
  if (isGroupChat && groupSetting.antilink && !isOwner && LINK_REGEX.test(body)) {
    if (!(await helpers.isAdmin(sock, chat, sender))) {
      await antiActions.enforce(sock, { chat, sender, m, feature: "antilink", settings, saveSettings });
      return;
    }
  }

  // Anti-Bug: block known crash/malformed-payload patterns (oversized text, oversized vCards, etc.)
  if (isGroupChat && groupSetting.antibug && !isOwner) {
    const vcard = m.message?.contactMessage?.vcard || "";
    const vcardArray = m.message?.contactsArrayMessage?.contacts || [];
    const totalVcardLength = vcard.length + vcardArray.reduce((sum, c) => sum + (c.vcard?.length || 0), 0);
    const isSuspicious = body.length > ANTIBUG_MAX_TEXT_LENGTH || totalVcardLength > ANTIBUG_MAX_VCARD_LENGTH || vcardArray.length > 50;
    if (isSuspicious && !(await helpers.isAdmin(sock, chat, sender))) {
      await antiActions.enforce(sock, { chat, sender, m, feature: "antibug", settings, saveSettings });
      return;
    }
  }

  // Anti-Mention: block mass-mention ("tag bombing") messages
  if (isGroupChat && groupSetting.antimention && !isOwner) {
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentionedJid.length > ANTIMENTION_MAX_MENTIONS && !(await helpers.isAdmin(sock, chat, sender))) {
      await antiActions.enforce(sock, { chat, sender, m, feature: "antimention", settings, saveSettings });
      return;
    }
  }

  // Anti-Spam: flood/rate-limit protection on raw messages (separate from the command cooldown below)
  if (isGroupChat && groupSetting.antispam && !isOwner && body) {
    const key = `${chat}_${sender}`;
    const now = Date.now();
    const timestamps = (recentMessages[key] || []).filter((t) => now - t < ANTISPAM_WINDOW_MS);
    timestamps.push(now);
    recentMessages[key] = timestamps;
    if (timestamps.length > ANTISPAM_MAX_MESSAGES && !(await helpers.isAdmin(sock, chat, sender))) {
      recentMessages[key] = []; // reset window after flagging, so one flood = one action
      await antiActions.enforce(sock, { chat, sender, m, feature: "antispam", settings, saveSettings });
      return;
    }
  }

  // Real WhatsApp Status handling (status@broadcast) — global/owner scope, not per-group.
  if (chat === "status@broadcast") {
    if (globalSetting.autostatusview) {
      try {
        await sock.readMessages([m.key]);
      } catch (e) {
        console.error('❌ autostatusview error:', e.message);
      }
    }
    if (globalSetting.autoreacttostatus) {
      try {
        const statusEmojis = (globalSetting.statusReactEmojis && globalSetting.statusReactEmojis.length) ? globalSetting.statusReactEmojis : ["❤️", "🔥", "😂", "👍", "😮"];
        const emoji = statusEmojis[Math.floor(Math.random() * statusEmojis.length)];
        await sock.sendMessage("status@broadcast", { react: { text: emoji, key: m.key } }, { statusJidList: [m.key.participant, sender].filter(Boolean) });
      } catch (e) {
        console.error('❌ autoreacttostatus error:', e.message);
      }
    }
    return; // a status update is never a command or a chat message to process further
  }

  // Automation: Auto React (scope: private / groups / both)
  if (automation.appliesTo(settings, "autoreact", chat)) {
    const defaultEmojis = ["❤️","😂","🤔","😅","🙂","🥺","🥹","😞","💔","🤖","😊","😁","😭","😘","🥰","🥲","🤩","😬","😝","😜","😔","😌","😋","🙄","😒","😕","⭐","💥","🫂","👁️","🦾"];
    const emojis = (groupSetting.reactEmojis && groupSetting.reactEmojis.length) ? groupSetting.reactEmojis : (globalSetting.reactEmojis && globalSetting.reactEmojis.length ? globalSetting.reactEmojis : defaultEmojis);
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    try {
      await sock.sendMessage(chat, { react: { text: randomEmoji, key: m.key } });
    } catch (e) {}
  }

  // Handle Commands
  if (isCommandText(hit)) {
    // Cooldown
    const now = Date.now();
    const cooldownKey = `${chat}_${sender}`;
    if (lastCommand[cooldownKey] && (now - lastCommand[cooldownKey]) < 1000) return;
    lastCommand[cooldownKey] = now;

    // Safemode: small human-like delay before responding
    if (globalSetting.safemode) {
      await sock.sendPresenceUpdate("composing", chat).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
    }

    await commandHandler.handle(sock, m, body, getSettings, saveSettings);
  }
}

module.exports = { handleMessage, processMessage, LINK_REGEX };
