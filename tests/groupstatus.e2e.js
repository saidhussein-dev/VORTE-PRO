// Real group status (groupStatusMessageV2): parsing, colour NAMES, media, permissions. Run: node tests/groupstatus.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore, texts, lastText, G, jidOf } = M;
const baileys = require("baileys");
const handler = require("../src/bot/handlers/commandHandler");
const cmd = require("../src/commands/tostatusgroup");
const colors = require("../src/utils/colors");
const zlib = require("zlib");

// a real 1x1 PNG (so Baileys' image processing has something valid to chew on)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function statusSock(opts) {
  const s = makeSock(opts);
  s.relayed = []; s.uploads = [];
  s.waUploadToServer = async (stream, o) => { s.uploads.push(o?.mediaType); return { mediaUrl: "https://mmg.whatsapp.net/v/t62/x", directPath: "/v/t62/x", handle: "h" }; };
  s.relayMessage = async (jid, message, o) => { s.relayed.push({ jid, message, o }); return o?.messageId; };
  return s;
}
const run = async (sock, m, store = makeStore()) => { await handler.handle(sock, m, m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "", store.getSettings, store.saveSettings); };
const wrapped = (s) => s.relayed[0]?.message?.groupStatusMessageV2?.message;
const withMedia = (n, text, node, kind) => ({ key: { remoteJid: G, participant: jidOf(n), id: "MEDIA" + Math.random(), fromMe: false, participantAlt: "255700000001@s.whatsapp.net" }, message: { [kind]: { caption: text, mimetype: "image/png", fileLength: PNG.length, ...node } } });
const replyTo = (n, text, quotedMessage) => ({ key: { remoteJid: G, participant: jidOf(n), id: "R" + Math.random(), fromMe: false, participantAlt: "255700000001@s.whatsapp.net" }, message: { extendedTextMessage: { text, contextInfo: { stanzaId: "ORIG1", participant: jidOf(3), quotedMessage } } } });

(async () => {
  section("colour NAMES");
  check(`${colors.count} names known (148 CSS + whatsapp)`, colors.count === 149);
  check("red -> #ff0000", colors.resolveColor("red") === "#ff0000");
  check("case/space/hyphen tolerant: 'Dark Blue' -> darkblue", colors.resolveColor("Dark Blue") === "#00008b" && colors.resolveColor("dark-blue") === "#00008b");
  check("unknown name -> null", colors.resolveColor("blurple") === null);

  section("argument parsing");
  let p = cmd.parseArgs(["red", "Hello", "everyone"]);
  check("'red Hello everyone' -> red + text", p.color === "#ff0000" && p.text === "Hello everyone" && !p.error, p);
  p = cmd.parseArgs(["dark", "blue", "Night", "mode"]);
  check("two-word colour 'dark blue' + text", p.color === "#00008b" && p.text === "Night mode", p);
  p = cmd.parseArgs(["Hello", "red", "world"]);
  check("colour word NOT first stays in the text", p.color === null && p.text === "Hello red world");
  p = cmd.parseArgs(["red"]);
  check("lone colour word is just the text", p.color === null && p.text === "red");
  p = cmd.parseArgs(["bg:teal", "font:3", "Styled", "text"]);
  check("bg:<name> font:<n> options", p.color === "#008080" && p.font === 3 && p.text === "Styled text", p);
  p = cmd.parseArgs(["color=gold", "x"]);
  check("color=<name> form", p.color === "#ffd700");
  p = cmd.parseArgs(["bg:notacolor", "x"]);
  check("explicit unknown colour -> clear error", /Unknown colou?r "notacolor"/.test(p.error), p);
  p = cmd.parseArgs(["font:9", "x"]);
  check("font out of range -> error", !!p.error);
  check("'colors' lists names", cmd.parseArgs(["colors"]).list === true);

  section("TEXT status is a real groupStatusMessageV2 relayed to the group");
  let s = statusSock(), st = makeStore();
  await run(s, groupMsg(1, ".togroupstatus red Hello everyone"), st);
  let inner = wrapped(s);
  check("relayed once, to the GROUP jid", s.relayed.length === 1 && s.relayed[0].jid === G, s.relayed.map((r) => r.jid));
  check("wrapped in groupStatusMessageV2.message", !!inner && !s.relayed[0].message.groupStatusMessage, Object.keys(s.relayed[0]?.message || {}));
  check("inner text status carries the text", inner?.extendedTextMessage?.text === "Hello everyone", inner);
  check("background = RED (0xFFFF0000) taken from the colour NAME", inner?.extendedTextMessage?.backgroundArgb === 0xFFFF0000, inner?.extendedTextMessage?.backgroundArgb);
  check("a message id is supplied", /^[A-Z0-9]{10,}$/i.test(s.relayed[0].o.messageId || ""), s.relayed[0].o);
  check("encodes/decodes as valid protobuf", (() => { const enc = baileys.proto.Message.encode(baileys.proto.Message.fromObject(s.relayed[0].message)).finish(); const dec = baileys.proto.Message.decode(enc); return dec.groupStatusMessageV2.message.extendedTextMessage.text === "Hello everyone"; })());
  check("success reply says so (and is honest about delivery)", /✅ Text sent as a group status/.test(lastText(s)) && /Background: red/.test(lastText(s)) && /doesn't confirm delivery/.test(lastText(s)), lastText(s));
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus dark blue Night mode"), st);
  check("'dark blue' (two words) -> #00008b", wrapped(s)?.extendedTextMessage?.backgroundArgb === 0xFF00008B, wrapped(s));
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus font:2 Plain text"), st);
  check(".togroupstatus works; default background applied; font 2", wrapped(s)?.extendedTextMessage?.font === 2 && wrapped(s)?.extendedTextMessage?.backgroundArgb === 0xFF313335, wrapped(s));
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus"), st);
  check("no text/media -> usage, nothing sent", s.relayed.length === 0 && /Usage:/.test(lastText(s)) && /colors/.test(lastText(s)));
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus colors"), st);
  check(".togroupstatus colors -> list", /149 colour names/.test(lastText(s)) && /whatsapp/.test(lastText(s)) && s.relayed.length === 0, lastText(s));
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus bg:blurple hi"), st);
  check("unknown colour name -> error, nothing sent", s.relayed.length === 0 && /Unknown colou?r "blurple"/.test(lastText(s)));
  s = statusSock({ lid: true }); s.relayMessage = async () => { throw new Error("rate-overlimit"); };
  await run(s, groupMsg(1, ".togroupstatus hello"), st);
  check("WhatsApp error -> honest failure message", /❌ I couldn't post the status: rate-overlimit/.test(lastText(s)), lastText(s));
  process.env.GROUP_STATUS_FIELD = "v1";
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus hello"), st);
  check("GROUP_STATUS_FIELD=v1 switches to groupStatusMessage", !!s.relayed[0]?.message?.groupStatusMessage && !s.relayed[0]?.message?.groupStatusMessageV2);
  delete process.env.GROUP_STATUS_FIELD;

  section("MEDIA status: photo attached to the command");
  cmd._deps.download = async () => PNG;
  s = statusSock(); await run(s, withMedia(1, ".togroupstatus Look at this", {}, "imageMessage"), st);
  inner = wrapped(s);
  check("image uploaded and relayed inside the group status wrapper", s.uploads.includes("image") && !!inner?.imageMessage, { uploads: s.uploads, keys: Object.keys(inner || {}) });
  check("caption = the command text", inner?.imageMessage?.caption === "Look at this", inner?.imageMessage?.caption);
  check("media key / url present (a real, uploadable image message)", !!inner?.imageMessage?.mediaKey && /mmg\.whatsapp\.net/.test(inner.imageMessage.url || ""), Object.keys(inner?.imageMessage || {}));
  check("reply says photo sent", /✅ Photo sent as a group status/.test(lastText(s)), lastText(s));
  check("the photo is ALSO posted in the group chat itself", s.sent.some((x) => x.jid === G && x.content.image && x.content.caption === "Look at this"), s.sent.map((x) => [x.jid, Object.keys(x.content)]));
  check("reply says it was also posted in the chat", /posted in this chat/.test(lastText(s)), lastText(s));

  section("MEDIA status: reply to a photo / video / voice note");
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { imageMessage: { caption: "original caption", mimetype: "image/png", fileLength: PNG.length } }), st);
  check("replied image posted with its ORIGINAL caption", wrapped(s)?.imageMessage?.caption === "original caption", wrapped(s));
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus New caption", { imageMessage: { caption: "old", mimetype: "image/png", fileLength: PNG.length } }), st);
  check("command text overrides the caption", wrapped(s)?.imageMessage?.caption === "New caption");
  let dl = null; cmd._deps.download = async (sock, msg) => { dl = msg; return PNG; };
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { imageMessage: { mimetype: "image/png", fileLength: 10 } }), st);
  check("the REPLIED message is what gets downloaded (key.id = stanzaId)", dl?.key?.id === "ORIG1" && dl?.key?.remoteJid === G, dl?.key);
  cmd._deps.download = async () => Buffer.from("fakevideo");
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus Clip", { videoMessage: { mimetype: "video/mp4", fileLength: 9, gifPlayback: false } }), st);
  check("video is ALSO posted in the group chat", s.sent.some((x) => x.jid === G && x.content.video), s.sent.map((x) => Object.keys(x.content)));
  check("video: uploaded as video, relayed in the wrapper", s.uploads.includes("video") && !!wrapped(s)?.videoMessage && wrapped(s).videoMessage.caption === "Clip", { uploads: s.uploads, lastText: lastText(s), keys: Object.keys(wrapped(s) || {}) });
  cmd._deps.download = async () => Buffer.from("fakeaudio");
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true, fileLength: 9 } }), st);
  check("voice note is ALSO posted in the group chat", s.sent.some((x) => x.jid === G && x.content.audio));
  check("voice note: posted as audio with ptt=true", !!wrapped(s)?.audioMessage && wrapped(s).audioMessage.ptt === true, { lastText: lastText(s), keys: Object.keys(wrapped(s) || {}) });
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { documentMessage: { mimetype: "application/pdf" } }), st);
  check("document -> refused clearly, nothing sent", s.relayed.length === 0 && /not documents or stickers/.test(lastText(s)));
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { stickerMessage: {} }), st);
  check("sticker -> refused clearly", s.relayed.length === 0 && /not documents or stickers/.test(lastText(s)));
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mimetype: "image/png" } } } }), st);
  check("view-once media -> refused (privacy)", s.relayed.length === 0 && /View-once/.test(lastText(s)), lastText(s));
  cmd._deps.download = async () => { throw new Error("expired"); };
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { imageMessage: { mimetype: "image/png", fileLength: 5 } }), st);
  check("download failure -> clear message", s.relayed.length === 0 && /couldn't download that media/.test(lastText(s)));
  cmd._deps.download = async () => PNG;
  s = statusSock(); await run(s, replyTo(1, ".togroupstatus", { imageMessage: { mimetype: "image/png", fileLength: 80 * 1024 * 1024 } }), st);
  check("oversized media -> refused before downloading", s.relayed.length === 0 && /too large/.test(lastText(s)));

  section("permissions / context");
  s = statusSock(); await run(s, groupMsg(2, ".togroupstatus hi"), st);
  check("group ADMIN -> owner only", lastText(s) === "🚫 Only the bot owner can use this command." && s.relayed.length === 0);
  s = statusSock(); await run(s, groupMsg(3, ".togroupstatus hi"), st);
  check("MEMBER -> owner only", lastText(s) === "🚫 Only the bot owner can use this command." && s.relayed.length === 0);
  s = statusSock(); await run(s, privateMsg(".togroupstatus hi"), st);
  check("in PRIVATE -> 'can only be used in a group'", lastText(s) === "⚠️ This command can only be used in a group." && s.relayed.length === 0);
  s = statusSock(); await run(s, groupMsg(1, ".togroupstatus hi"), st);
  check("OWNER -> works", s.relayed.length === 1);

  done();
})().catch((e) => { console.error(e); process.exit(1); });
