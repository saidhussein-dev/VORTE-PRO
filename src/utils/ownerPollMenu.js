// src/utils/ownerPollMenu.js — the menu for the bot's OWN account (the owner on the paired number).
//
// OPT-IN (MENU_OWNER_POLL=true). By default the owner gets the same real buttons as everyone else.
// WHY it exists: as far as can be told, WhatsApp does not act on button taps on an account's own outgoing messages, so the
// button menu may be dead for the owner no matter how it is built. A poll is the one tappable thing WhatsApp does allow on your own message. So for that
// one case the menu is: an info message + a poll with one option per category. Tapping an option = the owner "voted";
// the vote is decrypted here and turned into ".menu <category>", which then runs through the normal command pipeline.
//
// Notes
//   * Baileys 7.0.0-rc14 has its own poll-vote decoding switched off, so votes arrive as raw encrypted messages and are
//     decrypted here with Baileys' own decryptPollVote().
//   * A poll is single-choice: to open another category, tap another option (tapping the chosen one again just un-votes).
//   * Polls are remembered in memory (24h, last 100). After a restart, send .menu again for a fresh poll.
const crypto = require("crypto");
const baileys = require("baileys");
const config = require("../config/config");
const interactive = require("./interactiveMenu");

const MAX_POLLS = 100;
const POLL_TTL_MS = 24 * 60 * 60 * 1000;
const polls = new Map(); // poll message id -> { secret, creators, at }

// WhatsApp allows up to 12 poll options: the 11 categories + Contact Owner.
const OPTIONS = [...interactive.GROUPS.map((g) => ({ key: g.key, label: g.label })), { key: interactive.CONTACT_KEY, label: "Contact Owner" }];

const sha256 = (text) => crypto.createHash("sha256").update(Buffer.from(text)).digest();

/** The bot account's own ids (phone and LID form), device suffix removed. */
function ownJids(sock) {
  const out = new Set();
  for (const j of [sock?.user?.id, sock?.user?.lid, sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid]) {
    if (!j) continue;
    try { out.add(baileys.jidNormalizedUser(j)); } catch { /* skip */ }
  }
  return [...out];
}

function remember(id, entry) {
  const now = Date.now();
  for (const [k, v] of polls) if (now - v.at > POLL_TTL_MS) polls.delete(k);
  polls.set(id, { ...entry, at: now });
  while (polls.size > MAX_POLLS) polls.delete(polls.keys().next().value);
}

/** Info message (header, info lines, links) + the poll. Throws if the poll cannot be sent. */
async function send(sock, chat, info, mediaContent = null) {
  const links = [];
  if (config.channel?.url) links.push(`${config.channel.name || "WhatsApp Channel"}: ${config.channel.url}`);
  links.push(`GitHub: ${interactive.GITHUB_URL}`);
  const intro = [interactive.intro({ ...info, sock }), "", "Tap a category in the poll below to see its commands.", "", ...links].join("\n");

  if (mediaContent) await sock.sendMessage(chat, { ...mediaContent, caption: intro });
  else await sock.sendMessage(chat, { text: intro });

  const secret = crypto.randomBytes(32);
  const sent = await sock.sendMessage(chat, {
    poll: { name: "Categories (tap one)", values: OPTIONS.map((o) => o.label), selectableCount: 1, messageSecret: secret }
  });
  if (!sent?.key?.id) throw new Error("the poll was not sent");
  remember(sent.key.id, { secret, creators: ownJids(sock) });
  return sent.key.id;
}

/** send() that never throws: true = the poll menu went out, false = the caller should use another form. */
async function trySend(sock, chat, info, mediaContent = null) {
  if (!/^(true|on|1|yes)$/i.test(String(process.env.MENU_OWNER_POLL || "").trim())) return false; // opt-in: off unless MENU_OWNER_POLL=true
  try { await send(sock, chat, info, mediaContent); return true; }
  catch (e) { console.error("⚠️ poll menu failed, using the link buttons instead:", e.message); return false; }
}

/**
 * If `m` is a vote on one of OUR menu polls, the equivalent command text (e.g. ".menu download"); otherwise "".
 * Un-voting (an empty vote) and unreadable votes also return "".
 */
function commandFromVote(sock, m, prefix) {
  let msg = m?.message;
  try { msg = baileys.normalizeMessageContent(msg) || msg; } catch { /* use as is */ }
  const update = msg?.pollUpdateMessage;
  if (!update) return "";
  const id = update.pollCreationMessageKey?.id;
  const entry = id && polls.get(id);
  if (!entry) return ""; // somebody else's poll
  if (!update.vote?.encPayload || !update.vote?.encIv) return "";

  // Who voted, in the form WhatsApp used when it encrypted the vote: try every plausible spelling until one decrypts.
  const voters = new Set(m.key?.fromMe ? ownJids(sock) : []);
  for (const j of [m.key?.participant, m.key?.remoteJid]) {
    if (!j) continue;
    try { voters.add(baileys.jidNormalizedUser(j)); } catch { /* skip */ }
  }
  if (!m.key?.fromMe) ownJids(sock).forEach((j) => voters.add(j));

  let vote = null;
  outer:
  for (const creator of entry.creators) {
    for (const voter of voters) {
      try {
        vote = baileys.decryptPollVote(
          { encPayload: update.vote.encPayload, encIv: update.vote.encIv },
          { pollCreatorJid: creator, pollMsgId: id, pollEncKey: entry.secret, voterJid: voter }
        );
        break outer;
      } catch { /* wrong spelling, try the next */ }
    }
  }
  if (!vote) { console.log("📊 a vote on the menu poll could not be decrypted (creator/voter ids did not match)"); return ""; }

  const picked = vote.selectedOptions || [];
  const option = OPTIONS.find((o) => picked.some((h) => Buffer.from(h).equals(sha256(o.label))));
  return option ? `${prefix}menu ${option.key}` : "";
}

module.exports = { OPTIONS, send, trySend, commandFromVote, ownJids, _polls: polls };
