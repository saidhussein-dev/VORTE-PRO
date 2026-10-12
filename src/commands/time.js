// src/commands/time.js — .time [place]   (a city, a country, or an IANA zone like Africa/Nairobi)
const { panel } = require("../utils/ui");

const ALIASES = { tanzania: "Africa/Dar_es_Salaam", dar: "Africa/Dar_es_Salaam", "dar es salaam": "Africa/Dar_es_Salaam", kenya: "Africa/Nairobi", uganda: "Africa/Kampala", rwanda: "Africa/Kigali", nigeria: "Africa/Lagos", ghana: "Africa/Accra", "south africa": "Africa/Johannesburg", egypt: "Africa/Cairo", ethiopia: "Africa/Addis_Ababa",
  uk: "Europe/London", england: "Europe/London", france: "Europe/Paris", germany: "Europe/Berlin", spain: "Europe/Madrid", italy: "Europe/Rome", russia: "Europe/Moscow", turkey: "Europe/Istanbul",
  usa: "America/New_York", us: "America/New_York", california: "America/Los_Angeles", texas: "America/Chicago", canada: "America/Toronto", brazil: "America/Sao_Paulo", mexico: "America/Mexico_City",
  uae: "Asia/Dubai", saudi: "Asia/Riyadh", "saudi arabia": "Asia/Riyadh", india: "Asia/Kolkata", pakistan: "Asia/Karachi", china: "Asia/Shanghai", japan: "Asia/Tokyo", korea: "Asia/Seoul", indonesia: "Asia/Jakarta", singapore: "Asia/Singapore", australia: "Australia/Sydney", "new zealand": "Pacific/Auckland" };
const DEFAULTS = ["Africa/Dar_es_Salaam", "Europe/London", "America/New_York", "Asia/Dubai", "Asia/Tokyo"];
const zones = () => { try { return Intl.supportedValuesOf("timeZone"); } catch { return []; } };
const norm = (s) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();

/** @returns {string|null} IANA zone */
function resolveZone(q) {
  const n = norm(q);
  if (ALIASES[n]) return ALIASES[n];
  try { return new Intl.DateTimeFormat("en", { timeZone: q.trim() }).resolvedOptions().timeZone; } catch { /* not an exact zone */ }
  const all = zones();
  const byCity = all.find((z) => norm(z.split("/").pop()) === n) || all.find((z) => norm(z.split("/").pop()).startsWith(n)) || all.find((z) => norm(z).includes(n));
  return byCity || null;
}
function describe(zone, now = new Date()) {
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const off = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "";
  return { city: zone.split("/").pop().replace(/_/g, " "), when, off: off.replace("GMT", "UTC") || "UTC" };
}

module.exports = {
  name: "time",
  scope: "BOTH",
  description: "Current time anywhere. Usage: .time <city | country | Africa/Nairobi>  (no place = a few big cities)",
  resolveZone, describe,
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const q = args.join(" ").trim();
    const list = q ? [resolveZone(q)] : DEFAULTS;
    if (!list[0]) return sock.sendMessage(chat, { text: panel("🕒 TIME", [`❌ I don't know a place called "${q}".`, "Try a city (nairobi), a country (kenya) or a zone like Africa/Nairobi."]) });
    const lines = list.map((z) => { const d = describe(z); return `${d.city}: ${d.when} (${d.off})`; });
    await sock.sendMessage(chat, { text: panel("🕒 TIME", lines) });
  }
};
