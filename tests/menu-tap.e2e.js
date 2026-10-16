// A TAP on a menu button must run the same code path as typing the command — through the REAL message handler.
// (interactive-menu.e2e.js tests the pieces; this proves they are connected.) Run: node tests/menu-tap.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore } = M;
const { proto } = require("baileys");
const { processMessage } = require("../src/bot/events/messageHandler");
const interactive = require("../src/utils/interactiveMenu");

// Build the response exactly as WhatsApp delivers it, then round-trip it through protobuf like a real socket does.
function tapMessage(name, params) {
  const msg = proto.Message.create({
    interactiveResponseMessage: {
      body: { text: params.display_text || params.title || "" },
      nativeFlowResponseMessage: { name, paramsJson: JSON.stringify(params), version: 3 }
    }
  });
  return proto.Message.toObject(proto.Message.decode(proto.Message.encode(msg).finish()), { defaults: false });
}
const quickTap = (key, label = "x") => tapMessage("quick_reply", { display_text: label, id: interactive.ID_PREFIX + key });
const listTap = (key, label = "x") => tapMessage("single_select", { title: label, description: "", id: interactive.ID_PREFIX + key });

let n = 0;
async function tap(sock, store, who, message) {
  n++;
  // The bot has a 1-second cooldown per chat+sender, so every simulated tap comes from its own person/chat.
  const m = who === "group"
    ? { ...groupMsg(3, "", { id: "T" + n }), message }
    : privateMsg("", { from: who, id: "T" + n, message });
  if (who !== "group") m.key.remoteJid = `9${700 + n}@lid`;
  await processMessage(sock, m, store.getSettings, store.saveSettings);
}
const sentTexts = (s) => s.sent.map((x) => x.content?.text).filter(Boolean);

(async () => {
  section("every button and list row opens its category (private chat)");
  for (const g of interactive.GROUPS) {
    const sock = makeSock(); const st = makeStore();
    await tap(sock, st, "stranger", g.direct ? quickTap(g.key, g.label) : listTap(g.key, g.label));
    const t = sentTexts(sock).join("\n");
    check(`${g.label}: replies with that category`, t.startsWith(g.label.toUpperCase()) && /│➽ \./.test(t), t.slice(0, 80));
  }

  section("Contact Owner sends a contact card");
  {
    const sock = makeSock(); const st = makeStore();
    await tap(sock, st, "stranger", quickTap(interactive.CONTACT_KEY, "Contact Owner"));
    const c = sock.sent.find((x) => x.content?.contacts);
    check("a contact card goes out", !!c, sock.sent.map((x) => Object.keys(x.content)));
    check("it carries the OWNER_1 number", !!c && c.content.contacts.contacts[0].vcard.includes("waid=255700000001"), c && c.content.contacts.contacts[0].vcard);
  }

  section("taps work in a group, and with a different prefix");
  {
    const sock = makeSock(); const st = makeStore();
    await tap(sock, st, "group", quickTap("group", "Group Commands"));
    check("group chat: category reply", sentTexts(sock).join("\n").startsWith("GROUP COMMANDS"), sentTexts(sock));
    const sock2 = makeSock(); const st2 = makeStore({ global: { prefix: "!" } });
    await tap(sock2, st2, "stranger", quickTap("download", "Download Commands"));
    const t2 = sentTexts(sock2).join("\n");
    check("prefix ! : reply shows ! commands", t2.startsWith("DOWNLOAD COMMANDS") && t2.includes("│➽ !song") && !/│➽ \.[a-z]/.test(t2), t2.slice(0, 120));
  }

  section("only OUR ids are accepted");
  {
    const sock = makeSock(); const st = makeStore();
    await tap(sock, st, "stranger", tapMessage("quick_reply", { display_text: "x", id: "vpmenu:../../etc" }));
    await tap(sock, st, "stranger", tapMessage("quick_reply", { display_text: "x", id: "other:download" }));
    await tap(sock, st, "stranger", tapMessage("quick_reply", { display_text: "x", id: ".restart" }));
    check("unknown / foreign ids do nothing", sock.sent.length === 0, sock.sent.map((x) => x.content));
  }

  section("a tap does not weaken permissions");
  {
    const sock = makeSock(); const st = makeStore();
    await tap(sock, st, "stranger", quickTap("owner", "Owner Commands"));
    check("viewing the owner list is allowed (it is only a list)", sentTexts(sock).join("\n").startsWith("OWNER COMMANDS"));
    check("and it marks them [owner]", /\[owner\]/.test(sentTexts(sock).join("\n")));
  }

  done();
})().catch((e) => { console.error(e); process.exit(1); });
