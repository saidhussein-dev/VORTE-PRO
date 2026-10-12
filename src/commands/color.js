// src/commands/color.js — .color <name | #hex | rgb(r,g,b) | r g b>
const { COLORS, resolveColor } = require("../utils/colors");
const { panel } = require("../utils/ui");

const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = ([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0; const l = (max + min) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
  }
  return [h, Math.round(s * 100), Math.round(l * 100)];
}
const NAMED = Object.entries(COLORS).filter(([n]) => n !== "whatsapp").map(([n, h]) => [n, hex2rgb("#" + h)]);
function nearestName(rgb) {
  let best = null, dist = Infinity;
  for (const [n, c] of NAMED) { const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2; if (d < dist) { dist = d; best = n; } }
  return { name: best, exact: dist === 0 };
}

/** @returns {number[]|null} [r,g,b] */
function parseColor(input) {
  const s = input.trim().toLowerCase();
  let m;
  if ((m = /^#?([0-9a-f]{6})$/.exec(s))) return hex2rgb("#" + m[1]);
  if ((m = /^#?([0-9a-f]{3})$/.exec(s))) return hex2rgb("#" + m[1].split("").map((c) => c + c).join(""));
  if ((m = /^(?:rgb\(\s*)?(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/.exec(s))) { const v = [+m[1], +m[2], +m[3]]; return v.every((x) => x <= 255) ? v : null; }
  const h = resolveColor(s); return h ? hex2rgb(h) : null;
}

module.exports = {
  name: "color",
  scope: "BOTH",
  description: "Convert a colour. Usage: .color <name | #hex | rgb(r,g,b)>",
  parseColor,
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const input = args.join(" ");
    if (!input) return sock.sendMessage(chat, { text: panel("🎨 COLOR", ["Usage: .color <name | #hex | rgb(r,g,b)>", "e.g. .color teal  ·  .color #ff8800  ·  .color 255 0 128"]) });
    const rgb = parseColor(input);
    if (!rgb) return sock.sendMessage(chat, { text: panel("🎨 COLOR", [`❌ I don't understand "${input}".`, "Use a colour name (red, dark blue), #hex, or rgb(r,g,b)."]) });
    const { name, exact } = nearestName(rgb), [h, s, l] = rgb2hsl(rgb);
    await sock.sendMessage(chat, { text: panel("🎨 COLOR", [`Name: ${name}${exact ? "" : " (nearest)"}`, `HEX: ${toHex(rgb).toUpperCase()}`, `RGB: rgb(${rgb.join(", ")})`, `HSL: hsl(${h}, ${s}%, ${l}%)`]) });
  }
};
