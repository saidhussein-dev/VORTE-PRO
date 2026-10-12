// Downloads with the REAL yt-dlp binary against a local server that behaves like YouTube/Instagram/TikTok:
// single-stream video, DASH (separate picture + sound), HLS with a separate audio track.
// It downloads the yt-dlp binary (~40 MB) on first run, so it is opt-in:   REAL_DOWNLOAD_TESTS=1 node tests/downloads-real.e2e.js
if (process.env.REAL_DOWNLOAD_TESTS !== "1") { console.log("SKIPPED: set REAL_DOWNLOAD_TESTS=1 to run (needs internet once, to fetch yt-dlp)"); console.log("\nRESULT: 0 passed, 0 failed"); process.exit(0); }
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), { execFileSync } = require("child_process");
process.env.OWNER_1 = process.env.OWNER_1 || "255700000001";
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? "✅" : "❌"} ${n}${ok ? "" : "  -> " + (typeof d === "string" ? d : JSON.stringify(d))}`); };
const section = (t) => console.log(`\n[${t}]`);

let FF, FP;
try { FF = require("@ffmpeg-installer/ffmpeg").path; FP = require("@ffprobe-installer/ffprobe").path; } catch { console.log("SKIPPED: the bundled ffmpeg packages are not installed (npm install)"); console.log("\nRESULT: 0 passed, 0 failed"); process.exit(0); }

const ytdlp = require("../src/services/downloaders/ytdlp");
const runner = require("../src/services/downloaders/ytdlpRunner");
const ffcheck = require("../src/services/downloaders/ffmpegCheck");
const downloaders = require("../src/services/downloaders");
const { runDownload, readFile } = require("../src/utils/downloadUx");
const M = require("./_mock");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "dltest-"));
// fixtures are made with a modern ffmpeg when the host has one (the bundled one is old and can't write some HLS layouts)
let MAKER = FF; try { execFileSync("ffmpeg", ["-version"], { stdio: "pipe" }); MAKER = "ffmpeg"; } catch { /* use the bundled one */ }
const sh = (bin, args) => execFileSync(bin, args, { stdio: "pipe" });
const streams = (file) => execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]).toString().trim().split("\n").sort();
const leftovers = () => (fs.existsSync(ytdlp.TMP_DIR) ? fs.readdirSync(ytdlp.TMP_DIR) : []);
const noFfmpeg = () => { process.env.FFMPEG_DISABLE = "true"; ffcheck._reset(); };
const withFfmpeg = () => { delete process.env.FFMPEG_DISABLE; ffcheck._reset(); };

// ---- fixtures ----
sh(MAKER, ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(work, "single.mp4")]);
fs.mkdirSync(path.join(work, "hls")); fs.mkdirSync(path.join(work, "dash"));
let HLS_OK = true, DASH_OK = true;
try { sh(MAKER, ["-loglevel", "error", "-i", path.join(work, "single.mp4"), "-map", "0:v", "-map", "0:a", "-c", "copy", "-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod", "-var_stream_map", "v:0,agroup:aud a:0,agroup:aud,default:yes", "-master_pl_name", "master.m3u8", "-hls_segment_filename", path.join(work, "hls/s_%v_%03d.ts"), path.join(work, "hls/p_%v.m3u8")]); } catch (e) { HLS_OK = false; console.log("  (HLS fixture not created on this host — HLS checks skipped)"); }
try { sh(MAKER, ["-loglevel", "error", "-i", path.join(work, "single.mp4"), "-map", "0:v", "-map", "0:a", "-c", "copy", "-f", "dash", "-seg_duration", "1", "-adaptation_sets", "id=0,streams=v id=1,streams=a", path.join(work, "dash/manifest.mpd")]); } catch (e) { DASH_OK = false; console.log("  (DASH fixture not created on this host — DASH checks skipped)"); }
const SPLIT_PAGES = ["dash.html", "split.html"].filter((p) => (p === "dash.html" ? DASH_OK : HLS_OK));

let PORT;
const server = http.createServer((req, res) => {
  const u = req.url.split("?")[0];
  const page = (title, body) => { res.setHeader("Content-Type", "text/html"); res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`); };
  if (u === "/single.html") return page("Single stream", `<video src="http://127.0.0.1:${PORT}/single.mp4"></video>`);
  if (u === "/dash.html") return page("Dash streams", `<video><source src="http://127.0.0.1:${PORT}/dash/manifest.mpd" type="application/dash+xml"></video>`);
  if (u === "/split.html") return page("Split streams", `<video src="http://127.0.0.1:${PORT}/hls/master.m3u8"></video>`);
  if (u === "/novideo.html") return page("Nothing here", "<p>just text</p>");
  if (u === "/hang.html") return; // never answers
  const file = path.join(work, u);
  if (file.startsWith(work) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file);
    res.setHeader("Content-Type", ext === ".mp4" ? "video/mp4" : ext === ".mpd" ? "application/dash+xml" : ext === ".m3u8" ? "application/vnd.apple.mpegurl" : ext === ".ts" ? "video/mp2t" : ext === ".m4s" ? "video/iso.segment" : "application/octet-stream");
    res.setHeader("Content-Length", fs.statSync(file).size);
    return fs.createReadStream(file).pipe(res);
  }
  res.statusCode = 404; res.end("nope");
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); PORT = server.address().port;
  const U = (name) => `http://127.0.0.1:${PORT}/${name}`;
  console.log("preparing yt-dlp (first run downloads it)...");
  if (!(await ytdlp.ensureBinary())) { console.log("SKIPPED: could not get the yt-dlp binary (no internet?)"); console.log("\nRESULT: 0 passed, 0 failed"); process.exit(0); }
  console.log("yt-dlp", await runner.version());

  section("single stream (like most TikTok links) — NO ffmpeg");
  noFfmpeg();
  let r = await ytdlp.downloadVideo(U("single.html"));
  check("downloads, real mp4 with picture AND sound", r.format === "mp4" && JSON.stringify(streams(r.filePath)) === '["audio","video"]', [r.format, streams(r.filePath)]);
  check("title comes from the same single yt-dlp call", /Single stream/.test(r.title), r.title);
  check("only the finished file is left in the temp folder", leftovers().length === 1 && leftovers()[0] === path.basename(r.filePath), leftovers());
  ytdlp.cleanup(r.filePath);
  check("cleanup leaves nothing behind", leftovers().length === 0, leftovers());

  section("separate picture + sound (YouTube / Instagram style) — NO ffmpeg");
  for (const page of SPLIT_PAGES) {
    const err = await ytdlp.downloadVideo(U(page)).then(() => null, (e) => e);
    check(`${page}: says ffmpeg is needed — NOT the vague 'no downloadable format'`, err && err.code === "NEEDS_FFMPEG" && /ffmpeg/.test(err.message) && !/No downloadable format/.test(err.message), err && err.message);
    check(`${page}: no half-downloaded files left`, leftovers().length === 0, leftovers());
  }

  section("separate picture + sound — WITH ffmpeg (system, then the bundled npm one)");
  for (const mode of ["system", "npm"]) {
    withFfmpeg();
    const savedPath = process.env.PATH;
    if (mode === "npm") process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), "emptypath-")); // an empty PATH hides the host's ffmpeg so the bundled one is used
    const ff = await ffcheck.ensureFfmpeg();
    check(`ffmpeg found via: ${mode}`, ff && ff.via === mode, ff && ff.via);
    for (const page of SPLIT_PAGES) {
      const out = await ytdlp.downloadVideo(U(page)).catch((e) => e);
      check(`${mode} / ${page}: joined into ONE mp4 with picture and sound`, out.filePath && out.format === "mp4" && JSON.stringify(streams(out.filePath)) === '["audio","video"]', out.message || [out.format, out.filePath && streams(out.filePath)]);
      check(`${mode} / ${page}: only the finished file remains`, !out.filePath || (leftovers().length === 1), leftovers());
      if (out.filePath) ytdlp.cleanup(out.filePath);
    }
    const s = await ytdlp.downloadVideo(U("single.html"));
    check(`${mode}: a normal single-stream link still works with ffmpeg present`, JSON.stringify(streams(s.filePath)) === '["audio","video"]');
    ytdlp.cleanup(s.filePath);
    process.env.PATH = savedPath;
  }

  section("audio");
  noFfmpeg();
  let a = await ytdlp.downloadAudio(U("single.html"));
  check("NO ffmpeg: audio still works (no conversion step); a source with only a combined stream gives that file, which carries the sound", ["mp4", "m4a", "aac"].includes(a.format) && streams(a.filePath).includes("audio"), [a.format, streams(a.filePath)]);
  ytdlp.cleanup(a.filePath);
  a = await ytdlp.downloadAudio(U("dash.html"));
  check("NO ffmpeg: audio from a DASH source works too (picks the audio-only stream)", streams(a.filePath).join() === "audio", [a.format, streams(a.filePath)]);
  ytdlp.cleanup(a.filePath);
  withFfmpeg();
  a = await ytdlp.downloadAudio(U("dash.html"));
  check("WITH ffmpeg: converted to mp3", a.format === "mp3" && streams(a.filePath).join() === "audio", [a.format, streams(a.filePath)]);
  ytdlp.cleanup(a.filePath);
  check("no temp leftovers after audio", leftovers().length === 0, leftovers());

  section("errors are clear and clean up after themselves");
  let e = await ytdlp.downloadVideo(U("novideo.html")).then(() => null, (x) => x);
  check("a page with no video -> 'Unsupported URL.'", e && /Unsupported URL/.test(e.message), e && e.message);
  e = await ytdlp.downloadVideo(U("hang.html"), { timeoutMs: 1500 }).then(() => null, (x) => x);
  check("a link that never answers -> 'Download timed out.'", e && e.message === "Download timed out.", e && e.message);
  e = await ytdlp.downloadVideo(U("single.html"), { maxFilesizeMB: 0.001 }).then(() => null, (x) => x);
  check("a file over the size cap is refused and nothing is left behind", e && /too large/i.test(e.message), e && e.message);
  check("no temp leftovers after the failures", leftovers().length === 0, leftovers());

  section("cookies for another site never break a download");
  const ck = path.join(work, "cookies.json");
  fs.writeFileSync(ck, JSON.stringify([{ domain: ".youtube.com", name: "SID", value: "x", path: "/", secure: true, httpOnly: true, expirationDate: 1900000000 }]));
  process.env.YTDLP_COOKIES = ck; withFfmpeg();
  r = await ytdlp.downloadVideo(U("dash.html")).catch((x) => x);
  check("with a YouTube-only cookies file, a DASH download still works", r.filePath && streams(r.filePath).join() === "audio,video", r.message);
  if (r.filePath) ytdlp.cleanup(r.filePath);
  delete process.env.YTDLP_COOKIES;

  section("through the bot: status message + the video actually sent");
  withFfmpeg();
  const sock = M.makeSock(); const chat = "255700000001@s.whatsapp.net";
  const m = { key: { remoteJid: chat, id: "X1", fromMe: false }, message: { conversation: ".yt x" } };
  await runDownload(sock, m, { title: "🎬 VIDEO DOWNLOAD", intro: ["📥 Fetching media..."], fetch: () => downloaders.downloadVideoFromUrl(U("dash.html")), message: (x) => ({ video: readFile(x.filePath), caption: x.title }), failText: "x" });
  const video = sock.sent.find((x) => x.content.video);
  check("a real video buffer was sent", video && video.content.video.length > 1000);
  check("the status message ends with ✅ Ready!", /✅ Ready!/.test(M.lastText(sock)), M.texts(sock));
  check("nothing left in the temp folder after sending", leftovers().length === 0, leftovers());

  section("4 downloads at once (limit is 3 at a time)");
  const many = await Promise.allSettled([1, 2, 3, 4].map(() => downloaders.downloadVideoFromUrl(U("dash.html"))));
  check("all four succeed", many.every((x) => x.status === "fulfilled"), many.map((x) => x.status === "rejected" ? x.reason.message : "ok"));
  many.forEach((x) => x.status === "fulfilled" && ytdlp.cleanup(x.value.filePath));

  section(".dltest tells you what is going on");
  const dlcmd = require("../src/commands/dltest");
  let s2 = M.makeSock();
  await dlcmd.execute(s2, m, [U("dash.html")]);
  const rep = M.lastText(s2);
  check("shows yt-dlp version, ffmpeg status and the formats", /yt-dlp: ✅ \d{4}\./.test(rep) && /ffmpeg: ✅/.test(rep) && /formats \(2\)/.test(rep), rep);
  check("says which format would be downloaded", /would download: ✅ format/.test(rep), rep);
  noFfmpeg(); s2 = M.makeSock();
  await dlcmd.execute(s2, m, [U("dash.html")]);
  check("without ffmpeg it explains exactly why that link can't be downloaded", /ffmpeg: ❌/.test(M.lastText(s2)) && /would download: ❌ only separate picture\/sound streams exist/.test(M.lastText(s2)), M.lastText(s2));
  s2 = M.makeSock(); await dlcmd.execute(s2, m, []);
  check(".dltest with no link shows the status lines only", /ffmpeg:/.test(M.lastText(s2)) && /Send  \.dltest <link>/.test(M.lastText(s2)));

  server.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
