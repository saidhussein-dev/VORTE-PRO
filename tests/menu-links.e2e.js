// The forms of the menu. Run: node tests/menu-links.e2e.js
//   everyone else                -> real reply buttons (tap = the bot runs the command)
//   the bot's OWN account        -> info message + a poll (see menu-poll.e2e.js); if the poll can't be sent, or
//                                   MENU_OWNER_POLL=false, link buttons (wa.me, the owner presses send)
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, makeStore } = M;
const handler = require("../src/bot/handlers/commandHandler");
const im = require("../src/utils/interactiveMenu");

(async () => {
  const sent = [];
  im.deps.relayInteractive = async (sock, chat, content) => { sent.push(content); return { key: { id: "I" } }; };
  const parse = (c) => (c.interactiveMessage || c.viewOnceMessage.message.interactiveMessage).nativeFlowMessage.buttons.map((b) => ({ name: b.name, ...JSON.parse(b.buttonParamsJson) }));
  const bodyOf = (c) => (c.interactiveMessage || c.viewOnceMessage.message.interactiveMessage).body.text;
  let n = 0;
  const msg = (t, extra = {}) => { const m = privateMsg(t, { from: "stranger", ...extra }); m.key.remoteJid = `96${++n}@lid`; return m; };
  const st = makeStore();

  section("someone else (or an owner on a different number): reply buttons");
  await handler.handle(makeSock(), msg(".menu"), ".menu", st.getSettings, st.saveSettings);
  let names = parse(sent[0]).map((b) => b.name);
  check("quick_reply buttons + a list, two URL buttons", names.filter((x) => x === "quick_reply").length === 4 && names.includes("single_select") && names.filter((x) => x === "cta_url").length === 2, names);

  section("the bot's own account: an info message and a poll (no buttons on your own messages)");
  const s1 = makeSock();
  await handler.handle(s1, msg(".menu", { fromMe: true }), ".menu", st.getSettings, st.saveSettings);
  check("no button message was relayed", sent.length === 1, sent.length);
  const poll = s1.sent.find((x) => x.content.poll)?.content.poll;
  check("a poll with one option per category + Contact Owner", !!poll && poll.values.length === 12 && poll.selectableCount === 1, poll && poll.values);
  check("the info text came first", /Prefix/.test(s1.sent[0].content.text || "") && /VORTE PRO/.test(s1.sent[0].content.text || ""), s1.sent[0]?.content);

  section("same account recognised by phone number (not flagged fromMe)");
  const s2 = makeSock(); const same = msg(".menu"); same.key.remoteJid = "255700009999@s.whatsapp.net";
  await handler.handle(s2, same, ".menu", st.getSettings, st.saveSettings);
  check("also gets the poll", s2.sent.some((x) => x.content.poll), s2.sent.map((x) => Object.keys(x.content)));

  section("poll can't be sent -> link buttons (nothing breaks)");
  const s3 = makeSock(); const real = s3.sendMessage;
  s3.sendMessage = async (jid, content, opts) => { if (content.poll) throw new Error("polls refused"); return real(jid, content, opts); };
  await handler.handle(s3, msg(".menu", { fromMe: true }), ".menu", st.getSettings, st.saveSettings);
  const ob = parse(sent[sent.length - 1]);
  check("all seven are link buttons", ob.every((b) => b.name === "cta_url"), ob.map((b) => b.name));
  const dl = ob.find((b) => b.display_text === "Download Commands");
  check("Download opens the bot chat with .menu download typed in", decodeURIComponent(dl.url.split("?text=")[1]) === ".menu download" && dl.url.startsWith("https://wa.me/255700009999"), dl.url);
  check("that body tells the owner to press send", /press send/.test(bodyOf(sent[sent.length - 1])));

  section("MENU_OWNER_POLL=false -> link buttons straight away");
  process.env.MENU_OWNER_POLL = "false";
  const before = sent.length; const s4 = makeSock();
  await handler.handle(s4, msg(".menu", { fromMe: true }), ".menu", st.getSettings, st.saveSettings);
  delete process.env.MENU_OWNER_POLL;
  check("no poll, link buttons sent", !s4.sent.some((x) => x.content.poll) && sent.length === before + 1 && parse(sent[sent.length - 1]).every((b) => b.name === "cta_url"));

  section("a different prefix is typed into the link");
  const st2 = makeStore({ global: { prefix: "!" } });
  process.env.MENU_OWNER_POLL = "false";
  await handler.handle(makeSock(), msg("!menu", { fromMe: true }), "!menu", st2.getSettings, st2.saveSettings);
  delete process.env.MENU_OWNER_POLL;
  const d2 = parse(sent[sent.length - 1]).find((b) => b.display_text === "Download Commands");
  check("prefix ! -> the link carries !menu download", decodeURIComponent(d2.url.split("?text=")[1]) === "!menu download", d2.url);

  section(".menu all sends every command as plain text");
  const s = makeSock();
  await handler.handle(s, msg(".menu all"), ".menu all", st.getSettings, st.saveSettings);
  const t = s.sent.map((x) => x.content.text || x.content.caption || "").join("\n");
  check("full list has group, owner and download sections", /GROUP/.test(t) && /OWNER/.test(t) && /DOWNLOADS/.test(t) && /│➽ \.kick/.test(t), t.slice(0, 120));

  done();
})().catch((e) => { console.error(e); process.exit(1); });
