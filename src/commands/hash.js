// src/commands/hash.js — .hash [md5|sha1|sha256|sha512] <text>   (or reply to a text, or to a file)
const crypto = require("crypto");
const { repliedText, mediaOf, download, size } = require("../utils/quoted");
const { panel } = require("../utils/ui");

const ALGOS = ["md5", "sha1", "sha256", "sha512"];
const MAX_FILE = 50 * 1024 * 1024;

module.exports = {
  name: "hash",
  scope: "BOTH",
  description: "Hash text or a file. Usage: .hash [md5|sha1|sha256|sha512] <text>  (or reply to a text / file)",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const reply = (lines) => sock.sendMessage(chat, { text: panel("🔐 HASH", lines) });
    let algo = "sha256";
    if (args[0] && ALGOS.includes(args[0].toLowerCase())) algo = args.shift().toLowerCase();

    let data, label;
    const typed = args.join(" ");
    if (typed) { data = Buffer.from(typed, "utf8"); label = `text (${data.length} bytes)`; }
    else {
      const media = mediaOf(m);
      if (media) {
        if (Number(media.node.fileLength) > MAX_FILE) return reply([`❌ That file is too large to hash here (max ${size(MAX_FILE)}).`]);
        try { data = await download(sock, media.source); } catch { return reply(["❌ I couldn't download that file (it may have expired)."]); }
        label = `${media.node.fileName || media.kind} (${size(data.length)})`;
      } else {
        const t = repliedText(m);
        if (!t) return reply([`Usage: .hash [${ALGOS.join("|")}] <text>`, "or reply to a text message / a file.", "Default: sha256."]);
        data = Buffer.from(t, "utf8"); label = `replied text (${data.length} bytes)`;
      }
    }
    const digest = crypto.createHash(algo).update(data).digest("hex");
    return reply([`Algorithm: ${algo.toUpperCase()}`, `Input: ${label}`, "", "`" + digest + "`"]);
  }
};
