// src/utils/quoted.js — "the message this command is about": the one it replies to (or itself, if it carries media).
const { downloadMediaMessage } = require("baileys");
const { describeContent, unwrap } = require("./antiDelete");

const deps = { download: (sock, msg) => downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage, logger: sock.logger }) };

/** contextInfo of the message being replied to, or null. */
function replyContext(m) {
  const inner = unwrap(m.message).message || {};
  for (const v of Object.values(inner)) if (v && typeof v === "object" && v.contextInfo?.quotedMessage) return v.contextInfo;
  return null;
}

/** Text of the replied-to message ("" if none). */
function repliedText(m) {
  const ctx = replyContext(m);
  if (!ctx) return "";
  const q = unwrap(ctx.quotedMessage).message || {};
  return q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || q.documentMessage?.caption || "";
}

/**
 * Media attached to the command message itself, else in the message it replies to.
 * @returns {{kind:string, node:object, caption:string, viewOnce:boolean, source:object}|null}
 */
function mediaOf(m, kinds = ["image", "video", "audio", "document", "sticker"]) {
  const own = describeContent(m.message);
  if (kinds.includes(own.kind) && own.node) return { kind: own.kind, node: own.node, caption: own.caption, viewOnce: own.viewOnce, source: m };
  const ctx = replyContext(m);
  if (!ctx) return null;
  const q = describeContent(ctx.quotedMessage);
  if (!kinds.includes(q.kind) || !q.node) return null;
  return { kind: q.kind, node: q.node, caption: q.caption, viewOnce: q.viewOnce, source: { key: { remoteJid: m.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false }, message: ctx.quotedMessage } };
}

const download = (sock, source) => deps.download(sock, source);

const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + " MB" : n >= 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B");

module.exports = { replyContext, repliedText, mediaOf, download, size, _deps: deps };
