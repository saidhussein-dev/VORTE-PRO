// src/utils/identity.js
// ONE place that answers "who is this?" for Baileys v7, where the same person can
// appear as a phone JID (123@s.whatsapp.net) or a LID (999@lid), with or without
// a ":device" suffix, and group participants carry { id, lid, phoneNumber, admin }.
//
// Every permission check (owner / sudo / group admin / bot admin) goes through here.
// Identifiers are domain-tagged keys ("pn:255..." / "lid:999...") so a LID number can
// never be confused with a phone number.

const GROUP_CACHE_TTL_MS = 15000;

const lidToPn = new Map();        // lid user -> phone digits   (learned at runtime)
const pnToLid = new Map();        // phone digits -> lid user
const metaCache = new Map();      // group jid -> { at, meta }
const MAX_ENTRIES = 5000;
/** Keep a Map from growing forever: drop the oldest entries. */
function cap(map) { while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value); }

/** "255778271055:12@s.whatsapp.net" -> { user: "255778271055", server: "s.whatsapp.net" } */
function parse(jid) {
  if (!jid || typeof jid !== "string") return null;
  const [userPart, server = "s.whatsapp.net"] = jid.split("@");
  const user = userPart.split(":")[0];
  if (!user) return null;
  return { user, server };
}

/** Domain-tagged key for a JID, or null for non-user JIDs (groups, broadcasts…). */
function keyOf(jid) {
  const p = parse(jid);
  if (!p) return null;
  if (p.server === "lid") return `lid:${p.user}`;
  if (p.server === "s.whatsapp.net" || p.server === "c.us") return `pn:${p.user.replace(/[^0-9]/g, "")}`;
  return null;
}

/** Remember that a LID and a phone JID are the same person. */
function learn(a, b) {
  const ka = keyOf(a), kb = keyOf(b);
  if (!ka || !kb || ka === kb) return;
  const [lidKey, pnKey] = ka.startsWith("lid:") ? [ka, kb] : [kb, ka];
  if (!lidKey.startsWith("lid:") || !pnKey.startsWith("pn:")) return;
  const lid = lidKey.slice(4), pn = pnKey.slice(3);
  if (pn) { lidToPn.set(lid, pn); pnToLid.set(pn, lid); cap(lidToPn); cap(pnToLid); }
}

/** All keys that identify this JID (itself + any learned counterpart). */
function keysOf(jid) {
  const k = keyOf(jid);
  if (!k) return [];
  const out = [k];
  if (k.startsWith("lid:") && lidToPn.has(k.slice(4))) out.push(`pn:${lidToPn.get(k.slice(4))}`);
  if (k.startsWith("pn:") && pnToLid.has(k.slice(3))) out.push(`lid:${pnToLid.get(k.slice(3))}`);
  return out;
}

/** Phone digits for a JID if known (directly or via a learned LID mapping), else null. */
function toPn(jid) {
  const k = keyOf(jid);
  if (!k) return null;
  if (k.startsWith("pn:")) return k.slice(3);
  return lidToPn.get(k.slice(4)) || null;
}

/** Keys for a group participant object (handles every field shape Baileys v7 uses). */
function participantKeys(p) {
  const ids = [p?.id, p?.lid, p?.phoneNumber, p?.jid].filter(Boolean);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) learn(ids[i], ids[j]);
  return [...new Set(ids.flatMap(keysOf))];
}

const isAdminFlag = (p) => p?.admin === "admin" || p?.admin === "superadmin" || p?.admin === true;

/** The bot's own identifiers (phone JID + LID, both device-stripped). */
function botKeys(sock) {
  const u = sock?.user || {};
  learn(u.id, u.lid);
  return [...new Set([u.id, u.lid].filter(Boolean).flatMap(keysOf))];
}

/** Group metadata with a short cache (so one command ≠ many network calls) and LID learning. */
async function getMetadata(sock, chat, { force = false } = {}) {
  const hit = metaCache.get(chat);
  if (!force && hit && Date.now() - hit.at < GROUP_CACHE_TTL_MS) return hit.meta;
  const meta = await sock.groupMetadata(chat);
  (meta?.participants || []).forEach(participantKeys); // learns lid <-> phone pairs
  metaCache.set(chat, { at: Date.now(), meta });
  cap(metaCache);
  return meta;
}

/** Call when membership/admin roles change (group-participants.update). */
function invalidate(chat) {
  if (chat) metaCache.delete(chat); else metaCache.clear();
}

/**
 * Work out every identifier of the message sender and learn LID<->phone pairs from
 * everything the message carries. Call once per incoming message, before permission
 * checks. Returns the sender's phone digits when they can be resolved.
 */
async function resolveSender(sock, m) {
  const key = m?.key || {};
  const chat = key.remoteJid;
  const sender = key.participant || key.remoteJid;

  learn(key.participant, key.participantAlt);
  learn(key.remoteJid, key.remoteJidAlt);

  if (key.fromMe) learn(sock?.user?.id, sock?.user?.lid);

  if (keyOf(sender)?.startsWith("lid:") && !toPn(sender)) {
    // 1) Baileys v7's own LID store
    try {
      const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(sender);
      if (pn) learn(sender, pn);
    } catch { /* optional API */ }
    // 2) group metadata lists both ids for each participant
    if (!toPn(sender) && chat?.endsWith("@g.us")) {
      try { await getMetadata(sock, chat); } catch { /* fall through */ }
    }
  }
  return toPn(sender);
}

/** Is `user` (JID string, or array of JIDs) an admin/superadmin of `chat`? */
async function isGroupAdmin(sock, chat, user) {
  if (!chat?.endsWith("@g.us") || !user) return false;
  const want = new Set([].concat(user).flatMap(keysOf));
  if (!want.size) return false;
  try {
    let meta = await getMetadata(sock, chat);
    let found = (meta.participants || []).find((p) => isAdminFlag(p) && participantKeys(p).some((k) => want.has(k)));
    if (!found) { // roles may have just changed — one forced refresh before saying "no"
      meta = await getMetadata(sock, chat, { force: true });
      found = (meta.participants || []).find((p) => isAdminFlag(p) && participantKeys(p).some((k) => want.has(k)));
    }
    return !!found;
  } catch (e) {
    console.error("❌ admin check failed:", e.message);
    return false;
  }
}

/** Is the bot an admin of `chat`? */
async function isBotGroupAdmin(sock, chat) {
  return isGroupAdmin(sock, chat, [sock?.user?.id, sock?.user?.lid].filter(Boolean));
}

module.exports = { parse, keyOf, keysOf, learn, toPn, participantKeys, botKeys, getMetadata, invalidate, resolveSender, isGroupAdmin, isBotGroupAdmin, isAdminFlag };
