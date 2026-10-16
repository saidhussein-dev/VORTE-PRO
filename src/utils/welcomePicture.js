// src/utils/welcomePicture.js — the picture shown in a welcome message: the profile picture of the member WHO JOINED.
//
// Why this is its own file: in Baileys v7 a joining member usually arrives as a LID ("1234@lid"), and asking WhatsApp for the
// picture of a LID often fails. So for each welcomed member we try every address we know for THAT member — phone number
// first, then the LID / id as given — and for each address the full picture, then the small preview. The picture is
// downloaded by the bot itself and sent as bytes, so a link that needs special handling can't break the send.
// Order of preference: the member's picture -> the group's picture -> no picture (the text welcome still goes out).
const axios = require("axios");
const baileys = require("baileys");
const identity = require("./identity");

const MAX_BYTES = 8 * 1024 * 1024;
const deps = {
  /** Download an image URL to a Buffer, or null. Replaced in tests. */
  download: async (url) => {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_BYTES, validateStatus: (s) => s === 200, headers: { "User-Agent": "Mozilla/5.0 (compatible; VORTE-PRO)" } });
    return Buffer.from(res.data);
  }
};

/** JPEG / PNG / WEBP / GIF by their first bytes (so an HTML error page is never sent as a picture). */
function isImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 500 || buf.length > MAX_BYTES) return false;
  return (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) // jpeg
    || (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG")
    || (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP")
    || buf.toString("latin1", 0, 3) === "GIF";
}

const normalize = (jid) => { try { return baileys.jidNormalizedUser(jid); } catch { return null; } };

/**
 * Every address we know for ONE participant (string or Baileys v7 object), best first:
 * phone-number JIDs, then the LID / id as given. Device suffixes removed, no duplicates.
 */
function candidatesFor(p) {
  const fields = typeof p === "string" ? [p] : [p?.phoneNumber, p?.jid, p?.id, p?.lid];
  const out = [];
  const add = (j) => { const n = j && normalize(j); if (n && !out.includes(n)) out.push(n); };
  for (const f of fields) {
    if (!f) continue;
    const pn = identity.toPn(f);                 // a learned LID -> phone mapping
    if (pn) add(`${pn}@s.whatsapp.net`);
  }
  for (const f of fields) if (f && String(f).endsWith("@s.whatsapp.net")) add(f);
  for (const f of fields) if (f) add(f);          // whatever is left (LIDs)
  return out;
}

/** First usable picture among these addresses: { buffer } | { url } | null. */
async function pictureOf(sock, jids) {
  let urlOnly = null;
  for (const jid of jids) {
    for (const type of ["image", "preview"]) {
      let url;
      try { url = await sock.profilePictureUrl(jid, type); } catch { continue; } // private / none / unknown address
      if (!url) continue;
      try {
        const buffer = await deps.download(url);
        if (isImage(buffer)) return { buffer };
      } catch { /* keep the link as a last resort for this member */ }
      urlOnly = urlOnly || url;
    }
  }
  return urlOnly ? { url: urlOnly } : null;
}

/**
 * The picture for a welcome.
 * @returns {Promise<{source:"member"|"group", image:Buffer|{url:string}}|null>}
 */
async function findWelcomePicture(sock, groupId, participant) {
  const member = await pictureOf(sock, candidatesFor(participant));
  if (member) return { source: "member", image: member.buffer || { url: member.url } };
  const group = await pictureOf(sock, [groupId]);
  if (group) return { source: "group", image: group.buffer || { url: group.url } };
  return null;
}

module.exports = { findWelcomePicture, candidatesFor, pictureOf, isImage, deps };
