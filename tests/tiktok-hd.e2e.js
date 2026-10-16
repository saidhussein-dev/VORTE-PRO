// TikTok: highest resolution, never the watermarked "download" format. Uses a FAKE yt-dlp (no network).
// Run: node tests/tiktok-hd.e2e.js
const fs = require("fs"), os = require("os"), path = require("path");
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? "✅" : "❌"} ${n}${ok ? "" : " -> " + (typeof d === "string" ? d : JSON.stringify(d))}`); };
const section = (t) => console.log(`\n[${t}]`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "faketik-"));
const fake = path.join(dir, "yt-dlp"); const log = path.join(dir, "calls.log");
fs.writeFileSync(fake, `#!/bin/sh
case "$*" in *--version*) echo 2099.01.01; exit 0;; esac
echo "$*" >> "${log}"
case "$*" in *"format_id!=download"*) [ -n "$FAKE_NO_CLEAN" ] && { echo "ERROR: Requested format is not available" >&2; exit 1; } ; fid="h264_1080p"; h=1080;; *) fid="download"; h=540;; esac
out=""; prev=""
for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done
out=$(printf '%s' "$out" | sed "s/%(ext)s/mp4/")
[ -n "$out" ] && echo data > "$out"
printf '{"title": "Dance", "ext": "mp4", "filepath": "%s", "format_id": "%s", "height": %s}\\n' "$out" "$fid" "$h"
exit 0
`, { mode: 0o755 });
process.env.YTDLP_PATH = fake;

const ytdlp = require("../src/services/downloaders/ytdlp");
const downloaders = require("../src/services/downloaders");
const M = require("./_mock");
const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []);

(async () => {
  section("TikTok: best resolution, clean copy");
  fs.rmSync(log, { force: true });
  const r = await ytdlp.downloadVideo("https://www.tiktok.com/@a/video/1", { platform: "tiktok" });
  const first = calls()[0] || "";
  check("asks for formats other than 'download' (the watermarked one)", first.includes("format_id!=download"), first);
  check("no 480p cap: sorted by resolution first", /--format-sort res,vcodec:h264/.test(first) && !/height<=/.test(first), first);
  check("the result says which format and height it got", r.formatId === "h264_1080p" && r.height === 1080, r);
  downloaders.cleanup(r.filePath);

  section("TikTok offers only the watermarked copy -> falls back, and says so");
  fs.rmSync(log, { force: true }); process.env.FAKE_NO_CLEAN = "1";
  const r2 = await ytdlp.downloadVideo("https://www.tiktok.com/@a/video/2", { platform: "tiktok" });
  check("two attempts: clean first, then anything", calls().length === 2 && calls()[0].includes("format_id!=download") && !calls()[1].includes("format_id!=download"), calls());
  check("the result is flagged as the watermarked 'download' format", r2.formatId === "download", r2);
  downloaders.cleanup(r2.filePath); delete process.env.FAKE_NO_CLEAN;

  section("other sites keep the 480p WhatsApp-friendly default");
  fs.rmSync(log, { force: true });
  const r3 = await ytdlp.downloadVideo("https://www.youtube.com/watch?v=x");
  const yt = calls()[0] || "";
  check("YouTube etc.: still capped at 480", /height<=\?480/.test(yt) && !yt.includes("format_id!=download"), yt);
  downloaders.cleanup(r3.filePath);

  section(".tiktok command: caption shows quality; warns when watermarked");
  const cmd = require("../src/commands/tiktok");
  const sendWith = async (result) => {
    const s = M.makeSock(); const real = downloaders.downloadVideoFromUrl; let opts;
    downloaders.downloadVideoFromUrl = async (url, o) => { opts = o; const f = path.join(dir, "v.mp4"); fs.writeFileSync(f, "x"); return { filePath: f, title: "Dance", sizeBytes: 1, format: "mp4", ...result }; };
    await cmd.execute(s, M.privateMsg(".tiktok x"), ["https://www.tiktok.com/@a/video/1"]);
    downloaders.downloadVideoFromUrl = real;
    return { video: s.sent.find((x) => x.content.video)?.content, opts };
  };
  const a = await sendWith({ formatId: "h264_1080p", height: 1080 });
  check("the command asks for the TikTok mode", a.opts?.platform === "tiktok", a.opts);
  check("caption shows 1080p and no warning", /1080p/.test(a.video?.caption || "") && !/watermark/.test(a.video?.caption || ""), a.video?.caption);
  const b = await sendWith({ formatId: "download", height: 540 });
  check("caption warns when only the watermarked copy existed", /watermarked copy/.test(b.video?.caption || ""), b.video?.caption);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
