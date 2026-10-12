// src/utils/botInfo.js — who the bot IS right now. Read live from the connection every time, never stored:
// link another WhatsApp account and every place that shows the number changes by itself.
const config = require("../config/config");
const DIAL_CODES = new Set(require("./dialCodes"));

const digitsOf = (jid) => String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

/** Phone number (digits) of the WhatsApp account currently linked to the bot, or null. */
function botNumber(sock) {
  return digitsOf(sock?.user?.id) || digitsOf(sock?.authState?.creds?.me?.id) || null;
}

/** "255700000000" -> "+255 700 000 000" (country code by longest known match; the rest in groups of 3, last group 3-4). */
function formatPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  const cc = [3, 2, 1].map((n) => d.slice(0, n)).find((c) => DIAL_CODES.has(c) && d.length > c.length + 3);
  if (!cc) return "+" + d;
  let rest = d.slice(cc.length); const groups = [];
  while (rest.length > 4) { groups.push(rest.slice(0, 3)); rest = rest.slice(3); }
  groups.push(rest);
  return `+${cc} ${groups.join(" ")}`;
}

/** The linked account's number, nicely written — or a clear placeholder. */
const botPhone = (sock) => { const n = botNumber(sock); return n ? formatPhone(n) : "not connected"; };

/** Owner number(s) from OWNER_1 / OWNER_2; when none is configured the linked account itself is the owner. */
function ownerNumbers(sock) {
  const set = [config.owner1, config.owner2].filter(Boolean);
  if (set.length) return set;
  const own = botNumber(sock);
  return own ? [own] : [];
}

/** Owner numbers, nicely written. */
const ownerPhones = (sock) => ownerNumbers(sock).map(formatPhone);

module.exports = { botNumber, botPhone, ownerNumbers, ownerPhones, formatPhone, digitsOf };
