// src/commands/fileinfo.js — reply to (or send with) a photo / video / audio / document / sticker
const { mediaOf, size } = require("../utils/quoted");
const { panel } = require("../utils/ui");

const dur = (s) => { s = Math.round(Number(s) || 0); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
const KIND = { image: "Photo", video: "Video", audio: "Audio", document: "Document", sticker: "Sticker" };

module.exports = {
  name: "fileinfo",
  scope: "BOTH",
  description: "Details of a file. Usage: reply to a photo / video / audio / document / sticker with .fileinfo",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const media = mediaOf(m);
    if (!media) return sock.sendMessage(chat, { text: panel("📎 FILE INFO", ["Reply to a photo, video, audio, document or sticker with .fileinfo."]) });
    const n = media.node;
    const lines = [
      `Type: ${KIND[media.kind]}${n.ptt ? " (voice note)" : ""}${n.isAnimated || n.gifPlayback ? " (animated)" : ""}${media.viewOnce ? " (view-once)" : ""}`,
      n.fileName ? `Name: ${n.fileName}` : null,
      n.mimetype ? `Mime: ${n.mimetype}` : null,
      n.fileLength ? `Size: ${size(Number(n.fileLength))}` : null,
      n.width && n.height ? `Dimensions: ${n.width} × ${n.height}` : null,
      n.seconds ? `Duration: ${dur(n.seconds)}` : null,
      n.pageCount ? `Pages: ${n.pageCount}` : null,
      media.caption ? `Caption: ${media.caption.length > 80 ? media.caption.slice(0, 80) + "…" : media.caption}` : null,
      n.fileSha256 ? `SHA-256: ${Buffer.from(n.fileSha256).toString("hex")}` : null
    ].filter(Boolean);
    await sock.sendMessage(chat, { text: panel("📎 FILE INFO", lines) });
  }
};
