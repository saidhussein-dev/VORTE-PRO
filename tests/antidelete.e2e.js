// AntiDelete: global, to the owner inbox, media included, with centralized exclusions. Run: node tests/antidelete.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore, texts, G, jidOf, sleep } = M;
const config = require("../src/config/config");
const antiDelete = require("../src/utils/antiDelete");
const botActivity = require("../src/utils/botActivity");
const messageCache = require("../src/utils/messageCache");
const { processMessage } = require("../src/bot/events/messageHandler");
const { handleMessageUpdate } = require("../src/bot/events/editHandler");
const fs = require("fs");

const OWNER_INBOX = "255700000001@s.whatsapp.net";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const on = () => makeStore({ global: { antidelete: { enabled: true } } });
// Baileys v7: a revoke arrives as messages.update with message:null; key.participant is who deleted it
const revoke = (orig, deleter) => [{ key: { remoteJid: orig.key.remoteJid, id: orig.key.id, fromMe: false, ...(deleter ? { participant: deleter } : orig.key.participant ? { participant: orig.key.participant } : {}) }, update: { message: null, messageStubType: 1 } }];
const toOwner = (s) => s.sent.filter((x) => x.jid === OWNER_INBOX);
const mediaMsg = (n, kind, node, id) => ({ ...groupMsg(n, "", { id }), message: { [kind]: node } });
const settle = () => sleep(30);

(async () => {
  section("private chat: text recovered to the owner inbox");
  let s = makeSock(), st = on();
  const m1 = privateMsg("my secret plan", { from: "stranger", id: "PRIV1" });
  await processMessage(s, m1, st.getSettings, st.saveSettings); await settle();
  s.sent.length = 0;
  await handleMessageUpdate(s, revoke(m1), st.getSettings);
  let msgs = toOwner(s);
  check("delivered to OWNER_1's inbox", msgs.length === 1, s.sent.map((x) => x.jid));
  const t = msgs[0]?.content.text || "";
  check("header: 🗑️ ANTI-DELETE, sender, chat, time", /^🗑️ ANTI-DELETE\n\n👤 Sender: /.test(t) && /💬 Chat: Private Chat/.test(t) && /🕐 Time: \d\d:\d\d/.test(t), t);
  check("recovered text included", /📩 Deleted message:\nmy secret plan/.test(t), t);
  check("sender shown as @id when the phone number is hidden (LID, unresolved)", /Sender: @9777 \(number hidden by WhatsApp\)/.test(t), t);
  check("NOT posted back into the private chat", !s.sent.some((x) => x.jid === m1.key.remoteJid));
  check("the bot never deletes the recovered copy (it stays until the owner deletes it)", !s.sent.some((x) => x.content.delete));

  section("group chat: group name + resolved phone number, admin deleter");
  s = makeSock(); st = on();
  const g1 = groupMsg(3, "secret in group", { id: "GRP1" });
  await processMessage(s, g1, st.getSettings, st.saveSettings); await settle();
  s.sent.length = 0;
  await handleMessageUpdate(s, revoke(g1, jidOf(2)), st.getSettings);
  const gt = toOwner(s)[0]?.content.text || "";
  check("chat line shows the group name", /💬 Chat: Test Group \(group\)/.test(gt), gt);
  check("sender is the real phone number (+255700000003)", /Sender: \+255700000003/.test(gt), gt);
  check("'Deleted by' shown when someone else deleted it", /🧹 Deleted by: \+255700000002/.test(gt), gt);
  check("nothing is posted into the group", !s.sent.some((x) => x.jid === G));
  s = makeSock(); st = on();
  const g2 = groupMsg(3, "own delete", { id: "GRP2" });
  await processMessage(s, g2, st.getSettings, st.saveSettings); await settle(); s.sent.length = 0;
  await handleMessageUpdate(s, revoke(g2, g2.key.participant), st.getSettings);
  check("no 'Deleted by' when the sender deleted their own message", !/Deleted by/.test(toOwner(s)[0]?.content.text || ""));

  section("media is recovered too (image, video, audio, sticker, document)");
  const cases = [
    ["image", "imageMessage", { caption: "look!", mimetype: "image/png", fileLength: PNG.length }, (c) => Buffer.isBuffer(c.image) && /look!/.test(c.caption) && /ANTI-DELETE/.test(c.caption)],
    ["video", "videoMessage", { caption: "clip", mimetype: "video/mp4", fileLength: 20 }, (c) => Buffer.isBuffer(c.video) && /clip/.test(c.caption)],
    ["document", "documentMessage", { fileName: "plan.pdf", mimetype: "application/pdf", fileLength: 20 }, (c) => Buffer.isBuffer(c.document) && c.fileName === "plan.pdf" && c.mimetype === "application/pdf"],
  ];
  for (const [label, key, node, ok] of cases) {
    s = makeSock(); st = on();
    const mm = mediaMsg(3, key, node, "MED-" + label);
    await antiDelete.remember(s, mm, st.getSettings(), { download: async () => (key === "imageMessage" ? PNG : Buffer.from("x".repeat(20))) });
    s.sent.length = 0; await handleMessageUpdate(s, revoke(mm), st.getSettings);
    check(`${label}: the actual file is sent to the owner`, toOwner(s).length === 1 && ok(toOwner(s)[0].content), toOwner(s).map((x) => Object.keys(x.content)));
  }
  s = makeSock(); st = on();
  const au = mediaMsg(3, "audioMessage", { ptt: true, mimetype: "audio/ogg; codecs=opus", fileLength: 9 }, "MED-AUDIO");
  await antiDelete.remember(s, au, st.getSettings(), { download: async () => Buffer.from("opusdata") });
  s.sent.length = 0; await handleMessageUpdate(s, revoke(au), st.getSettings);
  check("voice note: header text, then the audio itself (ptt)", toOwner(s).length === 2 && /ANTI-DELETE/.test(toOwner(s)[0].content.text) && Buffer.isBuffer(toOwner(s)[1].content.audio) && toOwner(s)[1].content.ptt === true);
  s = makeSock(); st = on();
  const sk = mediaMsg(3, "stickerMessage", { mimetype: "image/webp", fileLength: 9 }, "MED-STK");
  await antiDelete.remember(s, sk, st.getSettings(), { download: async () => Buffer.from("webpdata") });
  s.sent.length = 0; await handleMessageUpdate(s, revoke(sk), st.getSettings);
  check("sticker: header text, then the sticker", toOwner(s).length === 2 && Buffer.isBuffer(toOwner(s)[1].content.sticker));
  check("cached file removed after it was delivered", ![...antiDelete._media.values()].some((e) => !fs.existsSync(e.file)) && !antiDelete._media.has("MED-STK"));

  section("media of ANY size is recovered (no size limit)");
  s = makeSock(); st = on();
  const big = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: 99 * 1024 * 1024 }, "MED-BIG");
  let downloaded = false;
  await antiDelete.remember(s, big, st.getSettings(), { download: async () => { downloaded = true; return PNG; } });
  s.sent.length = 0; await handleMessageUpdate(s, revoke(big), st.getSettings);
  check("a file declared as 99 MB is downloaded", downloaded === true);
  check("…and delivered to the owner", toOwner(s).length === 1 && !!toOwner(s)[0].content.image, toOwner(s).map((x) => Object.keys(x.content)));

  section("big files are streamed (a Readable), written to disk, and sent from disk");
  {
    const { Readable } = require("stream");
    const big2 = Buffer.alloc(45 * 1024 * 1024, 7); // above the send-from-memory threshold
    s = makeSock(); st = on();
    const mv = mediaMsg(3, "videoMessage", { mimetype: "video/mp4", fileLength: big2.length, caption: "long video" }, "MED-STREAM");
    await antiDelete.remember(s, mv, st.getSettings(), { download: async () => Readable.from([big2.subarray(0, 20e6), big2.subarray(20e6)]) });
    const saved = antiDelete._media.get("MED-STREAM");
    check("the whole file reached the disk cache", !!saved && fs.statSync(saved.file).size === big2.length, saved && saved.bytes);
    s.sent.length = 0; await handleMessageUpdate(s, revoke(mv), st.getSettings);
    const v = toOwner(s)[0]?.content;
    check("a 45 MB video is sent as a file path stream, not loaded into memory", !!v && v.video && typeof v.video.url === "string" && v.video.url.includes("antidelete"), v && Object.keys(v));
    check("it is still a video message with its caption", /long video/.test(v?.caption || ""));
  }

  section("the sender deletes WHILE the file is still downloading -> the file still arrives");
  {
    s = makeSock(); st = on();
    const slow = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: 9 }, "MED-SLOW");
    const p = antiDelete.remember(s, slow, st.getSettings(), { download: async () => { await sleep(300); return PNG; } });
    await sleep(20); // the download is under way; the delete arrives now
    s.sent.length = 0;
    await handleMessageUpdate(s, revoke(slow), st.getSettings);
    await p;
    check("delivered as an image, not as a 'can't recover' notice", toOwner(s).length === 1 && !!toOwner(s)[0].content.image, toOwner(s).map((x) => Object.keys(x.content)));
  }

  section("a failed download is retried once");
  {
    s = makeSock(); st = on();
    const flaky = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: 9 }, "MED-FLAKY");
    let tries = 0;
    await antiDelete.remember(s, flaky, st.getSettings(), { download: async () => { if (++tries === 1) throw new Error("network blip"); return PNG; } });
    check("second attempt saved it", tries === 2 && antiDelete._media.has("MED-FLAKY"), tries);
    s.sent.length = 0; await handleMessageUpdate(s, revoke(flaky), st.getSettings);
    check("and it is delivered", !!toOwner(s)[0]?.content.image);
  }

  section("if WhatsApp refuses it as a video, it is sent as a document instead");
  {
    s = makeSock(); st = on();
    const mv2 = mediaMsg(3, "videoMessage", { mimetype: "video/mp4", fileLength: 9, caption: "clip" }, "MED-DOCFB");
    await antiDelete.remember(s, mv2, st.getSettings(), { download: async () => Buffer.from("videodata") });
    const orig = s.sendMessage; let failedOnce = false;
    s.sendMessage = async (jid, content, opts) => { if (content.video && !failedOnce) { failedOnce = true; throw new Error("too large for a video"); } return orig(jid, content, opts); };
    s.sent.length = 0; await handleMessageUpdate(s, revoke(mv2), st.getSettings);
    const d = toOwner(s).find((x) => x.content.document);
    check("delivered as a document with the video mimetype", !!d && d.content.mimetype === "video/mp4" && /deleted-video\.mp4/.test(d.content.fileName), toOwner(s).map((x) => Object.keys(x.content)));
  }

  section("the total cache cap drops the OLDEST files, never the newest");
  {
    // separate process: the cap is read when the module loads (here 1 MB; three 600 KB files are saved one after another)
    const { execFileSync } = require("child_process");
    const code = `
      const ad = require("./src/utils/antiDelete");
      const st = { global: { antidelete: { enabled: true } } };
      (async () => {
        for (const id of ["CAP-A", "CAP-B", "CAP-C"]) {
          const m = { key: { remoteJid: "255700000555@s.whatsapp.net", id, fromMe: false }, message: { imageMessage: { mimetype: "image/png", fileLength: 600000 } }, messageTimestamp: Math.floor(Date.now() / 1000) };
          await ad.remember({}, m, st, { download: async () => Buffer.alloc(600000, 1) });
        }
        console.log("SURVIVORS=" + [...ad._media.keys()].join(","));
        process.exit(0);
      })();`;
    const out = execFileSync(process.execPath, ["-e", code], { cwd: require("path").join(__dirname, ".."), env: { ...process.env, ANTIDELETE_MAX_TOTAL_MB: "1" }, encoding: "utf8" });
    const survivors = (out.match(/SURVIVORS=(.*)/) || [])[1];
    check("only the newest file is kept when the cap is exceeded", survivors === "CAP-C", out.trim());
  }

  section("a long caption is not cut off");
  {
    s = makeSock(); st = on();
    const longCap = "L".repeat(1500);
    const mc = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: 9, caption: longCap }, "MED-LONGCAP");
    await antiDelete.remember(s, mc, st.getSettings(), { download: async () => PNG });
    s.sent.length = 0; await handleMessageUpdate(s, revoke(mc), st.getSettings);
    const full = toOwner(s).find((x) => x.content.text && x.content.text.includes(longCap));
    check("the full caption follows as text", !!full, toOwner(s).map((x) => Object.keys(x.content)));
  }

  s = makeSock(); st = on();
  const vo = { ...groupMsg(3, "", { id: "VO1" }), message: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mimetype: "image/png", fileLength: 9 } } } } };
  downloaded = false;
  await antiDelete.remember(s, vo, st.getSettings(), { download: async () => { downloaded = true; return PNG; } });
  s.sent.length = 0; await handleMessageUpdate(s, revoke(vo), st.getSettings);
  check("view-once media is NEVER cached or forwarded", downloaded === false && !antiDelete._media.has("VO1") && !toOwner(s).some((x) => x.content.image));
  s = makeSock(); st = makeStore({});
  const off = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: 9 }, "MED-OFF");
  downloaded = false;
  await antiDelete.remember(s, off, st.getSettings(), { download: async () => { downloaded = true; return PNG; } });
  check("while AntiDelete is OFF no media is downloaded at all", downloaded === false);

  section("exclusions: the bot's own activity is never reported");
  s = makeSock(); st = on(); botActivity.install(s);
  const link = groupMsg(3, "spam https://bad.example.com", { id: "LINK1" });
  const st2 = makeStore({ global: { antidelete: { enabled: true } }, [G]: { antilink: true, antiActions: { antilink: "delete" } } });
  await processMessage(s, link, st2.getSettings, st2.saveSettings); await settle();
  check("antilink really deleted it", s.sent.some((x) => x.content.delete && x.content.delete.id === "LINK1"));
  s.sent.length = 0; await handleMessageUpdate(s, revoke(link), st2.getSettings);
  check("…and the resulting revoke event is NOT forwarded to the owner", toOwner(s).length === 0, toOwner(s));
  s = makeSock(); st = on();
  const own = privateMsg("bot account typed this", { from: "stranger", id: "OWN1", fromMe: true });
  messageCache.store("OWN1", { chat: own.key.remoteJid, sender: own.key.remoteJid, fromMe: true, text: "x", kind: "text", ts: Date.now() });
  await handleMessageUpdate(s, revoke(own), st.getSettings);
  check("messages from the bot's own account are ignored", toOwner(s).length === 0);
  s = makeSock(); st = on();
  messageCache.store("BOT-SENT-1", { chat: G, sender: jidOf(3), fromMe: false, text: "welcome text", kind: "text", ts: Date.now() });
  botActivity.markSent("BOT-SENT-1");
  await handleMessageUpdate(s, [{ key: { remoteJid: G, id: "BOT-SENT-1" }, update: { message: null } }], st.getSettings);
  check("messages the bot itself sent (welcome, warnings, status lines) are ignored", toOwner(s).length === 0);
  for (const chat of ["status@broadcast", "120363@newsletter", "12345@broadcast"]) {
    s = makeSock(); st = on();
    messageCache.store("X-" + chat, { chat, sender: "9777@lid", fromMe: false, text: "status text", kind: "text", ts: Date.now() });
    await handleMessageUpdate(s, [{ key: { remoteJid: chat, id: "X-" + chat }, update: { message: null } }], st.getSettings);
    check(`${chat} deletions are ignored`, toOwner(s).length === 0);
  }
  s = makeSock(); st = on();
  await handleMessageUpdate(s, [{ key: { remoteJid: G, id: "NEVER-SEEN", participant: jidOf(3) }, update: { message: null } }], st.getSettings);
  check("a message the bot never saw -> ignored quietly (no crash, no empty notice)", s.sent.length === 0);
  s = makeSock(); st = makeStore({});
  const m4 = privateMsg("hello", { from: "stranger", id: "OFF1" });
  await processMessage(s, m4, st.getSettings, st.saveSettings); await settle(); s.sent.length = 0;
  await handleMessageUpdate(s, revoke(m4), st.getSettings);
  check("AntiDelete OFF -> nothing reported", toOwner(s).length === 0);

  section("delivery details");
  s = makeSock(); st = on(); config.owner2 = "255700000002";
  const m5 = privateMsg("for both owners", { from: "stranger", id: "TWO1" });
  await processMessage(s, m5, st.getSettings, st.saveSettings); await settle(); s.sent.length = 0;
  await handleMessageUpdate(s, revoke(m5), st.getSettings);
  check("goes to every configured owner (OWNER_1 and OWNER_2)", s.sent.some((x) => x.jid === OWNER_INBOX) && s.sent.some((x) => x.jid === "255700000002@s.whatsapp.net"));
  config.owner2 = "";
  s = makeSock(); st = on();
  const m6 = privateMsg("owner unreachable", { from: "stranger", id: "FAIL1" });
  await processMessage(s, m6, st.getSettings, st.saveSettings); await settle();
  const orig = s.sendMessage; s.sendMessage = async (j, c, o) => { if (j === OWNER_INBOX) throw new Error("boom"); return orig(j, c, o); };
  let threw = false; try { await handleMessageUpdate(s, revoke(m6), st.getSettings); } catch { threw = true; }
  check("delivery failure never crashes the handler", threw === false);
  s = makeSock(); st = on();
  const old = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: PNG.length }, "OLD1");
  await antiDelete.remember(s, old, st.getSettings(), { download: async () => PNG });
  const file = antiDelete._media.get("OLD1").file; antiDelete._media.get("OLD1").cachedAt = Date.now() - 30 * 3600 * 1000;
  const fresh = mediaMsg(3, "imageMessage", { mimetype: "image/png", fileLength: PNG.length }, "NEW1");
  await antiDelete.remember(s, fresh, st.getSettings(), { download: async () => PNG });
  check("the bot's own temporary copy expires (default 24 h) and the file is removed", !antiDelete._media.has("OLD1") && antiDelete._media.has("NEW1"));
  await sleep(50);
  check("expired file removed from disk", !fs.existsSync(file));

  section("antiedit is unaffected and ignores the bot's own edits");
  s = makeSock(); st = makeStore({ [G]: { antiedit: true } });
  const e1 = groupMsg(3, "first version", { id: "ED1" });
  await processMessage(s, e1, st.getSettings, st.saveSettings); await settle(); s.sent.length = 0;
  await handleMessageUpdate(s, [{ key: { remoteJid: G, id: "ED1", participant: jidOf(3) }, update: { message: { conversation: "second version" } } }], st.getSettings);
  check("edit reported in the chat (before/after)", s.sent.some((x) => x.jid === G && /Before: "first version"[\s\S]*After: "second version"/.test(x.content.text || "")), texts(s));
  s.sent.length = 0;
  await handleMessageUpdate(s, [{ key: { remoteJid: G, id: "ED1", participant: jidOf(3) }, update: { message: { conversation: "third version" } } }], st.getSettings);
  check("a second edit diffs against the latest version", /Before: "second version"[\s\S]*After: "third version"/.test(texts(s).join("\n")), texts(s));
  s = makeSock(); st = makeStore({ [G]: { antiedit: true } });
  messageCache.store("BOTEDIT", { chat: G, sender: jidOf(3), text: "status 1", ts: Date.now() }); botActivity.markSent("BOTEDIT");
  await handleMessageUpdate(s, [{ key: { remoteJid: G, id: "BOTEDIT" }, update: { message: { conversation: "status 2" } } }], st.getSettings);
  check("the bot editing its own status message is not reported as a user edit", s.sent.length === 0);

  done();
})().catch((e) => { console.error(e); process.exit(1); });
