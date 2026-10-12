// The interactive (button) menu: what is sent, that every button reaches a real handler, the fallback, and the text menus
// that must stay untouched. Run from the repo root: node tests/interactive-menu.e2e.js
// NOTE: this proves how the message is BUILT and ROUTED. Whether a given WhatsApp app RENDERS a native-flow message
// cannot be proven by a test — check it once on a real phone.
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, groupMsg, makeStore, texts, sleep } = M;
const config = require("../src/config/config");
const handler = require("../src/bot/handlers/commandHandler");
const { processMessage } = require("../src/bot/events/messageHandler");
const im = require("../src/utils/interactiveMenu");

const EMOJI = /\p{Extended_Pictographic}|️|‍/u;
const feed = async (sock, m, st) => { await processMessage(sock, m, st.getSettings, st.saveSettings); await sleep(40); };
let n = 0; // a new sender every time: the bot has a 1 second per-sender command cooldown that must not couple unrelated checks
const fresh = (m) => { m.key.remoteJid = `97${++n}@lid`; return m; };
const tap = (id) => fresh(privateMsg("", { from: "stranger", message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name: "quick_reply", paramsJson: JSON.stringify({ id }) } } } }));
const pick = (id) => fresh(privateMsg("", { from: "stranger", message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name: "single_select", paramsJson: JSON.stringify({ id }) } } } }));
const allTexts = (s) => s.sent.map((x) => x.content?.text || x.content?.caption || "");

(async () => {
  // capture instead of relaying through a real socket
  const sentInteractive = [];
  im.deps.relayInteractive = async (sock, chat, content) => { sentInteractive.push({ chat, content }); return { key: { id: "I1" } }; };

  section("main menu message (.menu, default style)");
  let s = makeSock(); let st = makeStore();
  await handler.handle(s, privateMsg(".menu"), ".menu", st.getSettings, st.saveSettings);
  check("one interactive message is sent", sentInteractive.length === 1, sentInteractive.length);
  const msg = sentInteractive[0]?.content?.viewOnceMessage?.message?.interactiveMessage;
  check("title is exactly VORTE PRO, alone", msg?.header?.title === "VORTE PRO" && !msg?.header?.subtitle, msg?.header);
  check("body has the info lines and nothing branded around the name", /Prefix  : \./.test(msg?.body?.text) && /Plugins : \d+/.test(msg?.body?.text) && !/VORTE/.test(msg?.body?.text), msg?.body?.text);
  const btns = msg?.nativeFlowMessage?.buttons || [];
  const parsed = btns.map((b) => ({ name: b.name, ...JSON.parse(b.buttonParamsJson) }));
  const label = (b) => b.display_text || b.title;
  check("buttons: Channel, GitHub, Contact Owner, Download, Group, Owner Commands, More Categories", JSON.stringify(parsed.map(label)) === JSON.stringify(["WhatsApp Channel", "GitHub Repository", "Contact Owner", "Download Commands", "Group Commands", "Owner Commands", "More Categories"]), parsed.map(label));
  const chan = parsed.find((b) => b.display_text === "WhatsApp Channel"), gh = parsed.find((b) => b.display_text === "GitHub Repository");
  check("Channel button opens the configured channel URL", chan?.name === "cta_url" && chan.url === "https://whatsapp.com/channel/0029VbBqa4HHbFVBar2vwO3H" && chan.url === config.channel.url, chan);
  check("GitHub button opens the repository", gh?.name === "cta_url" && gh.url === "https://github.com/saidhussein-dev/VORTE-PRO", gh);
  check("NO emoji anywhere in the message (title, body, footer, buttons)", !EMOJI.test(JSON.stringify(sentInteractive[0]?.content)), JSON.stringify(sentInteractive[0]?.content).match(EMOJI));
  check("no image or video attached to the menu", msg?.header?.hasMediaAttachment === false);
  check("sends nothing else when the buttons were delivered", s.sent.length === 0, allTexts(s));

  section("every button id reaches a real handler (through the real message handler)");
  const ids = parsed.filter((b) => b.name === "quick_reply").map((b) => b.id);
  const rows = parsed.filter((b) => b.name === "single_select").flatMap((b) => b.sections.flatMap((x) => x.rows.map((r) => r.id)));
  check("button ids are all ours and unique", [...ids, ...rows].every((i) => i.startsWith(im.ID_PREFIX)) && new Set([...ids, ...rows]).size === ids.length + rows.length, [...ids, ...rows]);
  check("the list covers the other categories", rows.length === im.GROUPS.filter((g) => !g.direct).length && rows.length >= 8, rows);
  for (const id of ids.filter((i) => i !== im.ID_PREFIX + "contact")) {
    s = makeSock(); await feed(s, tap(id), makeStore());
    const t = allTexts(s).join("\n");
    check(`tap ${id} -> command list`, /COMMANDS\n/.test(t) && /│➽ \./.test(t) && !EMOJI.test(t), t.slice(0, 80));
  }
  for (const id of rows) {
    s = makeSock(); await feed(s, pick(id), makeStore());
    const t = allTexts(s).join("\n");
    check(`list row ${id} -> command list`, /COMMANDS\n/.test(t) && /│➽ \./.test(t) && !EMOJI.test(t), t.slice(0, 80));
  }

  section("what the category buttons list");
  s = makeSock(); await feed(s, tap(im.ID_PREFIX + "download"), makeStore());
  let t = allTexts(s).join("\n");
  check("Download: the real download commands", ["song", "yt", "ytmp3", "tiktok", "instagram"].every((c) => t.includes(`.${c}`)), t);
  check("Download lists each command once, no duplicate names", !/\(also/.test(t.split("\n").filter((l) => /\.(song|yt|tiktok|instagram)\b/.test(l)).join("\n")), t);
  s = makeSock(); await feed(s, tap(im.ID_PREFIX + "group"), makeStore());
  t = allTexts(s).join("\n");
  check("Group: group commands with plain-text permission tags", /\.kick @user \[admin\]/.test(t) && /\.leave \[owner\]/.test(t), t);
  s = makeSock(); await feed(s, tap(im.ID_PREFIX + "owner"), makeStore());
  t = allTexts(s).join("\n");
  check("Owner: owner commands incl. .togroupstatus", /\.restart \[owner\]/.test(t) && /\.togroupstatus/.test(t), t);

  section("Contact Owner button");
  s = makeSock(); await feed(s, tap(im.ID_PREFIX + "contact"), makeStore());
  const card = s.sent.find((x) => x.content.contacts);
  check("sends a contact card for the configured owner (OWNER_1), not hardcoded", card && new RegExp(`waid=${config.owner1}`).test(card.content.contacts.contacts[0].vcard), card && card.content.contacts.contacts[0].vcard);
  const saved = [config.owner1, config.owner2]; config.owner1 = "255757332074"; config.owner2 = null;
  s = makeSock(); await feed(s, tap(im.ID_PREFIX + "contact"), makeStore());
  const card2 = s.sent.find((x) => x.content.contacts);
  check("with OWNER_1=255757332074 the card is +255 757 332 074", card2 && /waid=255757332074:\+255757332074/.test(card2.content.contacts.contacts[0].vcard));
  config.owner1 = saved[0]; config.owner2 = saved[1];

  section("safety of the routing");
  s = makeSock(); await feed(s, tap("somebody-elses-button"), makeStore());
  check("a button id that is not ours is ignored", s.sent.length === 0 && sentInteractive.length === 1, { sent: s.sent.length, interactive: sentInteractive.length });
  s = makeSock(); await feed(s, tap(im.ID_PREFIX + "../../restart"), makeStore());
  check("a forged id cannot run another command", s.sent.length === 0);
  s = makeSock(); await feed(s, fresh(privateMsg(".menu download", { from: "stranger" })), makeStore());
  check("typing .menu download works too (same path as the button)", /DOWNLOAD COMMANDS/.test(allTexts(s).join("\n")));
  const nBefore = sentInteractive.length;
  s = makeSock(); await feed(s, fresh(privateMsg(".menu nonsense", { from: "stranger" })), makeStore());
  check("unknown category falls back to the main menu, not silence", sentInteractive.length === nBefore + 1, { nBefore, now: sentInteractive.length });

  section("fallback when the interactive message cannot be sent");
  const before = im.deps.relayInteractive;
  im.deps.relayInteractive = async () => { throw new Error("not delivered"); };
  const quiet = console.error; console.error = () => {};
  s = makeSock(); await handler.handle(s, privateMsg(".menu"), ".menu", st.getSettings, st.saveSettings);
  console.error = quiet;
  t = allTexts(s).join("\n");
  check("a plain text menu is sent instead (never silent)", /^VORTE PRO\n/.test(t) && /Plugins : \d+/.test(t) && /\.menu download/.test(t), t.slice(0, 120));
  check("the fallback also has no emoji and keeps the links", !EMOJI.test(t) && t.includes(config.channel.url) && t.includes("github.com/saidhussein-dev/VORTE-PRO"), t);
  im.deps.relayInteractive = before;

  section("styles 2, 3 and 4 (picture / video menus) get the SAME buttons, with the media kept on top");
  const prepared = [];
  im.deps.prepareMedia = async (sock, media) => { prepared.push(media); return media.kind === "video" ? { videoMessage: { url: "u", mimetype: "video/mp4", gifPlayback: !!media.gifPlayback } } : { imageMessage: { url: "u", mimetype: "image/jpeg" } }; };
  const withUpload = () => { const x = makeSock(); x.waUploadToServer = async () => ({}); return x; };
  const buttonsOf = (c) => (c?.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons || []).map((b) => JSON.parse(b.buttonParamsJson).display_text || JSON.parse(b.buttonParamsJson).title);
  const MAIN = JSON.stringify(["WhatsApp Channel", "GitHub Repository", "Contact Owner", "Download Commands", "Group Commands", "Owner Commands", "More Categories"]);
  const cases = [
    ["style 2 (picture, default URL)", { style: 2 }, "image", "imageMessage"],
    ["style 3 (video, default URL)", { style: 3 }, "video", "videoMessage"],
    ["style 4 (custom picture)", { style: 4, customMediaUrl: "https://example.com/x.jpg", customMediaType: "image" }, "image", "imageMessage"],
    ["style 4 (custom video)", { style: 4, customMediaUrl: "https://example.com/x.mp4", customMediaType: "video" }, "video", "videoMessage"]
  ];
  for (const [name, menu, kind, field] of cases) {
    const nBefore = sentInteractive.length;
    s = withUpload(); const stx = makeStore({ global: { menu } });
    await handler.handle(s, privateMsg(".menu"), ".menu", stx.getSettings, stx.saveSettings);
    const c = sentInteractive[nBefore]?.content; const im2 = c?.viewOnceMessage?.message?.interactiveMessage;
    check(`${name}: one button message with the ${kind} in the header`, sentInteractive.length === nBefore + 1 && im2?.header?.hasMediaAttachment === true && !!im2.header[field], im2?.header);
    check(`${name}: same seven buttons as the default menu`, JSON.stringify(buttonsOf(c)) === MAIN, buttonsOf(c));
    check(`${name}: VORTE PRO stands alone as the first line, no emoji`, /^VORTE PRO\n\n/.test(im2?.body?.text) && !EMOJI.test(JSON.stringify(c)), im2?.body?.text);
    check(`${name}: nothing else is sent when the buttons went out`, s.sent.length === 0, allTexts(s));
  }
  check("the saved media (not a stand-in) is what gets uploaded", prepared[0]?.source?.url && prepared[2]?.source?.url === "https://example.com/x.jpg" && prepared[3]?.kind === "video" && prepared[1]?.gifPlayback === true, prepared.map((x) => [x.kind, x.source?.url]));

  section("styles 2-4: if the buttons cannot be sent, the OLD picture/video menu is sent exactly as before");
  const relay0 = im.deps.relayInteractive;
  im.deps.relayInteractive = async () => { throw new Error("not delivered"); };
  console.error = () => {};
  for (const [name, menu, kind] of [["style 2", { style: 2 }, "image"], ["style 3", { style: 3 }, "video"], ["style 4", { style: 4, customMediaUrl: "https://example.com/x.jpg", customMediaType: "image" }, "image"]]) {
    s = withUpload(); const stx = makeStore({ global: { menu } });
    await handler.handle(s, privateMsg(".menu"), ".menu", stx.getSettings, stx.saveSettings);
    const c = s.sent[0]?.content;
    check(`${name}: falls back to the ${kind} with the full text menu as caption`, s.sent.length === 1 && !!c?.[kind] && /Plugins : \d+/.test(c.caption) && /◈ 👥 GROUP ◈/.test(c.caption), Object.keys(c || {}));
  }
  im.deps.relayInteractive = relay0;
  s = makeSock(); const st2 = makeStore({ global: { menu: { style: 2 } } }); // a connection that cannot upload media at all
  await handler.handle(s, privateMsg(".menu"), ".menu", st2.getSettings, st2.saveSettings);
  check("no media upload available -> the old picture menu, never silence", !!s.sent[0]?.content?.image && /Plugins : \d+/.test(s.sent[0].content.caption));
  s = withUpload(); const st4 = makeStore({ global: { menu: { style: 4 } } }); // style 4 chosen but no media set yet
  const n4 = sentInteractive.length;
  await handler.handle(s, privateMsg(".menu"), ".menu", st4.getSettings, st4.saveSettings);
  check("style 4 with no media set -> still the button menu (no picture)", sentInteractive.length === n4 + 1 && sentInteractive[n4].content.viewOnceMessage.message.interactiveMessage.header.title === "VORTE PRO");

  done();
})().catch((e) => { console.error(e); process.exit(1); });
