// src/commands/dltest.js — one message that tells you WHY a download fails (owner only).
//   .dltest            -> yt-dlp / ffmpeg / cookies / JavaScript runtime status
//   .dltest update     -> update yt-dlp right now (it also updates itself daily)
//   .dltest <link>     -> the same + what formats the link offers and which one would be used
const runner = require("../services/downloaders/ytdlpRunner");
const ytdlp = require("../services/downloaders/ytdlp");
const urlDetector = require("../services/downloaders/urlDetector");
const { ensureFfmpeg, describe } = require("../services/downloaders/ffmpegCheck");
const { panel } = require("../utils/ui");

const TITLE = "🧪 DOWNLOAD CHECK";
const lastLines = (txt, n) => String(txt || "").trim().split("\n").filter(Boolean).slice(-n).join("\n");

module.exports = {
  name: "dltest",
  scope: "OWNER",
  description: "Diagnose downloads (owner only): .dltest [link] — shows yt-dlp, ffmpeg, cookies and what a link offers",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const url = (args[0] || "").trim();
    const lines = [];

    if (url.toLowerCase() === "update") {
      const before = await runner.version().catch(() => null);
      const r = await runner.updateNow({ force: true });
      return sock.sendMessage(chat, { text: panel(TITLE, [
        r.updated ? `✅ yt-dlp updated: ${r.from || before || "?"} → ${r.to || "latest"}` : r.error ? `❌ Update failed: ${r.error}` : `ℹ️ ${r.reason || "No update was needed"}${r.from ? ` (${r.from})` : ""}`
      ]) });
    }

    const ver = await runner.version().catch(() => null);
    lines.push(`yt-dlp: ${ver ? "✅ " + ver : "❌ not available (couldn't download it — check the host's internet access)"}`);

    await ensureFfmpeg();
    const ff = describe();
    lines.push(`ffmpeg: ${ff.available ? "✅ " + (ff.via === "system" ? "on the host" : ff.via === "npm" ? "bundled (npm)" : ff.via) : "❌ not available (only single-stream videos and m4a audio will work)"}`);

    const ck = runner.cookieSummary();
    lines.push(!ck ? "cookies: — none (put cookies.json next to index.js if YouTube/Instagram ask you to sign in)"
      : ck.error ? `cookies: ❌ ${ck.file} could not be read`
      : `cookies: ✅ ${require("path").basename(ck.file)} · ${ck.count} cookies · ${ck.domains.slice(0, 4).join(", ")}${ck.login ? "" : " · ⚠️ no login cookie (export again while logged in)"}`);
    const h = runner.health();
    lines.push(`js runtime: ${h.jsRuntime ? (h.nodeOk ? "✅ node " + h.node : `❌ node ${h.node} is too old — YouTube needs Node 22+`) : "off (YTDLP_JS_RUNTIME=off)"}`);
    lines.push(`network: ${h.ipv4 ? "IPv4 forced" : "IPv4+IPv6"} · proxy: ${process.env.YTDLP_PROXY ? "set" : "none"}`);
    lines.push(`updates: ${h.managed ? "yt-dlp updates itself daily (.dltest update = now)" : "yt-dlp is provided by the host — update it there"}`);

    if (!url) {
      lines.push("", "Send  .dltest <link>  to see what a link offers.");
      return sock.sendMessage(chat, { text: panel(TITLE, lines) });
    }

    const platform = urlDetector.detect(url);
    lines.push("", `link: ${url.slice(0, 80)}`, `platform: ${platform ? platform.platform : "unknown"}`);

    // 1) what the source offers
    let table = null;
    try {
      table = await runner.exec(url, { listFormats: true, noWarnings: true, noPlaylist: true }, { timeout: 60000 });
    } catch (err) {
      lines.push(`formats: ❌ ${ytdlp.classifyError(err)}`, `yt-dlp said: ${lastLines(err.stderr || err.message, 2).slice(0, 300)}`);
    }
    if (table) {
      const rows = table.split("\n").filter((l) => /^\S+\s+\S+\s/.test(l) && !/^(ID|format|\[|-)/.test(l));
      lines.push(`formats (${rows.length}):`, ...rows.slice(0, 12).map((r) => r.replace(/\s{2,}/g, "  ").slice(0, 90)), rows.length > 12 ? `… and ${rows.length - 12} more` : null);
      // 2) which one would be used
      const sel = ff.available ? "bv*[height<=?480]+ba/b[height<=?480]/bv*+ba/b" : "b[height<=?480][ext=mp4]/b[height<=?480]/b";
      try {
        const out = await runner.exec(url, { format: sel, formatSort: "res:480,vcodec:h264,acodec:aac", print: "format_id", simulate: true, noWarnings: true, noPlaylist: true }, { timeout: 60000 });
        lines.push(`would download: ✅ format ${out.trim().split("\n").join(" + ") || "?"}${ff.available ? " (joined with ffmpeg if separate)" : ""}`);
      } catch (err) {
        lines.push(/requested format is not available/i.test(String(err.stderr || ""))
          ? `would download: ❌ ${ff.available ? "no usable format" : "only separate picture/sound streams exist, and ffmpeg isn't available to join them"}`
          : `would download: ❌ ${ytdlp.classifyError(err)}`);
      }
    }
    await sock.sendMessage(chat, { text: panel(TITLE, lines.filter((l) => l !== null)).slice(0, 3800) });
  }
};
