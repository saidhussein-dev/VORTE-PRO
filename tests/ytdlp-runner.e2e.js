// Tests the python-free yt-dlp runner + ytdlp.js against a FAKE yt-dlp script
// (no network needed). Run: node tests/ytdlp-runner.e2e.js
const fs = require("fs"), os = require("os"), path = require("path");
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? "✅" : "❌"} ${n}${ok ? "" : " -> " + d}`); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fakeyt-"));
const fake = path.join(dir, "yt-dlp");
fs.writeFileSync(fake, `#!/bin/sh
case "$*" in *--version*) echo 2099.01.01; exit 0;; esac
case "$*" in *"-- ytsearch"*) echo '{"entries":[{"id":"abc","title":"Song A","duration":10,"channel":"Ch"}]}'; exit 0;; esac
case "$*" in *"height<=480"*) echo "ERROR: Requested format is not available" >&2; exit 1;; esac
case "$*" in *private*) echo "ERROR: Private video. Sign in" >&2; exit 1;; esac
case "$*" in *slow*) sleep 5; exit 0;; esac
case "$*" in *--dump-single-json*) echo '{"title":"Fake Title"}'; exit 0;; esac
out=""; prev=""; ext="mp4"
for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; [ "$a" = "--extract-audio" ] && ext="mp3"; prev="$a"; done
out=$(printf '%s' "$out" | sed "s/%(ext)s/$ext/")
[ -n "$out" ] && echo data > "$out"
case "$*" in *--print*) printf '{"title": "Fake Title", "ext": "%s", "filepath": "%s"}\\n' "$ext" "$out";; esac
exit 0
`, { mode: 0o755 });
process.env.YTDLP_PATH = fake;

const runner = require("../src/services/downloaders/ytdlpRunner");
const ytdlp = require("../src/services/downloaders/ytdlp");
const downloaders = require("../src/services/downloaders");

(async () => {
  console.log("[runner]");
  const a = runner.buildArgs({ noPlaylist: true, maxFilesize: "100M", format: undefined, skipDownload: false, dumpSingleJson: true });
  check("camelCase flags -> kebab args, skips false/undefined", JSON.stringify(a) === JSON.stringify(["--no-playlist", "--max-filesize", "100M", "--dump-single-json"]), JSON.stringify(a));
  check("YTDLP_PATH override is used", (await runner.ensureBinary()) === fake);
  check("ensureBinary (ytdlp.js) true", (await ytdlp.ensureBinary()) === true);

  const cj = path.join(dir, "c.json");
  fs.writeFileSync(cj, JSON.stringify([{ domain: ".youtube.com", path: "/", secure: true, httpOnly: true, expirationDate: 1900000000.5, name: "SID", value: "abc" }, { domain: "x.com", name: "s", value: "1" }]));
  const conv = fs.readFileSync(runner.prepareCookies(cj), "utf8").split("\n");
  check("JSON cookie export converted to Netscape", conv[0].startsWith("# Netscape") && conv[1] === "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1900000000\tSID\tabc" && conv[2] === "x.com\tFALSE\t/\tFALSE\t0\ts\t1", JSON.stringify(conv));
  const nt = path.join(dir, "c.txt"); fs.writeFileSync(nt, "# Netscape HTTP Cookie File\n");
  check("Netscape file passed through unchanged", runner.prepareCookies(nt) === nt);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "root-"));
  check("no cookies file -> null", runner.findCookiesFile({}, root) === null);
  fs.writeFileSync(path.join(root, "cookies.json"), "[]");
  check("auto-detects cookies.json in project root without env var", runner.findCookiesFile({}, root) === path.join(root, "cookies.json"));
  check("env var wins over auto-detect", runner.findCookiesFile({ YTDLP_COOKIES: cj }, root) === cj);

  console.log("[ytdlp.js]");
  const info = await ytdlp.getInfo("https://example.com/v");
  check("getInfo parses JSON", info.title === "Fake Title", JSON.stringify(info));
  const res = await ytdlp.search("hello world", 1);
  check("search maps entries to watch URLs", res[0]?.url === "https://www.youtube.com/watch?v=abc" && res[0].title === "Song A", JSON.stringify(res));
  const v = await ytdlp.downloadVideo("https://example.com/v");
  check("downloadVideo returns existing file + title (from the single call) + real format", fs.existsSync(v.filePath) && v.title === "Fake Title" && v.sizeBytes > 0 && v.format === "mp4", JSON.stringify(v));
  ytdlp.cleanup(v.filePath);
  check("cleanup removes temp file", !fs.existsSync(v.filePath));
  const au = await ytdlp.downloadAudio("https://example.com/a");
  check("downloadAudio returns file", fs.existsSync(au.filePath) && /\.(mp3|m4a)$/.test(au.filePath) && au.title === "Fake Title" && /^(mp3|m4a)$/.test(au.format), JSON.stringify(au));
  ytdlp.cleanup(au.filePath);
  let err = await ytdlp.downloadVideo("https://example.com/private").catch(e => e);
  check("private video -> friendly error, no temp leftovers", err.message === "This content is private or requires login.", err.message);
  err = await ytdlp.downloadVideo("https://example.com/slow", { timeoutMs: 300 }).catch(e => e);
  check("timeout -> 'Download timed out.'", err.message === "Download timed out.", err.message);
  err = await runner.exec("-weird-url-starting-with-dash", { dumpSingleJson: true }).then(() => null, e => e);
  check("URL starting with '-' is passed after '--' (not parsed as a flag)", err === null || !/unknown option/i.test(err.message));

  console.log("[downloaders facade]");
  const dv = await downloaders.downloadVideoFromUrl("https://example.com/v");
  check("facade downloadVideoFromUrl works through limiter", fs.existsSync(dv.filePath));
  downloaders.cleanup(dv.filePath);
  const many = await Promise.all(Array.from({ length: 6 }, () => downloaders.downloadAudioFromUrl("https://example.com/a")));
  check("6 concurrent downloads all succeed (queued, max 3 active)", many.every(r => fs.existsSync(r.filePath)));
  many.forEach(r => downloaders.cleanup(r.filePath));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
