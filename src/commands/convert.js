// src/commands/convert.js — .convert <number> <unit> to <unit>
const { panel } = require("../utils/ui");

// factor to the base unit of each group (data uses 1024)
const GROUPS = {
  length: { base: "m", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
  mass: { base: "kg", units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 } },
  volume: { base: "l", units: { ml: 0.001, l: 1, tsp: 0.00492892159375, tbsp: 0.01478676478125, floz: 0.0295735295625, cup: 0.2365882365, gal: 3.785411784 } },
  speed: { base: "m/s", units: { "m/s": 1, kmh: 1 / 3.6, mph: 0.44704, kn: 1852 / 3600 } },
  data: { base: "b", units: { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 } },
  time: { base: "s", units: { s: 1, min: 60, h: 3600, d: 86400, wk: 604800 } },
  temperature: { base: "c", units: { c: 1, f: 1, k: 1 } }
};
const SYN = { millimeter: "mm", millimeters: "mm", millimetre: "mm", centimeter: "cm", centimeters: "cm", centimetre: "cm", meter: "m", meters: "m", metre: "m", metres: "m", kilometer: "km", kilometers: "km", kilometre: "km", kilometres: "km", kms: "km", inch: "in", inches: "in", foot: "ft", feet: "ft", yard: "yd", yards: "yd", mile: "mi", miles: "mi",
  milligram: "mg", milligrams: "mg", gram: "g", grams: "g", kilogram: "kg", kilograms: "kg", kgs: "kg", tonne: "t", tonnes: "t", ton: "t", ounce: "oz", ounces: "oz", pound: "lb", pounds: "lb", lbs: "lb",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", liter: "l", liters: "l", litre: "l", litres: "l", teaspoon: "tsp", tablespoon: "tbsp", "fl oz": "floz", cups: "cup", gallon: "gal", gallons: "gal",
  "km/h": "kmh", kph: "kmh", kmph: "kmh", mps: "m/s", ms: "m/s", knot: "kn", knots: "kn", kt: "kn",
  byte: "b", bytes: "b", kilobyte: "kb", kilobytes: "kb", megabyte: "mb", megabytes: "mb", gigabyte: "gb", gigabytes: "gb", terabyte: "tb", terabytes: "tb",
  second: "s", seconds: "s", sec: "s", secs: "s", minute: "min", minutes: "min", mins: "min", hour: "h", hours: "h", hr: "h", hrs: "h", day: "d", days: "d", week: "wk", weeks: "wk",
  celsius: "c", "°c": "c", fahrenheit: "f", "°f": "f", kelvin: "k" };
const norm = (u) => { const x = u.toLowerCase().replace(/\.$/, ""); return SYN[x] || x; };
const groupOf = (u) => Object.keys(GROUPS).find((g) => u in GROUPS[g].units);

function toC(v, u) { return u === "c" ? v : u === "f" ? (v - 32) * 5 / 9 : v - 273.15; }
function fromC(c, u) { return u === "c" ? c : u === "f" ? c * 9 / 5 + 32 : c + 273.15; }

/** @returns {{value:number, from:string, to:string, result:number, group:string}} or throws a friendly Error */
function convert(value, fromRaw, toRaw) {
  const from = norm(fromRaw), to = norm(toRaw);
  const gf = groupOf(from), gt = groupOf(to);
  if (!gf) throw new Error(`I don't know the unit "${fromRaw}".`);
  if (!gt) throw new Error(`I don't know the unit "${toRaw}".`);
  if (gf !== gt) throw new Error(`Can't convert ${gf} (${from}) to ${gt} (${to}).`);
  const result = gf === "temperature" ? fromC(toC(value, from), to) : (value * GROUPS[gf].units[from]) / GROUPS[gf].units[to];
  return { value, from, to, result, group: gf };
}
const fmt = (n) => String(Number(n.toPrecision(7)));

module.exports = {
  name: "convert",
  scope: "BOTH",
  description: "Convert units. Usage: .convert 10 km to mi  (length, weight, volume, speed, data, time, temperature)",
  convert,
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const text = args.join(" ");
    const mt = /^\s*(-?\d+(?:[.,]\d+)?)\s*([^\s]+(?:\s+oz)?)\s+(?:to|in|into|->|=)\s+(\S+)\s*$/i.exec(text);
    if (!mt) {
      return sock.sendMessage(chat, { text: panel("📐 CONVERT", ["Usage: .convert <number> <unit> to <unit>", "e.g. .convert 10 km to mi · .convert 100 c to f · .convert 2 gb to mb", "", "length: mm cm m km in ft yd mi", "weight: mg g kg t oz lb", "volume: ml l tsp tbsp floz cup gal", "speed: m/s kmh mph kn", "data: b kb mb gb tb (1 kb = 1024 b)", "time: s min h d wk", "temperature: c f k"]) });
    }
    try {
      const r = convert(parseFloat(mt[1].replace(",", ".")), mt[2], mt[3]);
      await sock.sendMessage(chat, { text: panel("📐 CONVERT", [`${fmt(r.value)} ${r.from} = ${fmt(r.result)} ${r.to}`]) });
    } catch (e) {
      await sock.sendMessage(chat, { text: panel("📐 CONVERT", [`❌ ${e.message}`, "Send .convert to see the units."]) });
    }
  }
};
