// The owner (bot's own account) menu: a poll. Votes are decrypted and become ".menu <category>".
// Votes here are encrypted exactly as WhatsApp does it (same key derivation as Baileys' decryptPollVote).
// Run: node tests/menu-poll.e2e.js
const crypto = require("crypto");
const { proto } = require("baileys");
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, makeStore } = M;
const { processMessage } = require("../src/bot/events/messageHandler");
const poll = require("../src/utils/ownerPollMenu");

const sha = (t) => crypto.createHash("sha256").update(Buffer.from(t)).digest();
function encryptVote({ secret, pollId, creator, voter, labels }) {
  const sign = Buffer.concat([Buffer.from(pollId), Buffer.from(creator), Buffer.from(voter), Buffer.from("Poll Vote"), Buffer.from([1])]);
  const key0 = crypto.createHmac("sha256", Buffer.alloc(32)).update(secret).digest();
  const key = crypto.createHmac("sha256", key0).update(sign).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv); c.setAAD(Buffer.from(`${pollId}\0${voter}`));
  const plain = proto.Message.PollVoteMessage.encode({ selectedOptions: labels.map(sha) }).finish();
  return { encPayload: Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]), encIv: iv };
}
// as it arrives from a real socket: through protobuf and back
const wire = (message) => proto.Message.toObject(proto.Message.decode(proto.Message.encode(proto.Message.create(message)).finish()), { defaults: false });

let seq = 0;
const PN = "255700009999@s.whatsapp.net", LID = "9099@lid";
const sentTexts = (s) => s.sent.map((x) => x.content?.text).filter(Boolean);

async function newMenu(sock, st, chat = `9${100 + ++seq}@lid`) {
  const m = privateMsg(".menu", { fromMe: true, id: "MENU" + seq }); m.key.remoteJid = chat;
  await processMessage(sock, m, st.getSettings, st.saveSettings);
  const p = sock.sent.find((x) => x.content.poll);
  return { chat, secret: p?.content.poll.messageSecret, pollId: "SENT" + (sock.sent.indexOf(p) + 1), p };
}
function voteMsg(menu, { labels, creator = PN, voter = PN, id, pollId, secret } = {}) {
  const v = encryptVote({ secret: secret || menu.secret, pollId: pollId || menu.pollId, creator, voter, labels });
  return { key: { remoteJid: menu.chat, fromMe: true, id: id || "VOTE" + ++seq }, message: wire({ pollUpdateMessage: { pollCreationMessageKey: { id: pollId || menu.pollId, remoteJid: menu.chat, fromMe: true }, vote: v, senderTimestampMs: Date.now() } }), messageTimestamp: Math.floor(Date.now() / 1000) };
}
const cast = async (sock, st, m) => { sock.sent.length = 0; await processMessage(sock, m, st.getSettings, st.saveSettings); };

(async () => {
  section("the poll itself");
  let sock = makeSock(), st = makeStore();
  const menu = await newMenu(sock, st);
  check("a 32-byte secret is attached to the poll", Buffer.isBuffer(menu.secret) && menu.secret.length === 32, menu.secret);
  check("12 options: 11 categories + Contact Owner", menu.p.content.poll.values.length === 12 && menu.p.content.poll.values.includes("Download Commands") && menu.p.content.poll.values.includes("Contact Owner"), menu.p.content.poll.values);

  section("voting an option runs that category (through the real message handler)");
  await new Promise((r) => setTimeout(r, 1100)); // a person takes longer than the 1 s per-sender cooldown to tap
  await cast(sock, st, voteMsg(menu, { labels: ["Download Commands"] }));
  check("Download Commands -> its command list", sentTexts(sock).join("\n").startsWith("DOWNLOAD COMMANDS") && /│➽ \.song/.test(sentTexts(sock).join("\n")), sentTexts(sock));
  await new Promise((r) => setTimeout(r, 1100)); // the bot's 1 s per-sender cooldown
  await cast(sock, st, voteMsg(menu, { labels: ["Group Commands"] }));
  check("then Group Commands (a different vote) -> its list", sentTexts(sock).join("\n").startsWith("GROUP COMMANDS"), sentTexts(sock));
  await new Promise((r) => setTimeout(r, 1100));
  await cast(sock, st, voteMsg(menu, { labels: ["Contact Owner"] }));
  check("Contact Owner -> a contact card", sock.sent.some((x) => x.content.contacts), sock.sent.map((x) => Object.keys(x.content)));

  section("ids spelled the other way (LID) still decrypt");
  await new Promise((r) => setTimeout(r, 1100));
  await cast(sock, st, voteMsg(menu, { labels: ["Tools Commands"], creator: LID, voter: LID }));
  check("creator+voter as LID", sentTexts(sock).join("\n").startsWith("TOOLS COMMANDS"), sentTexts(sock));
  await new Promise((r) => setTimeout(r, 1100));
  await cast(sock, st, voteMsg(menu, { labels: ["Bot Commands"], creator: PN, voter: LID }));
  check("creator as phone, voter as LID", sentTexts(sock).join("\n").startsWith("BOT COMMANDS"), sentTexts(sock));

  section("things that must do nothing");
  await new Promise((r) => setTimeout(r, 1100));
  await cast(sock, st, voteMsg(menu, { labels: [] }));
  check("un-voting (empty vote) does nothing", sock.sent.length === 0, sock.sent.map((x) => x.content));
  await cast(sock, st, voteMsg(menu, { labels: ["Defense Commands"], pollId: "SOMEONE-ELSES-POLL" }));
  check("a vote on a poll that isn't ours is ignored", sock.sent.length === 0);
  await cast(sock, st, voteMsg(menu, { labels: ["Defense Commands"], secret: crypto.randomBytes(32) }));
  check("a vote that doesn't decrypt is ignored (no crash, no reply)", sock.sent.length === 0);
  await cast(sock, st, voteMsg(menu, { labels: ["Not A Real Option"] }));
  check("an option that isn't on the menu is ignored", sock.sent.length === 0);

  section("other people: still real reply buttons, never a poll");
  const other = makeSock(); const relayed = [];
  require("../src/utils/interactiveMenu").deps.relayInteractive = async (s, c, content) => { relayed.push(content); return {}; };
  const m2 = privateMsg(".menu", { from: "stranger" }); m2.key.remoteJid = "9777@lid";
  await processMessage(other, m2, st.getSettings, st.saveSettings);
  check("no poll for a normal user", !other.sent.some((x) => x.content.poll) && relayed.length === 1);

  done();
})().catch((e) => { console.error(e); process.exit(1); });
