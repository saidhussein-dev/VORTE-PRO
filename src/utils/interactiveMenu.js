// src/utils/interactiveMenu.js — the default (style 1) .menu: a WhatsApp interactive "native flow" message
// with buttons, plus the category replies those buttons open.
//
// How it fits together
//   .menu                 -> sendMainMenu(): one interactive message (title VORTE PRO + buttons).
//   button tap            -> WhatsApp sends back an interactive response carrying a button id ("vpmenu:<key>").
//                            responseToCommand() turns that into ".menu <key>", so the tap goes through the SAME
//                            command handler (and the same permission checks) as typing the command.
//   .menu <key>           -> sendCategory() (a category's commands, as text) or sendOwnerContact().
//   buttons not delivered -> sendMainMenu() falls back to a plain-text menu (no buttons) so .menu never goes silent.
//
// Native flow buttons are an unofficial WhatsApp feature (Baileys has no first-class helper in 7.0.0-rc14), so the
// message is built by hand and relayed. Whether a given WhatsApp version RENDERS it cannot be proven from code alone.
const config = require("../config/config");
const botInfo = require("./botInfo");
const access = require("./access");
const { CATEGORIES } = require("./menuData");

const BRAND = "VORTE PRO";
const GITHUB_URL = "https://github.com/saidhussein-dev/VORTE-PRO";
const ID_PREFIX = "vpmenu:";

// Button key -> label and the menuData categories it shows. "direct" ones get their own button on the message;
// the rest live in the "More Categories" list.
const GROUPS = [
  { key: "download", label: "Download Commands", titles: ["DOWNLOADS"], direct: true },
  { key: "group", label: "Group Commands", titles: ["GROUP"], direct: true },
  { key: "owner", label: "Owner Commands", titles: ["OWNER"], direct: true },
  { key: "defense", label: "Defense Commands", titles: ["DEFENSE"] },
  { key: "automation", label: "Automation Commands", titles: ["AUTOMATION"] },
  { key: "ai", label: "AI and Image Commands", titles: ["AI", "IMAGE AI"] },
  { key: "info", label: "Info and Search Commands", titles: ["INFO & SEARCH"] },
  { key: "tools", label: "Tools Commands", titles: ["TOOLS"] },
  { key: "fun", label: "Fun and Games Commands", titles: ["FUN", "GAMES", "RPG"] },
  { key: "bot", label: "Bot Commands", titles: ["BOT"] },
  { key: "settings", label: "Settings Commands", titles: ["SETTINGS"] }
];
const CONTACT_KEY = "contact";
const KEYS = new Set([...GROUPS.map((g) => g.key), CONTACT_KEY]);

// Test seam (same pattern as the other commands): tests replace these, production uses Baileys.
const deps = {
  baileys: () => require("baileys"),
  // Uploads a menu picture/video so it can sit on top of the button message. media = { kind: "image"|"video", source: Buffer|{url}, gifPlayback }
  // Returns { imageMessage } or { videoMessage }. Throws if it cannot be uploaded.
  async prepareMedia(sock, media) {
    const content = media.kind === "video" ? { video: media.source, gifPlayback: !!media.gifPlayback } : { image: media.source };
    return deps.baileys().prepareWAMessageMedia(content, { upload: sock.waUploadToServer });
  },
  // Sends the interactive message. Throws if it cannot be sent.
  // Built the way the maintained Baileys button helpers do it: the interactiveMessage sits directly in the message
  // (NOT inside a viewOnceMessage envelope), a V2 message id, and the biz/interactive/native_flow node on the stanza.
  // Sends the interactive message through the shared implementation (channelButton.js). Throws if it cannot be sent.
  async relayInteractive(sock, chat, content) {
    return sharedRelay(sock, chat, content);
  }
};

/** "🛡️ DEFENSE" / "INFO & SEARCH" -> "DEFENSE" / "INFO & SEARCH" (the menu data titles carry emojis; ours never do). */
const plainTitle = (t) => String(t).replace(/[^A-Za-z& ]/g, "").replace(/\s+/g, " ").trim();

const EMOJI = /\p{Extended_Pictographic}|\uFE0F|\u200D/gu;
/** A usage hint without emojis ("😂,🔥" -> "<emojis>"): nothing in this menu may contain an emoji. */
function plainHint(u) {
  const h = String(u).replace(EMOJI, "").replace(/\s+/g, " ").trim();
  return /[A-Za-z0-9]/.test(h) ? h : "<emojis>";
}

/** Short tag from the command's REAL requirements (never an emoji). */
function tag(command, name) {
  let r;
  try { r = access.requirementsFor(command, name, ["on"]); } catch { return ""; }
  if (r.owner || r.scope === "OWNER") return " [owner]";
  if (r.scope === "GROUP" && r.admin) return " [admin]";
  if (r.scope === "GROUP") return " [group]";
  return "";
}

/** One menuData category as a text block (same frame as the old menu, no emojis). */
function categoryBlock(cat, prefix, registry) {
  const lines = [];
  for (const it of cat.items) {
    const command = registry.get(it.c);
    if (!command) continue; // never show something that does not exist
    const also = it.a && it.a.length ? `  (also ${it.a.map((x) => prefix + x).join(" ")})` : "";
    lines.push(`│➽ ${prefix}${it.c}${it.u ? " " + plainHint(it.u) : ""}${tag(command, it.c)}${also}`);
  }
  return lines.length ? `┏▣ ◈ ${plainTitle(cat.title)} ◈\n${lines.join("\n")}\n┗▣` : "";
}

/** Text for one button key (all of its categories), or null when the key is unknown / nothing to show. */
function categoryText(key, prefix, registry) {
  const group = GROUPS.find((g) => g.key === key);
  if (!group) return null;
  const blocks = CATEGORIES.filter((c) => group.titles.includes(plainTitle(c.title))).map((c) => categoryBlock(c, prefix, registry)).filter(Boolean);
  if (!blocks.length) return null;
  return `${group.label.toUpperCase()}\n\n${blocks.join("\n\n")}\n\n[owner] owner only · [admin] group admin · [group] group only\nType ${prefix}menu to go back.`;
}

/** Lines under the title: only facts that are true right now. */
function infoLines({ prefix, mode, plugins, sock }) {
  const up = process.uptime();
  const owner = botInfo.ownerPhones(sock)[0] || "not set";
  return [
    `Prefix  : ${prefix}`,
    `Mode    : ${String(mode || "public").toUpperCase()}`,
    `Plugins : ${plugins}`,
    `Uptime  : ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`,
    `Owner   : ${owner}`
  ];
}

/**
 * The block above the categories: the full original header (name box + Owner, Owner no, Bot no., Prefix, Version, Mode,
 * Plugins, Speed, Usage, Ram) when the menu command supplies it as info.headerText; otherwise the short info lines.
 */
function intro(info) {
  return info.headerText ? String(info.headerText).trim() : `${BRAND}\n\n${infoLines(info).join("\n")}`;
}

const reply = (display_text, key) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text, id: ID_PREFIX + key }) });
const { link, channelLink, relayInteractive: sharedRelay } = require("./channelButton"); // one button implementation for the whole bot

/** wa.me link that opens a chat with `number` and (optionally) puts `text` in the box, ready to send. */
const waLink = (number, text) => `https://wa.me/${number}${text ? "?text=" + encodeURIComponent(text) : ""}`;

/**
 * The button list, in display order.
 *
 * Normal case: real buttons. Tapping Download / Group / Owner Commands, a row of "More Categories", or Contact Owner makes
 * WhatsApp send a reply to the bot, which runs the command at once (see responseToCommand).
 *
 * ctx.linkMode (the person asking is the bot's OWN account, i.e. the owner on the paired number): WhatsApp does not let an
 * account press buttons on its own outgoing messages, so reply buttons would be dead there. That one case gets link buttons
 * instead: they open the chat with the command already typed in, and the owner presses send.
 * @param {{prefix?: string, sock?: object, linkMode?: boolean}} [ctx]
 */
function buttons(ctx = {}) {
  const prefix = ctx.prefix || ".";
  const botNum = botInfo.botNumber(ctx.sock);
  const ownerNum = botInfo.ownerNumbers(ctx.sock)[0];
  const direct = GROUPS.filter((g) => g.direct);
  const more = GROUPS.filter((g) => !g.direct);
  const out = [channelLink(), link("GitHub Repository", GITHUB_URL)];

  if (ctx.linkMode && botNum) {
    out.push(ownerNum ? link("Contact Owner", waLink(ownerNum)) : reply("Contact Owner", CONTACT_KEY));
    for (const g of direct) out.push(link(g.label, waLink(botNum, `${prefix}menu ${g.key}`)));
    out.push(link("All Commands", waLink(botNum, `${prefix}menu all`)));
    return out;
  }
  out.push(reply("Contact Owner", CONTACT_KEY));
  for (const g of direct) out.push(reply(g.label, g.key));
  out.push({
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "More Categories",
      sections: [{ title: "Categories", rows: more.map((g) => ({ header: "", title: g.label, description: "", id: ID_PREFIX + g.key })) }]
    })
  });
  return out;
}

/**
 * The interactive message content, as the object Baileys wraps and relays.
 * @param {object} info
 * @param {object} [mediaMsg] { imageMessage } | { videoMessage } to put on top (styles 2-4). The title then moves to the
 *   first line of the body, still standing alone, because WhatsApp shows either a title or a picture/video in the header.
 */
function buildInteractive(info, mediaMsg) {
  const { proto } = deps.baileys();
  const others = GROUPS.filter((g) => !g.direct).map((g) => g.key).join(" | ");
  const prompt = info.linkMode
    ? `Tap a category, then press send to see its commands.\nOther categories: ${info.prefix}menu ${others}`
    : "Select a category to see its commands.";
  const boxed = !!info.headerText; // the original header already shows the name in its box
  const lines = `${intro(info)}\n\n${prompt}`;
  const body = mediaMsg && !boxed ? `${BRAND}\n\n${lines}` : lines;
  const header = mediaMsg
    ? { title: "", subtitle: "", hasMediaAttachment: true, ...mediaMsg }
    : boxed ? null : { title: BRAND, subtitle: "", hasMediaAttachment: false };
  const interactiveMessage = proto.Message.InteractiveMessage.create({
    ...(header ? { header: proto.Message.InteractiveMessage.Header.create(header) } : {}),
    body: proto.Message.InteractiveMessage.Body.create({ text: body }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: "Tap a button to continue" }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: buttons(info), messageParamsJson: "" })
  });
  // Default: the interactiveMessage directly. MENU_WRAP=viewonce puts it in the older viewOnceMessage envelope instead
  // (an environment switch, so the other form can be tried without touching code).
  if (String(process.env.MENU_WRAP || "").toLowerCase() === "viewonce") {
    return { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage } } };
  }
  return { interactiveMessage };
}

/** Plain-text menu used when the interactive message cannot be sent. Same facts, no buttons, no emojis. */
function fallbackText(info) {
  const cats = GROUPS.map((g) => `│➽ ${info.prefix}menu ${g.key}   ${g.label}`).join("\n");
  return `${intro(info)}\n\n┏▣ ◈ COMMAND CATEGORIES ◈\n${cats}\n│➽ ${info.prefix}menu ${CONTACT_KEY}   Contact Owner\n┗▣\n\n${config.channel.name}: ${config.channel.url}\nGitHub: ${GITHUB_URL}`;
}

/**
 * Send the main menu: the button message first; if that fails, opts.legacy() (the old picture/video menu) or, for the
 * default style, a plain-text menu — so .menu never goes silent.
 * @param {{media?: {kind: string, source: any, gifPlayback?: boolean}, legacy?: () => Promise<any>}} [opts]
 * @returns {Promise<"interactive"|"legacy"|"text">}
 */
async function sendMainMenu(sock, chat, m, info, opts = {}) {
  try {
    let mediaMsg;
    if (opts.media) {
      if (typeof sock.waUploadToServer !== "function") throw new Error("this connection cannot upload media");
      mediaMsg = await deps.prepareMedia(sock, opts.media);
    }
    await deps.relayInteractive(sock, chat, buildInteractive({ ...info, sock }, mediaMsg), m);
    return "interactive";
  } catch (e) {
    console.error("⚠️ interactive menu failed, sending the fallback menu instead:", e.message);
    if (opts.legacy) { await opts.legacy(); return "legacy"; }
    await sock.sendMessage(chat, { text: fallbackText({ ...info, sock }) });
    return "text";
  }
}

/** Send one category as text. @returns {Promise<boolean>} false when the key is not a category. */
async function sendCategory(sock, chat, key, prefix, registry) {
  const text = categoryText(key, prefix, registry);
  if (!text) return false;
  await sock.sendMessage(chat, { text });
  return true;
}

/** Send the configured owner's contact card (OWNER_1 / OWNER_2; the linked account only when none is configured). */
async function sendOwnerContact(sock, chat, ownerName) {
  const number = botInfo.ownerNumbers(sock)[0];
  if (!number) { await sock.sendMessage(chat, { text: "The owner number is not configured (set OWNER_1)." }); return false; }
  const display = ownerName || "VORTE PRO Owner";
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${display}\nTEL;type=CELL;type=VOICE;waid=${number}:+${number}\nEND:VCARD`;
  await sock.sendMessage(chat, { contacts: { displayName: display, contacts: [{ vcard }] } });
  return true;
}

/** Strip the wrappers WhatsApp may put around a message (disappearing chats, view-once). */
function unwrap(message) {
  let msg = message;
  for (let i = 0; i < 4 && msg; i++) {
    const inner = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || msg.documentWithCaptionMessage?.message;
    if (!inner) break;
    msg = inner;
  }
  return msg;
}

/** Button label -> key, for replies that carry the label but no id (some WhatsApp versions). */
const LABEL_TO_KEY = new Map([...GROUPS.map((g) => [g.label.toLowerCase(), g.key]), ["contact owner", CONTACT_KEY], ["owner contact", CONTACT_KEY]]);

/** The raw response node of any button / list / interactive reply, or null (used to log taps we do not recognise). */
function responseNode(message) {
  const msg = unwrap(message);
  if (!msg) return null;
  return msg.interactiveResponseMessage || msg.buttonsResponseMessage || msg.listResponseMessage || msg.templateButtonReplyMessage || null;
}

/** Is this message a reply to one of our menus: a button / list tap, or a poll vote? */
function isMenuReply(message) {
  const msg = unwrap(message);
  return !!(msg && (responseNode(message) || msg.pollUpdateMessage));
}

/** The button id inside an interactive/button/list response, or null. */
function buttonIdOf(message) {
  const msg = unwrap(message);
  if (!msg) return null;
  const params = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (params) {
    try {
      const p = JSON.parse(params);
      if (p.id) return String(p.id);
      // no id in the reply: fall back to the label of the button / row that was tapped
      const key = LABEL_TO_KEY.get(String(p.display_text || p.title || "").trim().toLowerCase());
      if (key) return ID_PREFIX + key;
    } catch { /* not JSON */ }
  }
  const direct = msg.buttonsResponseMessage?.selectedButtonId || msg.listResponseMessage?.singleSelectReply?.selectedRowId || msg.templateButtonReplyMessage?.selectedId;
  if (direct) return direct;
  const label = msg.interactiveResponseMessage?.body?.text || msg.buttonsResponseMessage?.selectedDisplayText || msg.listResponseMessage?.title || msg.templateButtonReplyMessage?.selectedDisplayText;
  const key = LABEL_TO_KEY.get(String(label || "").trim().toLowerCase());
  return key ? ID_PREFIX + key : null;
}

/**
 * ".menu <key>" for one of OUR button ids, else "" (anything else a user sends is not ours and is ignored).
 * @param {object} message  m.message
 * @param {string} prefix   the live display prefix
 */
function responseToCommand(message, prefix) {
  const id = buttonIdOf(message);
  if (!id || !id.startsWith(ID_PREFIX)) return "";
  const key = id.slice(ID_PREFIX.length);
  return KEYS.has(key) ? `${prefix}menu ${key}` : "";
}

module.exports = {
  BRAND, GITHUB_URL, ID_PREFIX, GROUPS, CONTACT_KEY, KEYS, deps,
  plainTitle, infoLines, intro, categoryText, buildInteractive, buttons, fallbackText,
  sendMainMenu, sendCategory, sendOwnerContact, buttonIdOf, responseNode, isMenuReply, responseToCommand
};
