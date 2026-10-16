// What really goes to WhatsApp: runs the REAL send code against a fake socket and checks the message and stanza nodes.
// Run: node tests/menu-wire.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, makeStore } = M;
const { proto } = require("baileys");
const handler = require("../src/bot/handlers/commandHandler");

(async () => {
  const calls = [];
  const sock = makeSock();
  sock.relayMessage = async (jid, message, opts) => { calls.push({ jid, message, opts }); return opts.messageId; };
  const st = makeStore();
  const m = privateMsg(".menu"); m.key.remoteJid = "9555@lid";

  section("default form: interactiveMessage directly, no viewOnce envelope");
  await handler.handle(sock, m, ".menu", st.getSettings, st.saveSettings);
  check("exactly one raw message was relayed", calls.length === 1, calls.length);
  const c = calls[0];
  check("it has interactiveMessage at the top level", !!c?.message?.interactiveMessage, Object.keys(c?.message || {}));
  check("it is NOT wrapped in viewOnceMessage", !c?.message?.viewOnceMessage, Object.keys(c?.message || {}));
  check("message encodes to protobuf and decodes back with 7 buttons", (() => {
    const back = proto.Message.decode(proto.Message.encode(proto.Message.create(c.message)).finish());
    return back.interactiveMessage?.nativeFlowMessage?.buttons?.length === 7;
  })());
  const nf = c?.opts?.additionalNodes || [];
  const flow = nf[0]?.content?.[0]?.content?.[0];
  check("stanza carries biz > interactive(native_flow v1) > native_flow(v9 mixed)", nf[0]?.tag === "biz" && nf[0].content[0].attrs.type === "native_flow" && flow?.attrs?.name === "mixed" && flow?.attrs?.v === "9", JSON.stringify(nf));
  check("private chat also gets the bot node", nf.some((n) => n.tag === "bot" && n.attrs.biz_bot === "1"), JSON.stringify(nf));
  check("messageId is passed to relay", typeof c?.opts?.messageId === "string" && c.opts.messageId.length > 10, c?.opts?.messageId);

  section("group chat: biz node, no bot node");
  const g = makeSock(); const gcalls = [];
  g.relayMessage = async (jid, message, opts) => { gcalls.push({ jid, opts }); };
  const gm = privateMsg(".menu"); gm.key.remoteJid = "120363000000000001@g.us"; gm.key.participant = "9003@lid";
  await handler.handle(g, gm, ".menu", st.getSettings, st.saveSettings);
  const gn = gcalls[0]?.opts?.additionalNodes || [];
  check("group: biz node present, bot node absent", gn[0]?.tag === "biz" && !gn.some((n) => n.tag === "bot"), JSON.stringify(gn));

  section("MENU_WRAP=viewonce restores the old envelope");
  process.env.MENU_WRAP = "viewonce";
  const v = makeSock(); const vcalls = [];
  v.relayMessage = async (jid, message, opts) => { vcalls.push(message); };
  const vm = privateMsg(".menu"); vm.key.remoteJid = "9556@lid";
  await handler.handle(v, vm, ".menu", st.getSettings, st.saveSettings);
  delete process.env.MENU_WRAP;
  check("old form: viewOnceMessage wraps the interactiveMessage", !!vcalls[0]?.viewOnceMessage?.message?.interactiveMessage, Object.keys(vcalls[0] || {}));

  done();
})().catch((e) => { console.error(e); process.exit(1); });
