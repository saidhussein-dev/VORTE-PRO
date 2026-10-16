// src/commands/extras.js — useful commands that need NO API, NO key and NO internet:
//   .age .bmi .tip .percent .morse .roman .numwords .countdown .zodiac .lorem
// (One file, several command names: the handler tells us which one was typed in context.commandName.)
const { panel } = require("../utils/ui");

const deps = { now: () => new Date() }; // replaced in tests

// ---------- helpers ----------
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthIndex = (word) => { const w = String(word).toLowerCase().replace(/\.$/, ""); const i = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w))); return i < 0 ? 0 : i + 1; };
const pad = (n) => String(n).padStart(2, "0");
const dayMs = 86400000;

/** Real calendar date? */
function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * "2001-05-14", "14/05/2001", "14-5-2001" (day first), "14 May 2001", "May 14 2001", "14 may" (no year), "14/05".
 * @returns {{y:number|null, m:number, d:number}|null}
 */
function parseDate(text) {
  const t = String(text || "").trim().replace(/,/g, " ").replace(/\s+/g, " ");
  let r;
  if ((r = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return mk(+r[1], +r[2], +r[3]);
  if ((r = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return mk(+r[3], +r[2], +r[1]);
  if ((r = t.match(/^(\d{1,2})[-/.](\d{1,2})$/))) return mk(null, +r[2], +r[1]);
  if ((r = t.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?$/i)) && monthIndex(r[2])) return mk(r[3] ? +r[3] : null, monthIndex(r[2]), +r[1]);
  if ((r = t.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{4}))?$/i)) && monthIndex(r[1])) return mk(r[3] ? +r[3] : null, monthIndex(r[1]), +r[2]);
  return null;
  function mk(y, m, d) { return validDate(y || 2000, m, d) ? { y, m, d } : null; } // 2000 is a leap year: "29 feb" is accepted without a year
}

const today = () => { const n = deps.now(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; };
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const ymd = (o) => `${o.y}-${pad(o.m)}-${pad(o.d)}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const fmt = (n) => { const r = Math.round(n * 100) / 100; return r.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
const num = (s) => { const v = Number(String(s).replace(/,/g, "")); return Number.isFinite(v) ? v : NaN; };

// ---------- zodiac ----------
const SIGNS = [
  ["Capricorn", "♑", "Earth", [12, 22], [1, 19]], ["Aquarius", "♒", "Air", [1, 20], [2, 18]], ["Pisces", "♓", "Water", [2, 19], [3, 20]],
  ["Aries", "♈", "Fire", [3, 21], [4, 19]], ["Taurus", "♉", "Earth", [4, 20], [5, 20]], ["Gemini", "♊", "Air", [5, 21], [6, 20]],
  ["Cancer", "♋", "Water", [6, 21], [7, 22]], ["Leo", "♌", "Fire", [7, 23], [8, 22]], ["Virgo", "♍", "Earth", [8, 23], [9, 22]],
  ["Libra", "♎", "Air", [9, 23], [10, 22]], ["Scorpio", "♏", "Water", [10, 23], [11, 21]], ["Sagittarius", "♐", "Fire", [11, 22], [12, 21]]
];
function zodiacOf(m, d) {
  const v = m * 100 + d;
  for (const [name, glyph, element, [fm, fd], [tm, td]] of SIGNS) {
    const from = fm * 100 + fd, to = tm * 100 + td;
    if (from <= to ? v >= from && v <= to : v >= from || v <= to) return { name, glyph, element, range: `${fd} ${MONTHS[fm - 1]} - ${td} ${MONTHS[tm - 1]}` };
  }
  return null;
}

// ---------- roman ----------
const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
function toRoman(n) { let out = ""; for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; } return out; }
function fromRoman(s) {
  const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) { const v = vals[s[i]], next = vals[s[i + 1]] || 0; total += v < next ? -v : v; }
  return toRoman(total) === s ? total : NaN; // only properly written numerals count (IIII, VX... are rejected)
}

// ---------- number to words ----------
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];
function below1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "")); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}
function intWords(big) {
  if (big === 0n) return "zero";
  const groups = [];
  while (big > 0n) { groups.push(Number(big % 1000n)); big /= 1000n; }
  return groups.map((g, i) => (g ? `${below1000(g)}${SCALES[i] ? " " + SCALES[i] : ""}` : "")).filter(Boolean).reverse().join(" ");
}

// ---------- morse ----------
const MORSE = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.", "@": ".--.-."
};
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

// ---------- lorem ----------
const LOREM = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum".split(" ");
const sentence = () => { const n = 8 + Math.floor(Math.random() * 9); const w = Array.from({ length: n }, () => LOREM[Math.floor(Math.random() * LOREM.length)]); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(" ") + "."; };

// ---------- the commands ----------
const handlers = {
  age(args) {
    const b = parseDate(args.join(" "));
    if (!b || !b.y) return { usage: ".age <birth date>   e.g. .age 2001-05-14  or  .age 14/05/2001" };
    const t = today();
    if (utc(b.y, b.m, b.d) > utc(t.y, t.m, t.d)) return { error: "That date is in the future." };
    let years = t.y - b.y, months = t.m - b.m, days = t.d - b.d;
    if (days < 0) { months--; days += new Date(Date.UTC(t.y, t.m - 1, 0)).getUTCDate(); }
    if (months < 0) { years--; months += 12; }
    const total = Math.round((utc(t.y, t.m, t.d) - utc(b.y, b.m, b.d)) / dayMs);
    let next = { y: t.y, m: b.m, d: b.d };
    if (utc(next.y, next.m, next.d) < utc(t.y, t.m, t.d)) next.y++;
    const nextDate = new Date(utc(next.y, next.m, next.d)); // 29 Feb in a non-leap year rolls to 1 Mar, which is right
    const until = Math.round((nextDate.getTime() - utc(t.y, t.m, t.d)) / dayMs);
    const z = zodiacOf(b.m, b.d);
    return { title: "🎂 AGE", rows: [
      `Born: ${WEEKDAYS[new Date(utc(b.y, b.m, b.d)).getUTCDay()]}, ${ymd(b)}`,
      `Age: ${plural(years, "year")}, ${plural(months, "month")}, ${plural(days, "day")}`,
      `Days lived: ${total.toLocaleString("en-US")}`,
      until === 0 ? "Next birthday: today, happy birthday! 🎉" : `Next birthday: in ${plural(until, "day")} (${WEEKDAYS[nextDate.getUTCDay()]})`,
      z ? `Zodiac: ${z.glyph} ${z.name}` : null
    ] };
  },

  bmi(args) {
    const kg = num(args[0]); let h = num(args[1]);
    if (!(kg > 0) || !(h > 0)) return { usage: ".bmi <weight kg> <height cm>   e.g. .bmi 70 175" };
    if (h <= 3) h *= 100; // given in metres
    const m = h / 100;
    if (kg < 2 || kg > 500 || m < 0.5 || m > 2.5) return { error: "Those numbers don't look right (weight in kg, height in cm)." };
    const v = kg / (m * m);
    const cat = v < 18.5 ? "Underweight" : v < 25 ? "Normal weight" : v < 30 ? "Overweight" : "Obesity";
    return { title: "⚖️ BMI", rows: [
      `Weight: ${fmt(kg)} kg   Height: ${fmt(h)} cm`,
      `BMI: ${v.toFixed(1)}  (${cat})`,
      `Healthy range for your height: ${(18.5 * m * m).toFixed(1)} - ${(24.9 * m * m).toFixed(1)} kg`,
      "", "A rough guide only, not medical advice."
    ] };
  },

  tip(args) {
    const bill = num(args[0]); const pct = args[1] === undefined ? 10 : num(args[1]); const people = args[2] === undefined ? 1 : Math.floor(num(args[2]));
    if (!(bill > 0) || !(pct >= 0 && pct <= 100) || !(people >= 1 && people <= 100)) return { usage: ".tip <bill> [percent=10] [people=1]   e.g. .tip 85000 10 3" };
    const tip = bill * pct / 100, total = bill + tip;
    return { title: "💵 TIP", rows: [
      `Bill: ${fmt(bill)}`, `Tip (${fmt(pct)}%): ${fmt(tip)}`, `Total: ${fmt(total)}`,
      people > 1 ? `Per person (${people}): ${fmt(total / people)}` : null
    ] };
  },

  percent(args) {
    const t = args.join(" ").trim();
    let r;
    if ((r = t.match(/^([\d.,]+)\s*%?\s+of\s+([\d.,]+)$/i))) { const [p, v] = [num(r[1]), num(r[2])]; return { title: "➗ PERCENT", rows: [`${fmt(p)}% of ${fmt(v)} = ${fmt(p * v / 100)}`] }; }
    if ((r = t.match(/^([\d.,]+)\s+outof\s+([\d.,]+)$/i))) { const [a, b] = [num(r[1]), num(r[2])]; if (!b) return { error: "Can't divide by zero." }; return { title: "➗ PERCENT", rows: [`${fmt(a)} is ${fmt(a / b * 100)}% of ${fmt(b)}`] }; }
    if ((r = t.match(/^([\d.,]+)\s+to\s+([\d.,]+)$/i))) { const [a, b] = [num(r[1]), num(r[2])]; if (!a) return { error: "Can't measure a change from zero." }; const c = (b - a) / a * 100; return { title: "➗ PERCENT", rows: [`${fmt(a)} to ${fmt(b)} = ${c >= 0 ? "+" : ""}${fmt(c)}% (${c >= 0 ? "increase" : "decrease"})`] }; }
    return { usage: ".percent 20 of 150   |   .percent 30 outof 120   |   .percent 80 to 100" };
  },

  morse(args) {
    const t = args.join(" ").trim().slice(0, 500);
    if (!t) return { usage: ".morse <text>   (or send morse like  .... ..  to decode it)" };
    if (/^[.\-/\s]+$/.test(t)) {
      const out = t.split(/\s*\/\s*|\s{3,}/).map((w) => w.trim().split(/\s+/).map((c) => UNMORSE[c] ?? "?").join("")).join(" ");
      return { title: "📡 MORSE → TEXT", rows: [out.toUpperCase()] };
    }
    const skipped = [];
    const out = t.toLowerCase().split(/\s+/).map((w) => [...w].map((ch) => { if (MORSE[ch]) return MORSE[ch]; skipped.push(ch); return null; }).filter(Boolean).join(" ")).filter(Boolean).join(" / ");
    if (!out) return { error: "None of those characters exist in morse code." };
    return { title: "📡 TEXT → MORSE", rows: [out, skipped.length ? `\n(left out: ${[...new Set(skipped)].join(" ")})` : null] };
  },

  roman(args) {
    const t = (args[0] || "").trim();
    if (!t) return { usage: ".roman <number 1-3999>   or   .roman <MMXXIV>" };
    if (/^\d+$/.test(t)) { const n = Number(t); if (n < 1 || n > 3999) return { error: "Roman numerals cover 1 to 3999." }; return { title: "🏛️ ROMAN", rows: [`${n} = ${toRoman(n)}`] }; }
    const n = fromRoman(t.toUpperCase());
    if (Number.isNaN(n)) return { error: "That isn't a valid Roman numeral." };
    return { title: "🏛️ ROMAN", rows: [`${t.toUpperCase()} = ${n}`] };
  },

  numwords(args) {
    const t = args.join("").replace(/[,\s]/g, "");
    if (!/^-?\d{1,15}(\.\d{1,15})?$/.test(t)) return { usage: ".numwords <number up to 15 digits>   e.g. .numwords 12345.67" };
    const neg = t.startsWith("-");
    const [i, f] = t.replace("-", "").split(".");
    let out = intWords(BigInt(i));
    if (f) out += ` point ${[...f].map((d) => ONES[Number(d)]).join(" ")}`;
    return { title: "🔤 NUMBER TO WORDS", rows: [`${neg && !/^0+(\.0+)?$/.test(t.slice(1)) ? "minus " : ""}${out}`] };
  },

  countdown(args) {
    const d = parseDate(args.join(" "));
    if (!d) return { usage: ".countdown <date>   e.g. .countdown 2026-12-25  or  .countdown 25 dec" };
    const now = deps.now(); const t = today();
    let y = d.y;
    if (!y) { y = t.y; if (utc(y, d.m, d.d) < utc(t.y, t.m, t.d)) y++; } // no year: the next time that date comes round
    const target = new Date(y, d.m - 1, d.d); // local midnight (29 Feb in a non-leap year becomes 1 Mar, and is shown as that)
    const days = Math.round((utc(target.getFullYear(), target.getMonth() + 1, target.getDate()) - utc(t.y, t.m, t.d)) / dayMs);
    const label = `${WEEKDAYS[target.getDay()]}, ${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
    if (days === 0) return { title: "⏳ COUNTDOWN", rows: [`${label}`, "That's today! 🎉"] };
    if (days < 0) return { title: "⏳ COUNTDOWN", rows: [label, `${plural(-days, "day")} ago (${Math.floor(-days / 7)} weeks, ${(-days) % 7} days)`] };
    const hours = Math.max(0, Math.round((target.getTime() - now.getTime()) / 3600000));
    return { title: "⏳ COUNTDOWN", rows: [label, `${plural(days, "day")} to go (${Math.floor(days / 7)} weeks, ${days % 7} days)`, days <= 2 ? `About ${plural(hours, "hour")}` : null] };
  },

  zodiac(args) {
    const d = parseDate(args.join(" "));
    if (!d) return { usage: ".zodiac <date>   e.g. .zodiac 14 May  or  .zodiac 14/05/2001" };
    const z = zodiacOf(d.m, d.d);
    return { title: `${z.glyph} ZODIAC`, rows: [`${pad(d.d)} ${MONTHS[d.m - 1][0].toUpperCase()}${MONTHS[d.m - 1].slice(1)}${d.y ? " " + d.y : ""}`, `Sign: ${z.name}`, `Element: ${z.element}`, `Dates: ${z.range}`] };
  },

  lorem(args) {
    const n = Math.min(Math.max(parseInt(args[0], 10) || 3, 1), 10);
    return { title: "📝 LOREM IPSUM", rows: [Array.from({ length: n }, sentence).join(" ")] };
  }
};

module.exports = {
  name: "extras",
  scope: "BOTH",
  aliases: Object.keys(handlers),
  description: "Handy tools that need no API: age, bmi, tip, percent, morse, roman, numwords, countdown, zodiac, lorem",
  async execute(sock, m, args, getSettings, saveSettings, context) {
    const chat = m.key.remoteJid;
    const name = context?.commandName;
    const run = handlers[name];
    if (!run) return sock.sendMessage(chat, { text: `Available: ${Object.keys(handlers).join(", ")}` });
    const r = run(args);
    if (r.usage) return sock.sendMessage(chat, { text: `Usage: ${r.usage}` });
    if (r.error) return sock.sendMessage(chat, { text: `❌ ${r.error}` });
    return sock.sendMessage(chat, { text: panel(r.title, r.rows) });
  },
  // exported for tests
  _internal: { parseDate, zodiacOf, toRoman, fromRoman, intWords, deps, handlers }
};
