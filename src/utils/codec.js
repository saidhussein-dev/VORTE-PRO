// src/utils/codec.js — encode/decode text (no APIs, no dependencies).
const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.", "@": ".--.-.", "-": "-....-", ":": "---...", "'": ".----.", "(": "-.--.", ")": "-.--.-" };
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const TYPES = ["base64", "base64url", "hex", "url", "binary", "morse", "rot13"];
const rot13 = (s) => s.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));

function encode(type, text) {
  switch (type) {
    case "base64": return Buffer.from(text, "utf8").toString("base64");
    case "base64url": return Buffer.from(text, "utf8").toString("base64url");
    case "hex": return Buffer.from(text, "utf8").toString("hex");
    case "url": return encodeURIComponent(text);
    case "binary": return [...Buffer.from(text, "utf8")].map((b) => b.toString(2).padStart(8, "0")).join(" ");
    case "morse": return [...text.toLowerCase()].map((c) => (c === " " ? "/" : MORSE[c] || "?")).join(" ");
    case "rot13": return rot13(text);
    default: throw new Error(`Unknown type "${type}". Types: ${TYPES.join(", ")}`);
  }
}

function decode(type, text) {
  const t = text.trim();
  switch (type) {
    case "base64":
    case "base64url": {
      if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(t.replace(/\s+/g, ""))) throw new Error("That isn't valid base64.");
      return Buffer.from(t.replace(/\s+/g, ""), type).toString("utf8");
    }
    case "hex": {
      const h = t.replace(/\s+/g, "").replace(/^0x/i, "");
      if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) throw new Error("That isn't valid hex (needs pairs of 0-9 a-f).");
      return Buffer.from(h, "hex").toString("utf8");
    }
    case "url": try { return decodeURIComponent(t); } catch { throw new Error("That isn't valid URL-encoding."); }
    case "binary": {
      const parts = t.split(/\s+/).filter(Boolean);
      if (!parts.length || parts.some((p) => !/^[01]{8}$/.test(p))) throw new Error("Binary must be groups of 8 digits (0/1) separated by spaces.");
      return Buffer.from(parts.map((p) => parseInt(p, 2))).toString("utf8");
    }
    case "morse": return t.split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => UNMORSE[c] ?? "?").join("")).join(" ");
    case "rot13": return rot13(text);
    default: throw new Error(`Unknown type "${type}". Types: ${TYPES.join(", ")}`);
  }
}

module.exports = { encode, decode, TYPES };
