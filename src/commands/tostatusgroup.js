// src/commands/tostatusgroup.js (the command is .togroupstatus) — post a REAL group status in the current group (groupStatusMessageV2).
//   .togroupstatus <text>                 text status
//   .togroupstatus <color> <text>         text status with that background colour (colour NAME, e.g. red, "dark blue")
//   .togroupstatus bg:<color> font:<0-5> <text>
//   .togroupstatus <caption>              + attach a photo/video, OR reply to a photo / video / voice note
//   .togroupstatus colors                 list colour names
const { downloadMediaMessage } = require("baileys");
const { describeContent } = require("../utils/antiDelete");
const { sendGroupStatus } = require("../utils/groupStatus");
const { resolveColor, POPULAR, count } = require("../utils/colors");
const { panel } = require("../utils/ui");

const TITLE = "📣 GROUP STATUS";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const deps = { download: (sock, msg) => downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage, logger: sock.logger }) };

/**
 * Leading option tokens (bg:red, color=red, font:2) first; otherwise a leading colour NAME
 * (one word, or two like "dark blue") when text follows it.
 * @returns {{text:string, color:string|null, colorName:string|null, font:number|null, error:string|null, list:boolean}}
 */
function parseArgs(args) {
  const out = { text: "", color: null, colorName: null, font: null, error: null, list: false };
  const t = [...args];
  if (t.length === 1 && /^colou?rs?$/i.test(t[0])) { out.list = true; return out; }

  while (t.length) {
    const mc = /^(?:bg|color|colour|background)[:=](.*)$/i.exec(t[0]);
    const mf = /^font[:=](\d)$/i.exec(t[0]);
    if (mc) {
      const hex = resolveColor(mc[1]);
      if (!hex) { out.error = `Unknown colour "${mc[1]}". Send .togroupstatus colors to see names.`; return out; }
      out.color = hex; out.colorName = mc[1].toLowerCase(); t.shift();
    } else if (mf) {
      const f = Number(mf[1]);
      if (f > 5) { out.error = "Font must be 0–5."; return out; }
      out.font = f; t.shift();
    } else break;
  }
  if (!out.color && t.length >= 2) {
    const two = t.length >= 3 ? resolveColor(t[0] + t[1]) : null; // "dark blue text…" (needs text after it)
    if (two) { out.color = two; out.colorName = `${t[0]} ${t[1]}`.toLowerCase(); t.splice(0, 2); }
    else { const one = resolveColor(t[0]); if (one) { out.color = one; out.colorName = t[0].toLowerCase(); t.shift(); } }
  }
  out.text = t.join(" ").trim();
  return out;
}

/** Find media attached to this message or in the message it replies to. */
function findMedia(m) {
  const direct = describeContent(m.message);
  if (["image", "video", "audio"].includes(direct.kind) || ["document", "sticker"].includes(direct.kind)) return { kind: direct.kind, caption: direct.caption, viewOnce: direct.viewOnce, source: m, node: direct.node };

  let ctx = null;
  const inner = m.message || {};
  for (const v of Object.values(inner)) if (v && typeof v === "object" && v.contextInfo?.quotedMessage) { ctx = v.contextInfo; break; }
  if (!ctx) return null;
  const q = describeContent(ctx.quotedMessage);
  if (!["image", "video", "audio", "document", "sticker"].includes(q.kind)) return null;
  return {
    kind: q.kind, caption: q.caption, viewOnce: q.viewOnce, node: q.node,
    source: { key: { remoteJid: m.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false }, message: ctx.quotedMessage }
  };
}

module.exports = {
  name: "togroupstatus",
  scope: "GROUP",
  owner: true,
  description: "Post a real group status (text with a colour name, photo, video or voice note). Usage: .togroupstatus [color] <text> — or attach/reply to media",
  _deps: deps,
  parseArgs,

  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const reply = (lines) => sock.sendMessage(chat, { text: panel(TITLE, lines) });
    const p = parseArgs(args);

    if (p.list) return reply([`🎨 ${count} colour names work, e.g.:`, POPULAR.join(", "), "", "Any CSS colour name works (also two words: dark blue, light green).", "Use: .togroupstatus red Hello everyone"]);
    if (p.error) return reply([`❌ ${p.error}`]);

    const media = findMedia(m);

    // ---- media status ----
    if (media) {
      if (media.viewOnce) return reply(["❌ View-once media can't be posted as a status."]);
      if (!["image", "video", "audio"].includes(media.kind)) return reply(["❌ I can post text, photos, videos and voice notes — not documents or stickers."]);
      const declared = Number(media.node?.fileLength) || 0;
      if (declared > MAX_MEDIA_BYTES) return reply([`❌ That file is too large (max ${MAX_MEDIA_BYTES / 1024 / 1024}MB).`]);
      let buffer;
      try { buffer = await deps.download(sock, media.source); } catch (e) {
        console.error("❌ group status: media download failed:", e.message);
        return reply(["❌ I couldn't download that media (it may have expired). Send it again."]);
      }
      if (!buffer?.length) return reply(["❌ I couldn't read that media."]);
      if (buffer.length > MAX_MEDIA_BYTES) return reply([`❌ That file is too large (max ${MAX_MEDIA_BYTES / 1024 / 1024}MB).`]);

      const caption = p.text || media.caption || "";
      const mime = media.node?.mimetype;
      const content =
        media.kind === "image" ? { image: buffer, caption } :
        media.kind === "video" ? { video: buffer, caption, gifPlayback: !!media.node?.gifPlayback } :
        { audio: buffer, mimetype: mime || "audio/ogg; codecs=opus", ptt: true };
      const label = media.kind === "image" ? "photo" : media.kind === "video" ? "video" : "voice note";
      try {
        await sendGroupStatus(sock, chat, content, p.color ? { backgroundColor: p.color } : {});
      } catch (e) {
        console.error("❌ group status failed:", e.message);
        return reply([`❌ I couldn't post the ${label} as a group status: ${e.message}`]);
      }
      return reply([`✅ ${label[0].toUpperCase() + label.slice(1)} sent as a group status.`, "ℹ️ WhatsApp doesn't confirm delivery to bots — check the group's status tab."]);
    }

    // ---- text status ----
    if (!p.text) {
      return reply(["Usage:", ".togroupstatus <text>", ".togroupstatus <color> <text>   e.g. .togroupstatus red Hello!", ".togroupstatus bg:darkblue font:2 <text>", "Attach a photo/video, or reply to media (or a voice note), to post it.", "Colour names: .togroupstatus colors"]);
    }
    const options = { ...(p.color ? { backgroundColor: p.color } : { backgroundColor: "#313335" }), ...(p.font !== null ? { font: p.font } : { font: 1 }) };
    try {
      await sendGroupStatus(sock, chat, { text: p.text }, options);
    } catch (e) {
      console.error("❌ group status failed:", e.message);
      return reply([`❌ I couldn't post the status: ${e.message}`]);
    }
    return reply(["✅ Text sent as a group status.", p.color ? `🎨 Background: ${p.colorName}` : null, "ℹ️ WhatsApp doesn't confirm delivery to bots — check the group's status tab."]);
  }
};
