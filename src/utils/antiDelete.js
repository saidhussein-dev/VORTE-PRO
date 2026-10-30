// src/utils/antiDelete.js
// AntiDelete: recover deleted messages (text AND media) and deliver them to the bot
// owner(s)' private inbox. Global (private chats + groups) when enabled via `.antidelete on`.
//
// WHAT IS EXCLUDED (all decided here, in one place):
//   - status updates, broadcasts, newsletters      -> not a chat message
//   - messages the BOT sent (welcome/goodbye, anti* warnings, command replies, status
//     lines, the recovery notices themselves)       -> botActivity.wasSentByBot
//   - messages the BOT deleted (antilink/antispam/antibot/mute/.delete enforcement)
//                                                   -> botActivity.wasDeletedByBot
//   - messages sent by the bot's own account       -> your own outgoing deletes aren't "events"
//   - view-once media                              -> never cached or forwarded
// The recovered copy sits in the owner's chat like any normal message: the bot never
// deletes it, so it stays until the owner deletes it.
const fs = require("fs");
const path = require("path");
const config = require("../config/config");
const messageCache = require("./messageCache");
const botActivity = require("./botActivity");
const identity = require("./identity");
const automation = require("./automation");
const { pipeline } = require("stream/promises");

const CACHE_DIR = path.join(__dirname, "../../storage/tmp/antidelete");
// How long a recoverable file is kept. Default 24 hours (ANTIDELETE_CACHE_MINUTES to change).
const TTL_MS = (Number(process.env.ANTIDELETE_CACHE_MINUTES) || 24 * 60) * 60 * 1000;
// NO per-file size limit by default: every size is kept. (ANTIDELETE_MAX_MEDIA_MB=<n> adds one, if the host disk is tiny.)
const MAX_FILE_BYTES = Number(process.env.ANTIDELETE_MAX_MEDIA_MB) > 0 ? Number(process.env.ANTIDELETE_MAX_MEDIA_MB) * 1024 * 1024 : Infinity;
// The cache lives on DISK. Past this total the OLDEST files go first — never the one just saved. 0 = no cap.
const MAX_TOTAL_BYTES = process.env.ANTIDELETE_MAX_TOTAL_MB === "0" ? Infinity : (Number(process.env.ANTIDELETE_MAX_TOTAL_MB) || 2048) * 1024 * 1024;
// Files up to this size are sent from memory; bigger ones are streamed from disk so a huge video never fills RAM.
const SEND_FROM_MEMORY_UP_TO = 40 * 1024 * 1024;
// If the owner deletes... no: if the SENDER deletes a message while its media is still downloading, wait this long for it.
const DOWNLOAD_WAIT_MS = 5 * 60 * 1000;

const MEDIA_KEYS = { imageMessage: "image", videoMessage: "video", audioMessage: "audio", documentMessage: "document", stickerMessage: "sticker" };
const WRAPPERS = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage", "editedMessage"];

const media = new Map(); // message id -> { file, kind, mimetype, fileName, caption, ptt, gif, bytes, cachedAt }
let totalBytes = 0;
const pending = new Map(); // message id -> promise of its media download (so a quick delete waits for it)
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Peel ephemeral / view-once / caption wrappers. @returns {{message:object, viewOnce:boolean}} */
function unwrap(message) {
  let cur = message || {};
  let viewOnce = false;
  for (let i = 0; i < 6; i++) {
    const w = WRAPPERS.find((k) => cur?.[k]?.message);
    if (!w) break;
    if (w.startsWith("viewOnce")) viewOnce = true;
    cur = cur[w].message;
  }
  if (cur?.imageMessage?.viewOnce || cur?.videoMessage?.viewOnce || cur?.audioMessage?.viewOnce) viewOnce = true;
  return { message: cur, viewOnce };
}

/** What kind of content is this? -> { kind, text, caption } */
function describeContent(message) {
  const { message: msg, viewOnce } = unwrap(message);
  const text = msg.conversation || msg.extendedTextMessage?.text || "";
  for (const [k, kind] of Object.entries(MEDIA_KEYS)) if (msg[k]) return { kind, text: "", caption: msg[k].caption || "", viewOnce, node: msg[k] };
  if (msg.contactMessage) return { kind: "contact", text: `Contact: ${msg.contactMessage.displayName || ""}`, caption: "", viewOnce };
  if (msg.contactsArrayMessage) return { kind: "contact", text: `${msg.contactsArrayMessage.contacts?.length || 0} contact(s)`, caption: "", viewOnce };
  if (msg.locationMessage) return { kind: "location", text: `Location: ${msg.locationMessage.degreesLatitude}, ${msg.locationMessage.degreesLongitude}`, caption: "", viewOnce };
  if (msg.pollCreationMessage || msg.pollCreationMessageV3) return { kind: "poll", text: `Poll: ${(msg.pollCreationMessage || msg.pollCreationMessageV3).name}`, caption: "", viewOnce };
  return { kind: "text", text, caption: "", viewOnce };
}

const enabled = (settings) => !!settings?.global?.antidelete?.enabled;

function sweep(keepId) {
  const now = Date.now();
  for (const [id, e] of media) {
    if (id !== keepId && now - e.cachedAt > TTL_MS) drop(id);
  }
  for (const id of [...media.keys()]) {
    if (totalBytes <= MAX_TOTAL_BYTES) break;
    if (id !== keepId) drop(id); // oldest first; the file just saved is never the one thrown away
  }
}
function drop(id) {
  const e = media.get(id);
  if (!e) return;
  media.delete(id);
  totalBytes = Math.max(0, totalBytes - (e.bytes || 0));
  fs.rm(e.file, { force: true }, () => {});
}

const sweeper = setInterval(sweep, 5 * 60 * 1000);
if (sweeper.unref) sweeper.unref();

/**
 * Called for every incoming message. Always keeps the text for AntiEdit/AntiDelete;
 * when AntiDelete is enabled it also saves downloadable media so it can be recovered.
 */
async function remember(sock, m, settings, { download = defaultDownload } = {}) {
  const id = m?.key?.id;
  if (!id || !automation.chatKind(m.key.remoteJid)) return; // status / broadcast / newsletter are never kept
  const c = describeContent(m.message);
  messageCache.store(id, {
    chat: m.key.remoteJid,
    sender: m.key.participant || m.key.remoteJid,
    fromMe: !!m.key.fromMe,
    text: c.text || c.caption || "",
    kind: c.kind,
    ts: (Number(m.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000
  });

  if (!enabled(settings) || !MEDIA_KEYS_SET.has(c.kind) || c.viewOnce) return;
  if (!automation.chatKind(m.key.remoteJid)) return;
  const declared = Number(c.node?.fileLength) || 0;
  if (declared && declared > MAX_FILE_BYTES) return; // only when the owner set ANTIDELETE_MAX_MEDIA_MB

  // Registered BEFORE the first await, so a delete that arrives while the file is still downloading waits for it.
  const job = saveMedia(sock, m, id, c, download);
  pending.set(id, job);
  try { await job; } finally { if (pending.get(id) === job) pending.delete(id); }
}

/** Download one message's media to disk (stream, so any size), with one retry. Never throws. */
async function saveMedia(sock, m, id, c, download) {
  const file = path.join(CACHE_DIR, id.replace(/[^A-Za-z0-9_-]/g, "_"));
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const data = await download(sock, m);
      if (!data) throw new Error("the download returned nothing");
      if (Buffer.isBuffer(data) || data instanceof Uint8Array) fs.writeFileSync(file, data);
      else await pipeline(data, fs.createWriteStream(file));
      const bytes = fs.statSync(file).size;
      if (!bytes) throw new Error("the downloaded file is empty");
      if (bytes > MAX_FILE_BYTES) { fs.rmSync(file, { force: true }); return; }
      media.set(id, { file, kind: c.kind, mimetype: c.node?.mimetype, fileName: c.node?.fileName, caption: c.caption, ptt: !!c.node?.ptt, gif: !!c.node?.gifPlayback, bytes, cachedAt: Date.now() });
      totalBytes += bytes;
      sweep(id);
      return;
    } catch (e) {
      fs.rmSync(file, { force: true });
      if (attempt === 2) console.error("⚠️ antidelete: couldn't save media:", e.message);
      else await sleepMs(1500);
    }
  }
}

/** Wait (up to DOWNLOAD_WAIT_MS) for a media download that is still running for this message. */
async function waitForSave(id) {
  const job = pending.get(id);
  if (!job) return;
  let timer;
  await Promise.race([job, new Promise((resolve) => { timer = setTimeout(resolve, DOWNLOAD_WAIT_MS); if (timer.unref) timer.unref(); })]);
  clearTimeout(timer);
}
const MEDIA_KEYS_SET = new Set(Object.values(MEDIA_KEYS));

async function defaultDownload(sock, m) {
  const { downloadMediaMessage } = require("baileys");
  return downloadMediaMessage(m, "stream", {}, { reuploadRequest: sock.updateMediaMessage }); // a stream: written to disk, never held in memory
}

/** Single place that decides whether a revoke event is reported. @returns {string|null} reason to ignore */
function ignoreReason(key, cached) {
  if (!automation.chatKind(key.remoteJid)) return "not a normal chat (status/broadcast/newsletter)";
  if (!cached) return "original never seen";
  if (botActivity.wasDeletedByBot(key.id)) return "deleted by the bot (moderation/command)";
  if (botActivity.wasSentByBot(key.id)) return "sent by the bot (system/feature message)";
  if (cached.fromMe) return "sent by the bot's own account";
  return null;
}

/**
 * Where recovered messages go: OWNER_1 / OWNER_2. If none is configured (e.g. the host has no way to set
 * the variable) they go to the bot account's own chat ("You"), which is the owner's phone when the bot
 * is linked to the owner's own WhatsApp.
 */
function ownerJids(sock) {
  const owners = [config.owner1, config.owner2].filter(Boolean).map((n) => `${n}@s.whatsapp.net`);
  if (owners.length) return owners;
  const self = sock?.user?.id;
  return self ? [`${self.split(":")[0].split("@")[0]}@s.whatsapp.net`] : [];
}

function formatTime(ts, tz = process.env.TZ) {
  try { return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) }); }
  catch { return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
}

function formatSender(jid) {
  const pn = identity.toPn(jid);
  return pn ? `+${pn}` : `@${String(jid || "").split("@")[0].split(":")[0]} (number hidden by WhatsApp)`;
}

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "application/pdf": ".pdf" };

/** Send one recovered file. If WhatsApp refuses it as an image/video/audio (size, format), it goes as a document instead. */
async function deliverMedia(sock, owner, saved, data, header, caption) {
  sock = require("./channelButton").withoutButton(sock); // recovered messages are forwarded as they were
  const asDocument = () => sock.sendMessage(owner, {
    document: data,
    mimetype: saved.mimetype || "application/octet-stream",
    fileName: saved.fileName || `deleted-${saved.kind}${EXT[String(saved.mimetype || "").split(";")[0].trim()] || ""}`,
    caption
  });
  try {
    if (saved.kind === "image") await sock.sendMessage(owner, { image: data, caption });
    else if (saved.kind === "video") await sock.sendMessage(owner, { video: data, caption, gifPlayback: saved.gif });
    else if (saved.kind === "document") await asDocument();
    else if (saved.kind === "audio") { await sock.sendMessage(owner, { text: `${header}\n\n📩 Deleted voice/audio message ⬇️` }); await sock.sendMessage(owner, { audio: data, mimetype: saved.mimetype || "audio/ogg; codecs=opus", ptt: saved.ptt }); }
    else if (saved.kind === "sticker") { await sock.sendMessage(owner, { text: `${header}\n\n📩 Deleted sticker ⬇️` }); await sock.sendMessage(owner, { sticker: data }); }
  } catch (e) {
    if (!["image", "video", "audio"].includes(saved.kind)) throw e;
    console.error(`⚠️ antidelete: sending it as a ${saved.kind} failed (${e.message}); sending it as a file instead`);
    await asDocument();
  }
}

/**
 * A message was deleted for everyone.
 * @returns {Promise<{sent:boolean, reason?:string}>}
 */
async function handleDelete(sock, update, settings) {
  sock = require("./channelButton").withoutButton(sock); // recovery notices are system messages
  const key = update.key;
  if (!enabled(settings)) return { sent: false, reason: "disabled" };
  await waitForSave(key.id); // a big file may still be downloading when the sender deletes it
  const cached = messageCache.get(key.id);
  const why = ignoreReason(key, cached);
  if (why) { if (why !== "not a normal chat (status/broadcast/newsletter)") console.log(`🗑️ antidelete: not reported (${why})`); return { sent: false, reason: why }; }

  const owners = ownerJids(sock);
  if (!owners.length) { console.error("⚠️ antidelete: no owner and no bot account known, nowhere to send recovered messages"); return { sent: false, reason: "no owner" }; }

  const isGroup = key.remoteJid.endsWith("@g.us");
  let chatName = "Private Chat";
  if (isGroup) {
    try { chatName = (await identity.getMetadata(sock, key.remoteJid)).subject || "Group"; } catch { chatName = "Group"; }
  }
  const deleter = update.update?.key?.participant || key.participant;
  const header = [
    "🗑️ ANTI-DELETE", "",
    `👤 Sender: ${formatSender(cached.sender)}`,
    `💬 Chat: ${isGroup ? `${chatName} (group)` : "Private Chat"}`,
    `🕐 Time: ${formatTime(cached.ts || cached.cachedAt)}`,
    deleter && identity.keysOf(deleter)[0] !== identity.keysOf(cached.sender)[0] ? `🧹 Deleted by: ${formatSender(deleter)}` : null
  ].filter((l) => l !== null && l !== undefined && l !== false).join("\n"); // keep the blank line under the title

  const saved = media.get(key.id);
  let delivered = false;
  for (const owner of owners) {
    try {
      if (saved && fs.existsSync(saved.file)) {
        const data = saved.bytes <= SEND_FROM_MEMORY_UP_TO ? fs.readFileSync(saved.file) : { url: saved.file };
        const caption = `${header}\n\n📩 Deleted message:${saved.caption ? `\n${saved.caption}` : ""}`.slice(0, 1000);
        await deliverMedia(sock, owner, saved, data, header, caption);
        if (saved.caption && saved.caption.length > 700) await sock.sendMessage(owner, { text: `Full caption of the deleted ${saved.kind}:\n${saved.caption}` });
      } else {
        const body = cached.text
          ? `📩 Deleted message:\n${cached.text}`
          : MEDIA_KEYS_SET.has(cached.kind)
            ? `📩 Deleted ${cached.kind} — it was too large, expired from my short cache, or arrived before AntiDelete was on, so I can't recover the file.`
            : "📩 Deleted message: (no recoverable content)";
        await sock.sendMessage(owner, { text: `${header}\n\n${body}` });
      }
      delivered = true;
    } catch (e) {
      console.error("❌ antidelete: couldn't deliver to owner:", e.message);
    }
  }
  drop(key.id);
  console.log(delivered ? `🗑️ antidelete: recovered a deleted ${saved ? saved.kind : cached.kind || "message"} and sent it to ${owners.length} owner chat(s)` : "🗑️ antidelete: delivery failed");
  return { sent: delivered, reason: delivered ? undefined : "delivery failed" };
}

module.exports = { remember, handleDelete, waitForSave, ignoreReason, describeContent, unwrap, enabled, formatTime, _media: media, CACHE_DIR };
