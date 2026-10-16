//This is just a test 
// Shared test harness: a STATEFUL fake WhatsApp socket + group, and tiny assertion helpers.
// The fake group really changes when the bot calls the Baileys functions (like WhatsApp does),
// so tests prove behaviour, not just "a function was called".
process.env.OWNER_1 = process.env.OWNER_1 || "255700000001";
process.env.OWNER_2 = process.env.OWNER_2 || "";

const G = "120363000000000001@g.us";
const BOT_PN = "255700009999@s.whatsapp.net";

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${ok ? "" : "  -> " + (typeof detail === "string" ? detail : JSON.stringify(detail))}`);
};
const section = (t) => console.log(`\n[${t}]`);
const done = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Participants. addressing "lid": id is a LID and phoneNumber is separate (Baileys v7 LID groups). */
function people({ lid = true, botAdmin = true } = {}) {
  const P = (n, admin) => lid
    ? { id: `900${n}@lid`, phoneNumber: `2557000000${String(n).padStart(2, "0")}@s.whatsapp.net`, admin: admin || null }
    : { id: `2557000000${String(n).padStart(2, "0")}@s.whatsapp.net`, lid: `900${n}@lid`, admin: admin || null };
  return [
    P(1, null),            // 1 = bot OWNER (255700000001), plain member in the group
    P(2, "admin"),         // 2 = group admin
    P(3, null),            // 3 = member
    P(4, null),            // 4 = member
    P(5, "superadmin"),    // 5 = group creator
    lid ? { id: "9099@lid", phoneNumber: BOT_PN, admin: botAdmin ? "admin" : null }
        : { id: BOT_PN, lid: "9099@lid", admin: botAdmin ? "admin" : null }
  ];
}
const jidOf = (n, lid = true) => (lid ? `900${n}@lid` : `2557000000${String(n).padStart(2, "0")}@s.whatsapp.net`);

function makeSock({ lid = true, botAdmin = true, participants, lag = false, refuse = {}, throwOn = {}, subject = "Test Group" } = {}) {
  require("../src/utils/identity").invalidate(); // fresh world per fake socket (the real cache is global per process)
  const sent = [];       // every sendMessage(jid, content, opts)
  const calls = [];      // every other API call
  const state = { subject, desc: "", announce: false, restrict: false, participants: participants || people({ lid, botAdmin }), pic: true, pending: [] };
  let seq = 0;
  const meta = () => JSON.parse(JSON.stringify({ id: G, subject: state.subject, desc: state.desc, announce: state.announce, restrict: state.restrict, participants: state.participants, owner: state.participants.find((p) => p.admin === "superadmin")?.id, creation: 1700000000 }));
  const keyOf = (j) => String(j).split("@")[0].split(":")[0];
  const find = (jid) => state.participants.find((p) => [p.id, p.lid, p.phoneNumber].filter(Boolean).some((x) => keyOf(x) === keyOf(jid)));
  const sock = {
    sent, calls, state,
    user: { id: "255700009999:7@s.whatsapp.net", lid: "9099:7@lid" },
    ev: { on() {} },
    sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return { key: { id: "SENT" + (++seq), remoteJid: jid, fromMe: true } }; },
    sendPresenceUpdate: async (kind, jid) => { calls.push(["presence", kind, jid]); },
    presenceSubscribe: async (jid) => { calls.push(["subscribe", jid]); },
    readMessages: async (keys) => { calls.push(["read", keys]); },
    updateMediaMessage: async (m) => m,
    groupMetadata: async (jid) => { calls.push(["groupMetadata", jid]); if (throwOn.groupMetadata) throw new Error(throwOn.groupMetadata); return meta(); },
    groupUpdateSubject: async (jid, name) => { calls.push(["subject", name]); if (throwOn.subject) throw new Error(throwOn.subject); if (!lag) state.subject = name; },
    groupUpdateDescription: async (jid, d) => { calls.push(["desc", d]); if (!lag) state.desc = d; },
    groupSettingUpdate: async (jid, s) => { calls.push(["setting", s]); if (throwOn.setting) throw new Error(throwOn.setting); if (lag) return; if (s === "announcement") state.announce = true; if (s === "not_announcement") state.announce = false; if (s === "locked") state.restrict = true; if (s === "unlocked") state.restrict = false; },
    groupParticipantsUpdate: async (jid, jids, action) => {
      calls.push(["participants", action, jids]);
      if (throwOn.participants) throw new Error(throwOn.participants);
      return jids.map((j) => {
        const p = find(j);
        const st = refuse[keyOf(j)];
        if (st) return { status: String(st), jid: j };
        if (action === "add") { if (p) return { status: "409", jid: j }; if (!lag) state.participants.push({ id: j, admin: null }); return { status: "200", jid: j }; }
        if (!p) return { status: "404", jid: j };
        if (!lag) {
          if (action === "remove") state.participants = state.participants.filter((x) => x !== state.participants.find((y) => keyOf(y.id) === keyOf(p.id)));
          if (action === "promote") state.participants.find((x) => keyOf(x.id) === keyOf(p.id)).admin = "admin";
          if (action === "demote") state.participants.find((x) => keyOf(x.id) === keyOf(p.id)).admin = null;
        }
        return { status: "200", jid: j };
      });
    },
    groupInviteCode: async () => "INVITECODE",
    groupRevokeInvite: async () => { calls.push(["revoke"]); return "NEWCODE"; },
    removeProfilePicture: async () => { calls.push(["removepp"]); if (!lag) state.pic = false; },
    profilePictureUrl: async () => { if (!state.pic) throw new Error("item-not-found"); return "https://x/pp.jpg"; },
    groupRequestParticipantsList: async () => state.pending.map((p) => ({ ...p })),
    groupRequestParticipantsUpdate: async (jid, jids, action) => { calls.push(["request", action, jids]); if (!lag) state.pending = state.pending.filter((p) => !jids.includes(p.jid)); return jids.map((j) => ({ status: "200", jid: j })); },
    groupLeave: async () => { calls.push(["leave"]); },
  };
  return sock;
}

/** Group message from participant `n` (1..5). Text goes in conversation; mentions/reply optional. */
function groupMsg(n, text, { lid = true, mentions, replyTo, id, extra = {} } = {}) {
  const participant = jidOf(n, lid);
  const ctx = {};
  if (mentions) ctx.mentionedJid = mentions;
  if (replyTo) { ctx.stanzaId = "QUOTED1"; ctx.participant = replyTo; ctx.quotedMessage = { conversation: "quoted text" }; }
  const hasCtx = Object.keys(ctx).length;
  return {
    key: { remoteJid: G, participant, fromMe: false, id: id || "M" + Math.random().toString(36).slice(2), ...(lid && n === 1 ? { participantAlt: "255700000001@s.whatsapp.net" } : {}), ...extra },
    message: hasCtx ? { extendedTextMessage: { text, contextInfo: ctx } } : { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000)
  };
}
/** Private chat message. from owner (default) or a stranger. */
function privateMsg(text, { from = "owner", id, message, fromMe = false } = {}) {
  const jid = from === "owner" ? "9001@lid" : "9777@lid";
  return {
    key: { remoteJid: jid, fromMe, id: id || "P" + Math.random().toString(36).slice(2), ...(from === "owner" ? { remoteJidAlt: "255700000001@s.whatsapp.net" } : {}) },
    message: message || { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000)
  };
}

/** In-memory settings store with the same getSettings/saveSettings contract (JSON round trip, like the file). */
function makeStore(initial = {}) {
  let data = JSON.stringify(initial);
  return { getSettings: () => JSON.parse(data), saveSettings: (d) => { data = JSON.stringify(d); }, raw: () => JSON.parse(data) };
}

const texts = (sock) => sock.sent.map((s) => s.content?.text).filter(Boolean);
const lastText = (sock) => texts(sock).slice(-1)[0] || "";

module.exports = { G, BOT_PN, check, section, done, sleep, people, jidOf, makeSock, groupMsg, privateMsg, makeStore, texts, lastText };
