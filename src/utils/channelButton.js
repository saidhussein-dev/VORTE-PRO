// src/utils/channelButton.js — the ONE place that knows about the "View Channel" button.
//
// Everything that needs the channel link or a native-flow ("interactive") message goes through here:
//   * the sock.sendMessage wrapper (botActivity.install) uses send() so EVERY normal reply carries the button,
//   * the interactive .menu uses link() and relayInteractive() so it has the same URL and the same implementation.
//
// How each kind of output gets the button (see classify()):
//   text                       -> one interactive message: the text as the body + a "View Channel" button
//   image / video / document   -> one interactive message: the file in the header, caption as the body + the button
//   audio / voice note         -> audio cannot carry buttons: it is sent as is, then a separate button message follows
//   very long text / captions  -> sent as is (never cut), then a separate button message follows
//   sticker, reaction, edit, delete, poll, contact, location, view-once, status posts, messages that tag people
//                              -> left exactly as they are (no button)
// If building or sending the interactive version fails, the ORIGINAL message is sent unchanged, so a reply is never lost.
const config = require("../config/config");

const BRAND = "VORTE PRO";
const LABEL = "View Channel";
const FOLLOWUP_TEXT = `📢 *${BRAND} Channel*\nFollow the channel for updates, new features and support.`;

// Test seam: tests replace this, production uses the installed Baileys.
const deps = { baileys: () => require("baileys") };

const enabled = () => String(process.env.CHANNEL_BUTTON || "").toLowerCase() !== "false";
/** Longer bodies are not squeezed into a button message; the text goes out untouched and the button follows. */
const inlineMax = () => Number(process.env.CHANNEL_BUTTON_INLINE_MAX) || 1000;

// ---------------------------------------------------------------- the button itself
const channelUrl = () => config.channel.url;

/** A "cta_url" (open link) button. */
const link = (display_text, url) => ({ name: "cta_url", buttonParamsJson: JSON.stringify({ display_text, url, merchant_url: url }) });
const channelLink = () => link(LABEL, channelUrl());

function isChannelButton(btn) {
  if (btn?.name !== "cta_url") return false;
  try { return JSON.parse(btn.buttonParamsJson || "{}").url === channelUrl(); } catch { return false; }
}

// ---------------------------------------------------------------- building and relaying interactive messages
/** The extra stanza nodes WhatsApp needs to show a native-flow message (and, in private chats, the bot node). */
function bizNodes(jid) {
  const nodes = [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] }];
  if (!String(jid).endsWith("@g.us")) nodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodes;
}

/**
 * Build and relay an interactive message. `content` is what Baileys wraps, e.g. { interactiveMessage }.
 * Built the way the maintained Baileys button helpers do it: the interactiveMessage sits directly in the message
 * (NOT inside a viewOnceMessage envelope), a V2 message id, and the biz/interactive/native_flow node on the stanza.
 * @param {object} [options] { quoted, ephemeralExpiration } — passed to Baileys the same way sendMessage would.
 * @returns the message that was sent (same shape sendMessage resolves to)
 */
async function relayInteractive(sock, jid, content, options = {}) {
  const baileys = deps.baileys();
  const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
  const build = { logger: sock.logger, userJid, messageId: baileys.generateMessageIDV2(userJid), timestamp: new Date() };
  if (options.quoted) build.quoted = options.quoted;
  if (options.ephemeralExpiration) build.ephemeralExpiration = options.ephemeralExpiration;
  const msg = baileys.generateWAMessageFromContent(jid, content, build);
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalAttributes: {}, additionalNodes: bizNodes(jid), useCachedGroupMetadata: options.useCachedGroupMetadata });
  return msg;
}

/** Existing buttons of the message (kept), plus the channel button when it is not already there. */
function withChannelButton(existing) {
  const list = (Array.isArray(existing) ? existing : []).filter((b) => b && typeof b === "object" && b.name && b.buttonParamsJson);
  return list.some(isChannelButton) ? list : [...list, channelLink()];
}

function buildInteractive({ body, footer, title, header, contextInfo, buttons }) {
  const { proto } = deps.baileys();
  const I = proto.Message.InteractiveMessage;
  const parts = {
    body: I.Body.create({ text: body }),
    footer: I.Footer.create({ text: footer || BRAND }),
    nativeFlowMessage: I.NativeFlowMessage.create({ buttons, messageParamsJson: "" })
  };
  if (header) parts.header = I.Header.create(header);
  else if (title) parts.header = I.Header.create({ title, subtitle: "", hasMediaAttachment: false });
  if (contextInfo) parts.contextInfo = contextInfo;
  return { interactiveMessage: I.create(parts) };
}

// ---------------------------------------------------------------- deciding what to do with a message
const MEDIA_KEYS = ["image", "video", "document", "audio", "sticker", "ptv"];
// Message kinds that never get a button. (A reaction/edit/delete is not an "output", a sticker must stay a clean sticker, ...)
const NEVER = ["delete", "react", "edit", "poll", "pollResult", "sticker", "ptv", "contacts", "location", "liveLocation", "forward", "pin", "groupInvite", "product", "order", "event", "buttons", "sections", "list", "templateButtons", "interactiveMessage", "disappearingMessagesInChat", "buttonReply", "listReply"];
const TEXT_KEYS = new Set(["text", "footer", "title", "subtitle", "interactiveButtons", "contextInfo", "linkPreview", "ai"]);
const MEDIA_INLINE_KEYS = new Set(["image", "video", "document", "caption", "mimetype", "fileName", "jpegThumbnail", "gifPlayback", "width", "height", "seconds", "footer", "title", "subtitle", "interactiveButtons"]);
const has = (c, k) => c[k] !== undefined && c[k] !== null && c[k] !== false;

/**
 * @returns {{mode: "skip"|"text"|"media"|"followup", reason: string}}
 *   skip      leave the message alone
 *   text      send as one interactive message (text body)
 *   media     send as one interactive message (file in the header)
 *   followup  send the message as is, then a separate message that carries the button
 */
function classify(jid, content, options = {}) {
  if (!enabled()) return { mode: "skip", reason: "disabled (CHANNEL_BUTTON=false)" };
  if (options?.channelButton === false) return { mode: "skip", reason: "opted out" };
  if (!content || typeof content !== "object") return { mode: "skip", reason: "no content" };
  const to = String(jid || "");
  if (!to || to.endsWith("@broadcast") || to.endsWith("@newsletter")) return { mode: "skip", reason: "status / channel post" };

  const never = NEVER.find((k) => has(content, k));
  if (never) return { mode: "skip", reason: `${never} message` };
  if (content.viewOnce) return { mode: "skip", reason: "view-once" };
  if ((content.mentions && content.mentions.length) || content.contextInfo?.mentionedJid?.length) return { mode: "skip", reason: "tags people (a button message would drop the tags)" };

  const media = MEDIA_KEYS.find((k) => has(content, k));
  const keys = Object.keys(content).filter((k) => content[k] !== undefined);

  if (media === "audio") return { mode: "followup", reason: "audio cannot carry buttons" };

  if (media) { // image | video | document
    const text = typeof content.caption === "string" ? content.caption : "";
    if (text.length > inlineMax()) return { mode: "followup", reason: "caption too long for a button message" };
    if (!keys.every((k) => MEDIA_INLINE_KEYS.has(k))) return { mode: "followup", reason: "media has options a button message cannot carry" };
    return { mode: "media", reason: media };
  }

  const text = typeof content.text === "string" ? content.text : "";
  if (!text.trim()) return { mode: "skip", reason: "no text" };
  if (text.length > inlineMax()) return { mode: "followup", reason: "text too long for a button message" };
  if (!keys.every((k) => TEXT_KEYS.has(k))) return { mode: "followup", reason: "text has options a button message cannot carry" };
  return { mode: "text", reason: "text" };
}

// ---------------------------------------------------------------- sending
async function sendInlineText(sock, jid, content, options) {
  const msg = buildInteractive({
    body: content.text, footer: content.footer, title: content.title || content.subtitle,
    contextInfo: content.contextInfo, buttons: withChannelButton(content.interactiveButtons)
  });
  return relayInteractive(sock, jid, msg, options);
}

async function sendInlineMedia(sock, jid, content, options) {
  const kind = ["image", "video", "document"].find((k) => has(content, k));
  const upload = { [kind]: content[kind] };
  for (const k of ["mimetype", "fileName", "gifPlayback", "jpegThumbnail", "width", "height", "seconds"]) if (content[k] !== undefined) upload[k] = content[k];
  const prepared = await deps.baileys().prepareWAMessageMedia(upload, { upload: sock.waUploadToServer, logger: sock.logger });
  const caption = typeof content.caption === "string" ? content.caption : "";
  const msg = buildInteractive({
    body: caption.trim() ? caption : BRAND, footer: content.footer, header: { title: "", subtitle: "", hasMediaAttachment: true, ...prepared },
    contextInfo: content.contextInfo, buttons: withChannelButton(content.interactiveButtons)
  });
  return relayInteractive(sock, jid, msg, options);
}

/** The separate message used for audio / long text / media that cannot carry the button. Never throws. */
async function sendFollowup(sock, jid, options, after) {
  const tryOnce = (opts) => relayInteractive(sock, jid, buildInteractive({ body: FOLLOWUP_TEXT, buttons: [channelLink()] }), opts);
  try {
    return await tryOnce(options.quoted ? { ...options, quoted: after || options.quoted } : options);
  } catch (e) {
    try { return await tryOnce({}); } catch (e2) {
      console.error("[channel button] follow-up message failed:", e2.message);
      return null;
    }
  }
}

/**
 * Send `content` the way sock.sendMessage would, with the channel button attached where the kind of message allows it.
 * @param {object} sock
 * @param {Function} original  the socket's own (unwrapped) sendMessage
 * @param {(m: object) => void} [track]  called with every message this sends (so the bot can recognise its own messages)
 * @returns what the original sendMessage would have returned (the message that carries/is the user's content)
 */
async function send(sock, original, jid, content, options, track = () => {}) {
  const { channelButton: _optOut, ...cleanOptions } = options || {};
  const pass = Object.keys(cleanOptions).length ? cleanOptions : undefined; // exactly what the caller would have passed
  const plan = typeof sock.relayMessage === "function" ? classify(jid, content, options) : { mode: "skip", reason: "no relay support" };

  if (plan.mode === "skip") {
    const sent = await original(jid, content, pass);
    track(sent);
    return sent;
  }

  if (plan.mode === "text" || plan.mode === "media") {
    try {
      const sent = plan.mode === "text" ? await sendInlineText(sock, jid, content, cleanOptions) : await sendInlineMedia(sock, jid, content, cleanOptions);
      track(sent);
      return sent;
    } catch (e) {
      // Never lose the reply because the button version could not be built or sent.
      console.error(`[channel button] ${plan.mode} version failed (${e.message}) — sending the original message`);
      const sent = await original(jid, content, pass);
      track(sent);
      if (plan.mode === "media") track(await sendFollowup(sock, jid, cleanOptions, sent));
      return sent;
    }
  }

  // followup: the content as is, then the button message
  const sent = await original(jid, content, pass);
  track(sent);
  track(await sendFollowup(sock, jid, cleanOptions, sent));
  return sent;
}

/** sendFollowup for code that may hold a socket without relay support (tests) or run with the button switched off. */
async function sendFollowupIfSupported(sock, jid, options = {}) {
  if (!enabled() || typeof sock?.relayMessage !== "function") return null;
  const m = await sendFollowup(sock, jid, options);
  try { require("./botActivity").markSent(m?.key?.id); } catch { /* tracking only */ }
  return m;
}

/** A socket view whose sendMessage never adds the channel button (internal notices, recovered messages, ...). */
function withoutButton(sock) {
  if (!sock || sock.__vorteNoButton) return sock;
  const view = Object.create(sock);
  view.sendMessage = (jid, content, options) => sock.sendMessage(jid, content, { ...(options || {}), channelButton: false });
  view.__vorteNoButton = true;
  return view;
}

module.exports = { BRAND, LABEL, deps, enabled, channelUrl, link, channelLink, isChannelButton, bizNodes, relayInteractive, withChannelButton, buildInteractive, classify, send, sendFollowup, sendFollowupIfSupported, withoutButton };
