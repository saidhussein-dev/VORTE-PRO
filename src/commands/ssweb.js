// src/commands/ssweb.js — .ssweb <url> [mobile|full]
//
// Takes a screenshot of a website and sends it as an image. No API key and no browser on the host: the picture is
// made by free public screenshot services, tried one after another until one gives a real image.
//   .ssweb example.com          desktop view (1280x720)
//   .ssweb example.com mobile   phone-sized view
//   .ssweb example.com full     the whole page, top to bottom
const axios = require("axios");
const net = require("net");
const { panel, status } = require("../utils/ui");

const TITLE = "📸 WEBSITE SCREENSHOT";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MIN_IMAGE_BYTES = 3000; // smaller than this is an error/placeholder picture, not a page
const TIMEOUT_MS = Number(process.env.SSWEB_TIMEOUT_MS) || 45000;
const deps = { get: (url, opts) => axios.get(url, opts), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Make a typed address a clean http(s) URL, or explain why not. @returns {{url?:string, error?:string}} */
function normalizeUrl(input) {
  let raw = String(input || "").trim().replace(/^<|>$/g, "");
  if (!raw) return { error: "no link" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try { u = new URL(raw); } catch { return { error: "That doesn't look like a valid link." }; }
  if (!/^https?:$/.test(u.protocol)) return { error: "Only http and https links can be screenshotted." };
  if (u.username || u.password) return { error: "Links with a username or password aren't allowed." };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isPrivateHost(host)) return { error: "That address is private to a network, so it can't be screenshotted." };
  if (!host.includes(".") && !net.isIP(host)) return { error: "That doesn't look like a website address." };
  return { url: u.toString() };
}

/** localhost, .local/.internal names and private / loopback / link-local IPs. */
function isPrivateHost(host) {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const kind = net.isIP(host);
  if (kind === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (kind === 6) return host === "::1" || host === "::" || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host) || /^::ffff:/i.test(host);
  return false;
}

/** The screenshot services, in the order they are tried. Each returns the URL that serves the picture. */
function providers(url, mode) {
  const enc = encodeURIComponent(url);
  const size = mode === "mobile" ? { w: 390, h: 844 } : { w: 1280, h: 720 };
  return [
    { name: "thum.io", url: mode === "full" ? `https://image.thum.io/get/fullpage/width/1280/noanimate/${url}` : `https://image.thum.io/get/width/${size.w}/crop/${size.h}/noanimate/${url}` },
    { name: "microlink", url: `https://api.microlink.io/?url=${enc}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=${size.w}&viewport.height=${size.h}${mode === "full" ? "&screenshot.fullPage=true" : ""}` },
    { name: "wordpress mshots", url: `https://s0.wp.com/mshots/v1/${enc}?w=${size.w}&h=${size.h}`, retries: 3 } // answers with a "still working" picture at first
  ];
}

/** Is this response a real picture of a page? */
function isRealImage(res) {
  const type = String(res?.headers?.["content-type"] || "").toLowerCase();
  const data = res?.data;
  return type.startsWith("image/") && data && data.length >= MIN_IMAGE_BYTES && data.length <= MAX_IMAGE_BYTES && !(type.includes("gif") && data.length < 20000);
}

/** Try each service until one returns a real image. @returns {Promise<{buffer:Buffer, via:string}>} */
async function capture(url, mode) {
  const errors = [];
  for (const p of providers(url, mode)) {
    for (let attempt = 0; attempt <= (p.retries || 0); attempt++) {
      try {
        const res = await deps.get(p.url, {
          responseType: "arraybuffer", timeout: TIMEOUT_MS, maxContentLength: MAX_IMAGE_BYTES, maxRedirects: 5,
          validateStatus: (s) => s === 200, headers: { "User-Agent": "Mozilla/5.0 (compatible; VORTE-PRO)" }
        });
        if (isRealImage(res)) return { buffer: Buffer.from(res.data), via: p.name };
        errors.push(`${p.name}: not a real picture`);
      } catch (e) {
        errors.push(`${p.name}: ${e.response?.status ? "HTTP " + e.response.status : e.code || e.message}`);
        break; // an error is final for this service; only a placeholder picture is worth retrying
      }
      if (attempt < (p.retries || 0)) await deps.sleep(4000);
    }
  }
  const err = new Error("None of the screenshot services could capture that page right now.");
  err.details = errors;
  throw err;
}

module.exports = {
  name: "ssweb",
  scope: "BOTH",
  description: "Screenshot a website. Usage: .ssweb <link> [mobile|full]",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const words = args.filter(Boolean);
    const mode = ["mobile", "full"].find((w) => words.slice(1).map((x) => x.toLowerCase()).includes(w)) || "desktop";
    const link = words[0];
    if (!link) return sock.sendMessage(chat, { text: panel(TITLE, ["Usage: .ssweb <link> [mobile|full]", "Example: .ssweb example.com full"]) });
    const parsed = normalizeUrl(link);
    if (parsed.error) return sock.sendMessage(chat, { text: panel(TITLE, [`❌ ${parsed.error}`]) });

    const s = await status(sock, chat, panel(TITLE, [`🌐 ${new URL(parsed.url).hostname}`, "📸 Taking the screenshot..."]), { quoted: m, buttonOnFinish: false }); // the screenshot carries the channel button
    try {
      const { buffer, via } = await capture(parsed.url, mode);
      await sock.sendMessage(chat, { image: buffer, caption: `🌐 ${parsed.url}\n📱 ${mode === "desktop" ? "Desktop view" : mode === "mobile" ? "Mobile view" : "Full page"} • ${via}` }, { quoted: m });
      await s.finish(panel(TITLE, [`🌐 ${new URL(parsed.url).hostname}`, "✅ Ready!"]));
    } catch (e) {
      console.error("❌ ssweb:", e.message, e.details || "");
      await s.fail(panel(TITLE, [`❌ ${e.message}`, "Check the link, or try again in a minute."]));
    }
  },
  _internal: { normalizeUrl, isPrivateHost, providers, isRealImage, capture, deps }
};
