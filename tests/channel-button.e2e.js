// The "View Channel" button on every kind of output, built with REAL Baileys message builders.
// A fake socket records what is relayed (button messages) and what is sent as is (everything else).
// Run: node tests/channel-button.e2e.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const M = require("./_mock");
const { check, section, done, privateMsg, makeStore } = M;
const config = require("../src/config/config");
const cb = require("../src/utils/channelButton");
const botActivity = require("../src/utils/botActivity");

const URL = "https://whatsapp.com/channel/0029VbBqa4HHbFVBar2vwO3H";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
const tmp = (name, bytes = 64) => { const p = path.join(os.tmpdir(), `cb-${process.pid}-${name}`); fs.writeFileSync(p, Buffer.alloc(bytes, 7)); return p; };

function wrappedSock({ failRelay = false, noRelay = false } = {}) {
  const log = [];          // everything, in order: { how: "plain"|"relay", ... }
  let n = 0;
  const sock = {
    log,
    user: { id: "255700009999:7@s.whatsapp.net", lid: "9099:7@lid" },
    logger: { info() {}, debug() {}, warn() {}, error() {}, trace() {}, child() { return this; } },
    waUploadToServer: async (_f, { mediaType, fileEncSha256B64 }) => ({ mediaUrl: "https://mmg.whatsapp.net/" + mediaType, directPath: `/v/${mediaType}/${String(fileEncSha256B64).slice(0, 6)}` }),
    sendMessage: async (jid, content, opts) => { const r = { key: { id: "P" + ++n, remoteJid: jid, fromMe: true }, message: {} }; log.push({ how: "plain", jid, content, opts, result: r }); return r; },
    relayMessage: async (jid, message, opts) => { if (failRelay) throw new Error("relay refused"); log.push({ how: "relay", jid, message, opts }); return opts.messageId; }
  };
  if (noRelay) delete sock.relayMessage;
  botActivity.install(sock);
  return sock;
}
const plains = (s) => s.log.filter((x) => x.how === "plain");
const relays = (s) => s.log.filter((x) => x.how === "relay");
const im = (r) => r.message.interactiveMessage;
const buttons = (r) => im(r).nativeFlowMessage.buttons.map((b) => ({ name: b.name, ...JSON.parse(b.buttonParamsJson) }));
const hasChannel = (r) => buttons(r).filter((b) => b.name === "cta_url" && b.url === URL && b.display_text === "View Channel").length === 1;
const CHAT = "255700000123@s.whatsapp.net";
const GRP = "120363000000000001@g.us";

(async () => {
  section("one channel URL for the whole bot");
  check("config has the channel URL", config.channel.url === URL, config.channel.url);
  check("the shared button is a cta_url 'View Channel' pointing at it", (() => { const b = cb.channelLink(); const p = JSON.parse(b.buttonParamsJson); return b.name === "cta_url" && p.display_text === "View Channel" && p.url === URL && p.merchant_url === URL; })());
  check("the old third-party helper is no longer required", !/zqbaileys/.test(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")) && !/zqbaileys/.test(fs.readFileSync(path.join(__dirname, "../src/utils/botActivity.js"), "utf8")));

  section("TEXT: command results and errors carry the button");
  let s = wrappedSock();
  let r = await s.sendMessage(CHAT, { text: "🏓 Pong! 12ms" });
  check("text -> ONE interactive message, nothing sent plain", relays(s).length === 1 && plains(s).length === 0, s.log.map((x) => x.how));
  check("body is the text, footer VORTE PRO, button present once", im(relays(s)[0]).body.text === "🏓 Pong! 12ms" && im(relays(s)[0]).footer.text === "VORTE PRO" && hasChannel(relays(s)[0]), buttons(relays(s)[0]));
  check("private chat: biz + bot nodes attached", relays(s)[0].opts.additionalNodes.some((x) => x.tag === "biz") && relays(s)[0].opts.additionalNodes.some((x) => x.tag === "bot"));
  check("the returned message has an id and is recognised as the bot's own", !!r?.key?.id && botActivity.wasSentByBot(r.key.id), r?.key);

  s = wrappedSock();
  await s.sendMessage(GRP, { text: "❌ Owner only command." }, { quoted: { key: { id: "Q1", remoteJid: GRP, participant: "255700000777@s.whatsapp.net" }, message: { conversation: ".mode" } } });
  check("error text in a group: button + the reply stays quoted", hasChannel(relays(s)[0]) && im(relays(s)[0]).contextInfo?.stanzaId === "Q1", im(relays(s)[0]).contextInfo);
  check("group: biz node but NO bot node", relays(s)[0].opts.additionalNodes.some((x) => x.tag === "biz") && !relays(s)[0].opts.additionalNodes.some((x) => x.tag === "bot"));

  s = wrappedSock();
  await s.sendMessage(CHAT, { text: "pick one", interactiveButtons: [cb.link("Docs", "https://example.com")] });
  check("a message that already has buttons keeps them and gains the channel button", JSON.stringify(buttons(relays(s)[0]).map((b) => b.display_text)) === JSON.stringify(["Docs", "View Channel"]), buttons(relays(s)[0]));
  s = wrappedSock();
  await s.sendMessage(CHAT, { text: "again", interactiveButtons: [cb.channelLink()] });
  check("the channel button is never added twice", buttons(relays(s)[0]).length === 1, buttons(relays(s)[0]));

  section("TEXT: things that must stay exactly as they are");
  s = wrappedSock();
  await s.sendMessage(GRP, { text: "hi @255700000001", mentions: ["255700000001@s.whatsapp.net"] });
  check("a message that tags people is sent plain (tags would be lost)", plains(s).length === 1 && relays(s).length === 0 && plains(s)[0].content.mentions.length === 1);
  s = wrappedSock();
  await s.sendMessage(CHAT, { text: "   " });
  check("empty text is left alone", plains(s).length === 1 && relays(s).length === 0);
  s = wrappedSock();
  const long = "x".repeat(1500);
  await s.sendMessage(CHAT, { text: long });
  check("long text: sent in full and unchanged FIRST", s.log[0].how === "plain" && s.log[0].content.text === long);
  check("...then a separate message carries the button", s.log[1]?.how === "relay" && hasChannel(s.log[1]) && s.log.length === 2, s.log.map((x) => x.how));

  section("MEDIA: image / video / document");
  s = wrappedSock();
  await s.sendMessage(CHAT, { image: PNG, caption: "✨ a cat" });
  let rr = relays(s)[0];
  check("image + caption -> ONE message, picture in the header", relays(s).length === 1 && plains(s).length === 0 && !!im(rr).header?.imageMessage && im(rr).header.hasMediaAttachment === true, Object.keys(im(rr).header || {}));
  check("...caption is the body, the file was uploaded, button present", im(rr).body.text === "✨ a cat" && !!im(rr).header.imageMessage.directPath && !!im(rr).header.imageMessage.mediaKey && hasChannel(rr));
  s = wrappedSock();
  await s.sendMessage(CHAT, { image: PNG });
  check("image WITHOUT caption also gets the button", relays(s).length === 1 && hasChannel(relays(s)[0]) && im(relays(s)[0]).body.text === "VORTE PRO");
  s = wrappedSock();
  const vid = tmp("v.mp4", 4096);
  await s.sendMessage(CHAT, { video: { url: vid }, caption: "🎬 clip", gifPlayback: false }, { quoted: { key: { id: "Q2", remoteJid: CHAT }, message: { conversation: ".yt" } } });
  rr = relays(s)[0];
  check("video streamed from a file path -> header video + caption + button", relays(s).length === 1 && !!im(rr).header?.videoMessage && im(rr).body.text === "🎬 clip" && hasChannel(rr), Object.keys(im(rr)?.header || {}));
  check("...and the quote is kept", im(rr).contextInfo?.stanzaId === "Q2");
  s = wrappedSock();
  const doc = tmp("d.pdf", 2048);
  await s.sendMessage(CHAT, { document: { url: doc }, mimetype: "application/pdf", fileName: "notes.pdf", caption: "📄 notes" });
  rr = relays(s)[0];
  check("document -> header document keeps its file name and type", !!im(rr).header?.documentMessage && im(rr).header.documentMessage.fileName === "notes.pdf" && im(rr).header.documentMessage.mimetype === "application/pdf" && hasChannel(rr), im(rr)?.header?.documentMessage);
  s = wrappedSock();
  await s.sendMessage(CHAT, { image: PNG, caption: "y".repeat(1400) });
  check("very long caption: media sent as is, then the button message", s.log[0].how === "plain" && !!s.log[0].content.image && s.log[1]?.how === "relay" && hasChannel(s.log[1]));
  s = wrappedSock();
  await s.sendMessage(CHAT, { image: PNG, caption: "once", viewOnce: true });
  check("view-once media is untouched", plains(s).length === 1 && relays(s).length === 0);
  s = wrappedSock();
  await s.sendMessage(GRP, { image: PNG, caption: "@x", mentions: ["255700000001@s.whatsapp.net"] });
  check("media that tags people is untouched", plains(s).length === 1 && relays(s).length === 0);

  section("AUDIO: sent as is, button message follows");
  s = wrappedSock();
  const mp3 = tmp("s.mp3", 4096);
  r = await s.sendMessage(CHAT, { audio: { url: mp3 }, mimetype: "audio/mpeg", fileName: "song.mp3" }, { quoted: { key: { id: "Q3", remoteJid: CHAT }, message: { conversation: ".song" } } });
  check(".song audio: the audio goes out FIRST, completely unchanged", s.log[0].how === "plain" && s.log[0].content.audio.url === mp3 && s.log[0].content.mimetype === "audio/mpeg");
  check("...then ONE follow-up with the View Channel button", s.log.length === 2 && s.log[1].how === "relay" && hasChannel(s.log[1]) && /VORTE PRO Channel/.test(im(s.log[1]).body.text), s.log.map((x) => x.how));
  check("the caller still gets the audio message back", r?.key?.id === s.log[0].result.key.id);
  s = wrappedSock();
  await s.sendMessage(CHAT, { audio: { url: mp3 }, mimetype: "audio/ogg; codecs=opus", ptt: true });
  check("voice note: same (audio, then button)", s.log[0].how === "plain" && s.log[0].content.ptt === true && s.log[1]?.how === "relay" && hasChannel(s.log[1]));

  section("NO button: sticker and non-output messages");
  const same = async (name, jid, content, opts) => { const t = wrappedSock(); await t.sendMessage(jid, content, opts); check(name, plains(t).length === 1 && relays(t).length === 0 && plains(t)[0].content === content, t.log.map((x) => x.how)); };
  await same("sticker -> never a button", CHAT, { sticker: WEBP });
  await same("reaction", CHAT, { react: { text: "👍", key: { id: "A" } } });
  await same("edit", CHAT, { text: "edited", edit: { id: "A", remoteJid: CHAT } });
  await same("poll", CHAT, { poll: { name: "q", values: ["a", "b"], selectableCount: 1 } });
  await same("contact card", CHAT, { contacts: { displayName: "x", contacts: [{ vcard: "BEGIN:VCARD\nEND:VCARD" }] } });
  await same("location", CHAT, { location: { degreesLatitude: 1, degreesLongitude: 2 } });
  await same("status post", "status@broadcast", { text: "my status" });
  await same("channel post", "120363@newsletter", { text: "news" });
  s = wrappedSock();
  await s.sendMessage(GRP, { delete: { id: "D1", remoteJid: GRP, fromMe: true } });
  check("delete -> plain, and recorded as deleted by the bot", plains(s).length === 1 && relays(s).length === 0 && botActivity.wasDeletedByBot("D1"));

  section("switches: opt-out, view without button, global off");
  s = wrappedSock();
  await s.sendMessage(CHAT, { text: "internal" }, { channelButton: false });
  check("{ channelButton: false } -> plain, and the flag is not leaked to Baileys", plains(s).length === 1 && relays(s).length === 0 && plains(s)[0].opts === undefined, plains(s)[0]?.opts);
  s = wrappedSock();
  await s.sendMessage(CHAT, { text: "internal" }, { quoted: { key: { id: "Q" } }, channelButton: false });
  check("...other options are passed through untouched", plains(s)[0].opts && plains(s)[0].opts.quoted.key.id === "Q" && !("channelButton" in plains(s)[0].opts));
  s = wrappedSock();
  await cb.withoutButton(s).sendMessage(CHAT, { text: "recovered" });
  check("withoutButton(sock) view sends plain", plains(s).length === 1 && relays(s).length === 0);
  process.env.CHANNEL_BUTTON = "false";
  s = wrappedSock(); await s.sendMessage(CHAT, { text: "off" });
  check("CHANNEL_BUTTON=false switches the whole feature off", plains(s).length === 1 && relays(s).length === 0);
  delete process.env.CHANNEL_BUTTON;

  section("a reply is never lost");
  s = wrappedSock({ failRelay: true });
  r = await s.sendMessage(CHAT, { text: "still delivered" });
  check("text: button version fails -> original text sent once", plains(s).length === 1 && plains(s)[0].content.text === "still delivered" && r?.key?.id === "P1", s.log.length);
  s = wrappedSock({ failRelay: true });
  r = await s.sendMessage(CHAT, { image: PNG, caption: "pic" });
  check("media: button version fails -> original media sent, no throw", plains(s).length === 1 && !!plains(s)[0].content.image);
  s = wrappedSock({ failRelay: true });
  r = await s.sendMessage(CHAT, { audio: { url: mp3 }, mimetype: "audio/mpeg" });
  check("audio: follow-up fails -> audio already delivered, no throw", plains(s).length === 1 && !!r?.key?.id);
  s = wrappedSock({ noRelay: true });
  await s.sendMessage(CHAT, { text: "no relay support" });
  check("a socket without relayMessage still sends plain", plains(s).length === 1);

  section("PROGRESS messages (edited later) and their result");
  const { status } = require("../src/utils/ui");
  s = wrappedSock();
  let st = await status(s, CHAT, "⏳ working", { quoted: { key: { id: "Q9" }, message: { conversation: ".x" } } });
  check("the progress message is plain (it will be edited)", plains(s).length === 1 && relays(s).length === 0);
  await st.update("⏳ still working");
  check("updates are plain edits", plains(s).length === 2 && plains(s)[1].content.edit && relays(s).length === 0);
  await st.finish("✅ done");
  check("finish: the result is edited in place, then the button follows", plains(s).length === 3 && relays(s).length === 1 && hasChannel(relays(s)[0]));
  s = wrappedSock();
  st = await status(s, CHAT, "⏳", { buttonOnFinish: false });
  await st.finish("✅ Ready!");
  check("buttonOnFinish:false (the file already had it) -> no extra message", relays(s).length === 0);
  s = wrappedSock();
  st = await status(s, CHAT, "⏳", { buttonOnFinish: false });
  await st.fail("❌ could not download");
  check("an error result always gets the button", relays(s).length === 1 && hasChannel(relays(s)[0]));

  section("THE MENU uses the same button and the same relay code");
  const menu = require("../src/utils/interactiveMenu");
  const mb = menu.buttons({ prefix: ".", sock: s }).map((b) => ({ name: b.name, ...(b.buttonParamsJson ? JSON.parse(b.buttonParamsJson) : {}) }));
  check("menu's first button is the shared View Channel button", mb[0].name === "cta_url" && mb[0].display_text === "View Channel" && mb[0].url === URL, mb[0]);
  s = wrappedSock();
  await menu.deps.relayInteractive(s, CHAT, menu.buildInteractive({ prefix: ".", sock: s, botName: "VORTE PRO", mode: "public" }));
  check("menu relay goes through the shared implementation (biz node on the stanza)", relays(s).length === 1 && relays(s)[0].opts.additionalNodes.some((x) => x.tag === "biz"));

  section("REAL COMMANDS through the real handler");
  const handler = require("../src/bot/handlers/commandHandler");
  const run = async (sock, m, body, store = makeStore()) => handler.handle(sock, m, body, store.getSettings, store.saveSettings);
  s = wrappedSock();
  await run(s, privateMsg(".ping", { from: "owner" }), ".ping");
  check(".ping reply has the button", s.log.some((x) => x.how === "relay" && hasChannel(x)) && !s.log.some((x) => x.how === "plain" && x.content?.text), s.log.map((x) => x.how));
  s = wrappedSock();
  await run(s, privateMsg(".channel", { from: "owner" }), ".channel");
  check(".channel reply has the button", s.log.some((x) => x.how === "relay" && hasChannel(x) && /whatsapp\.com\/channel/.test(im(x).body.text)));
  s = wrappedSock();
  await run(s, privateMsg(".mode public", { from: "stranger" }), ".mode public");
  check("a permission error has the button", s.log.some((x) => x.how === "relay" && hasChannel(x) && /owner/i.test(im(x).body.text)), s.log.map((x) => x.how));
  s = wrappedSock();
  await run(s, privateMsg(".tools-not-a-command", { from: "owner" }), ".tools-not-a-command");
  check("unknown command does not crash", true);

  section("DOWNLOAD commands (fake downloader, real command code)");
  const dl = require("../src/services/downloaders");
  const real = { a: dl.searchAndDownloadAudio, b: dl.downloadAudioFromUrl, c: dl.searchAndDownloadVideo, d: dl.downloadVideoFromUrl, e: dl.detectPlatform };
  const fake = (ext, name) => async () => ({ filePath: tmp(`${name}.${ext}`, 4096), title: "Test Title", sizeBytes: 4096, format: ext, height: 720 });
  dl.searchAndDownloadAudio = fake("mp3", "a"); dl.downloadAudioFromUrl = fake("mp3", "b");
  dl.searchAndDownloadVideo = fake("mp4", "c"); dl.downloadVideoFromUrl = fake("mp4", "d");
  dl.detectPlatform = (q) => (/^https?:/.test(q) ? { platform: /tiktok/.test(q) ? "tiktok" : /instagram/.test(q) ? "instagram" : "youtube", url: q } : null);
  const audioFlow = async (cmd, label) => {
    const t = wrappedSock();
    await run(t, privateMsg(cmd, { from: "owner" }), cmd);
    const audioAt = t.log.findIndex((x) => x.how === "plain" && x.content?.audio);
    const followAt = t.log.findIndex((x) => x.how === "relay" && hasChannel(x));
    check(`${label}: audio delivered, then ONE button message after it`, audioAt >= 0 && followAt > audioAt && t.log.filter((x) => x.how === "relay").length === 1, t.log.map((x) => x.how + (x.content?.audio ? ":audio" : "")));
  };
  const videoFlow = async (cmd, label) => {
    const t = wrappedSock();
    await run(t, privateMsg(cmd, { from: "owner" }), cmd);
    const v = t.log.find((x) => x.how === "relay" && im(x)?.header?.videoMessage);
    check(`${label}: ONE video message with the button`, !!v && hasChannel(v) && t.log.filter((x) => x.how === "relay").length === 1 && !t.log.some((x) => x.how === "plain" && x.content?.video), t.log.map((x) => x.how));
  };
  await audioFlow(".song some song", ".song");
  await audioFlow(".ytmp3 https://youtu.be/abc", ".ytmp3");
  await videoFlow(".yt https://youtu.be/abc", ".yt");
  await videoFlow(".tiktok https://www.tiktok.com/@a/video/1", ".tiktok");
  await videoFlow(".instagram https://www.instagram.com/reel/x/", ".instagram");
  const ec = wrappedSock();
  dl.searchAndDownloadAudio = async () => { throw new Error("nothing found"); };
  await run(ec, privateMsg(".song zzz", { from: "owner" }), ".song zzz");
  check("a failed download: the error gets the button too", ec.log.some((x) => x.how === "relay" && hasChannel(x)), ec.log.map((x) => x.how));
  dl.searchAndDownloadAudio = real.a; dl.downloadAudioFromUrl = real.b; dl.searchAndDownloadVideo = real.c; dl.downloadVideoFromUrl = real.d; dl.detectPlatform = real.e;

  section("STICKER: pack name VORTE PRO, no channel button");
  const sticker = require("../src/commands/sticker");
  const stickerDeps = { convert: sticker._deps.convert, download: sticker._deps.download };
  sticker._deps.convert = async () => WEBP; sticker._deps.download = async () => PNG;
  s = wrappedSock();
  const imgMsg = privateMsg(".sticker", { from: "owner", message: { imageMessage: { mimetype: "image/png", fileLength: 100 }, } });
  await sticker.execute(s, imgMsg);
  const out = plains(s).find((x) => x.content?.sticker);
  check(".sticker sends a sticker and NO button message", !!out && relays(s).length === 0 && plains(s).length === 1, s.log.map((x) => x.how));
  const { readPackInfo } = require("../src/utils/stickerMeta");
  const info = out ? await readPackInfo(out.content.sticker) : {};
  check("the sticker says VORTE PRO (pack name and author)", info["sticker-pack-name"] === "VORTE PRO" && info["sticker-pack-publisher"] === "VORTE PRO", info);
  check("it is still a valid WebP", out && out.content.sticker.toString("ascii", 0, 4) === "RIFF" && out.content.sticker.toString("ascii", 8, 12) === "WEBP");
  process.env.STICKER_PACK = "Custom Pack";
  const custom = await readPackInfo(await require("../src/utils/stickerMeta").addPackInfo(WEBP));
  check("STICKER_PACK / STICKER_AUTHOR can change the name", custom["sticker-pack-name"] === "Custom Pack" && custom["sticker-pack-publisher"] === "VORTE PRO", custom);
  delete process.env.STICKER_PACK;
  sticker._deps.convert = stickerDeps.convert; sticker._deps.download = stickerDeps.download;

  for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith(`cb-${process.pid}-`)) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {} }
  done();
})().catch((e) => { console.error("TEST CRASHED:", e); process.exit(1); });
