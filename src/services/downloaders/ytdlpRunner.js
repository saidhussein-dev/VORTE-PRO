// src/services/downloaders/ytdlpRunner.js
// Minimal yt-dlp launcher that replaces the `yt-dlp-exec` npm package.
//
// Why: yt-dlp-exec's preinstall requires `python` on the host and aborts the
// WHOLE `npm install` when it is missing (e.g. Katabump / Pterodactyl
// containers), leaving the bot without dotenv etc. The plain `yt-dlp` release
// file is also a Python zipapp, so it needs Python at runtime too.
//
// This runner needs NO Python and NO install scripts:
//   1. YTDLP_PATH env var (explicit override), else
//   2. a `yt-dlp` already on PATH, else
//   3. the self-contained standalone build (yt-dlp_linux / _aarch64 / _macos /
//      .exe) downloaded once into storage/bin on first use.
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const BIN_DIR = path.join(__dirname, "../../../storage/bin");
const FETCH_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 5;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const RELEASE_BASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
const LATEST_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest";

// yt-dlp needs a JavaScript runtime to talk to YouTube, and its YouTube support now requires Node 22 or newer.
const NODE_MAJOR = Number(String(process.versions.node).split(".")[0]);
const MIN_NODE_FOR_YOUTUBE = 22;
const UPDATE_EVERY_MS = (Number(process.env.YTDLP_UPDATE_HOURS) || 24) * 3600 * 1000;

/** yt-dlp release a dated version string ("2025.11.12") compared as numbers. */
const versionAtLeast = (v, min) => {
  if (!v) return true; // unknown version: assume new enough
  const a = String(v).split(".").map(Number), b = String(min).split(".").map(Number);
  if (a.some(Number.isNaN)) return true;
  for (let i = 0; i < b.length; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
  return true;
};

function standaloneAsset() {
  const { platform, arch } = process;
  if (platform === "win32") return "yt-dlp.exe";
  if (platform === "darwin") return "yt-dlp_macos";
  if (platform === "linux") return arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
  return null;
}

const localBinPath = () => path.join(BIN_DIR, standaloneAsset() || "yt-dlp");

function isExecutable(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
}

function probe(cmd) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, ["--version"], { stdio: "ignore" }); } catch { return resolve(false); }
    const t = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, 15000);
    child.on("error", () => { clearTimeout(t); resolve(false); });
    child.on("close", (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

function download(url, dest, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    const fail = (err) => { fs.unlink(tmp, () => {}); reject(err); };
    const req = https.get(url, { headers: { "User-Agent": "vorte-pro" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return fail(new Error("Too many redirects fetching yt-dlp"));
        return download(new URL(res.headers.location, url).toString(), dest, redirectsLeft - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return fail(new Error(`yt-dlp download failed: HTTP ${res.statusCode}`)); }
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on("error", fail);
      file.on("finish", () => file.close(() => {
        try { fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, dest); resolve(); } catch (e) { fail(e); }
      }));
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error("Timed out fetching yt-dlp")));
    req.on("error", fail);
  });
}

/** The newest yt-dlp release tag (e.g. "2026.10.12"), read from GitHub's /releases/latest redirect. null when unreachable. */
function latestTag() {
  return new Promise((resolve) => {
    const req = https.request(LATEST_URL, { method: "HEAD", headers: { "User-Agent": "vorte-pro" } }, (res) => {
      res.resume();
      const loc = String(res.headers.location || "");
      const tag = loc.split("/tag/")[1];
      resolve(tag ? decodeURIComponent(tag).trim() : null);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

// Tests replace these; production uses the real network.
const deps = { latestTag, download, managedPath: null };

let resolved = null;      // cached command once found
let pending = null;       // in-flight resolution (avoids parallel downloads)

/** Resolve (and if needed install) a usable yt-dlp command. @returns {Promise<string|null>} */
function ensureBinary() {
  if (resolved) return Promise.resolve(resolved);
  if (pending) return pending;
  pending = (async () => {
    try {
      if (process.env.YTDLP_PATH && isExecutable(process.env.YTDLP_PATH)) return (resolved = process.env.YTDLP_PATH);
      if (await probe("yt-dlp")) return (resolved = "yt-dlp");
      const asset = standaloneAsset();
      if (!asset) throw new Error(`No standalone yt-dlp build for ${process.platform}/${process.arch}`);
      const dest = localBinPath();
      if (!isExecutable(dest) || !(await probe(dest))) {
        console.log(`⬇️  Downloading yt-dlp (${asset})...`);
        await deps.download(RELEASE_BASE + asset, dest);
        if (!(await probe(dest))) throw new Error("Downloaded yt-dlp does not run on this host");
        console.log("✅ yt-dlp ready");
      }
      deps.managedPath = dest;      // our own copy: kept up to date automatically (see updateNow)
      startUpkeep();
      return (resolved = dest);
    } catch (err) {
      console.error("❌ yt-dlp binary install failed:", err.message);
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

const kebab = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

/** { noPlaylist: true, maxFilesize: "100M", format: undefined } -> ["--no-playlist","--max-filesize","100M"] */
function buildArgs(flags = {}) {
  const args = [];
  for (const [key, val] of Object.entries(flags)) {
    if (val === undefined || val === null || val === false) continue;
    args.push("--" + kebab(key));
    if (val !== true) args.push(String(val));
  }
  return args;
}

/**
 * Run yt-dlp. Resolves with stdout; rejects with an Error carrying
 * .stderr, .exitCode and .timedOut (read by ytdlp.js classifyError).
 */
/**
 * Accept either a Netscape cookies.txt or a Cookie-Editor-style JSON export
 * (array of {domain,path,secure,expirationDate,name,value,...}); JSON is
 * converted to a Netscape file in storage/tmp so yt-dlp can read it.
 * Returns the path to hand to --cookies, or null if unusable.
 */
function prepareCookies(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const t = raw.trimStart();
    if (!(t.startsWith("[") || t.startsWith("{"))) return file; // already Netscape
    let list = JSON.parse(t);
    if (!Array.isArray(list)) list = list.cookies;
    if (!Array.isArray(list)) throw new Error("JSON is not a cookie array");
    const lines = ["# Netscape HTTP Cookie File"];
    for (const c of list) {
      if (!c || !c.domain || !c.name) continue;
      const domain = String(c.domain);
      const exp = c.expirationDate ? Math.floor(Number(c.expirationDate)) : 0;
      lines.push([
        (c.httpOnly ? "#HttpOnly_" : "") + domain,
        domain.startsWith(".") ? "TRUE" : "FALSE",
        c.path || "/",
        c.secure ? "TRUE" : "FALSE",
        exp,
        c.name,
        String(c.value ?? "").replace(/[\r\n\t]/g, "")
      ].join("\t"));
    }
    const out = path.join(__dirname, "../../../storage/tmp/cookies.netscape.txt");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
    return out;
  } catch (e) {
    console.error("⚠️ Could not read YTDLP_COOKIES file:", e.message);
    return null;
  }
}

const ROOT_DIR = path.join(__dirname, "../../..");
const AUTH_COOKIES = ["SID", "SAPISID", "__Secure-1PSID", "__Secure-3PSID", "LOGIN_INFO", "sessionid"];

/** YTDLP_COOKIES if set, else cookies.json / cookies.txt in the project folder (or storage/). */
function findCookiesFile(env = process.env, root = ROOT_DIR) {
  const candidates = [env.YTDLP_COOKIES, path.join(root, "cookies.json"), path.join(root, "cookies.txt"), path.join(root, "storage", "cookies.json"), path.join(root, "storage", "cookies.txt")];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

let loggedCookies = false;
/** One-time, value-free summary so you can tell whether cookies were really picked up. */
function logCookieSummary(file, netscapePath) {
  if (loggedCookies) return;
  loggedCookies = true;
  try {
    const lines = fs.readFileSync(netscapePath, "utf8").split("\n").filter((l) => l && (!l.startsWith("#") || l.startsWith("#HttpOnly_")));
    const names = new Set(lines.map((l) => l.split("\t")[5]));
    const yt = lines.filter((l) => /youtube\.com|google\.com/.test(l.split("\t")[0]));
    const hasAuth = AUTH_COOKIES.some((n) => names.has(n));
    console.log(`🍪 yt-dlp cookies: ${file} (${lines.length} cookies, ${yt.length} for youtube/google, login cookie present: ${hasAuth ? "yes" : "NO — export again while logged in"})`);
  } catch (e) {
    console.error("⚠️ Could not summarise cookies file:", e.message);
  }
}

let versionTried = false;
let binVersion = null;     // yt-dlp's own version once known (a very old build must not be given flags it does not know)
let warnedNode = false;

const debugOn = () => /^(1|true|on|yes)$/i.test(String(process.env.YTDLP_DEBUG || ""));

/**
 * --js-runtimes value. By default THIS bot's own node (by full path, so it never depends on PATH).
 * YTDLP_JS_RUNTIME: "off" | "deno" | "node" | "node:/path/to/node" | "quickjs" ...
 */
function jsRuntimeFlag() {
  const v = String(process.env.YTDLP_JS_RUNTIME || "").trim();
  if (v.toLowerCase() === "off") return null;
  if (v && v !== "node") return v;
  if (NODE_MAJOR < MIN_NODE_FOR_YOUTUBE && !warnedNode) {
    warnedNode = true;
    console.error(`⚠️ This bot runs on Node ${process.version}, but yt-dlp's YouTube support needs Node ${MIN_NODE_FOR_YOUTUBE}+ as its JavaScript runtime. YouTube downloads will fail until the host's Node version is raised to ${MIN_NODE_FOR_YOUTUBE} or newer (TikTok/Instagram are not affected).`);
  }
  return `node:${process.execPath}`;
}

/** The official yt-dlp executables carry the YouTube challenge solver; any other yt-dlp may need to fetch it. */
function remoteComponentsFlag() {
  const v = String(process.env.YTDLP_REMOTE_COMPONENTS || "").trim();
  if (v.toLowerCase() === "off") return null;
  if (v) return v;
  return resolved && deps.managedPath && resolved === deps.managedPath ? null : "ejs:github";
}

/** Host-level options from env, applied to every call (see .env.example). */
let warnedCookies = false;
function globalFlags() {
  const f = {};
  const cookies = findCookiesFile();
  if (cookies) { const c = prepareCookies(cookies); if (c) { f.cookies = c; logCookieSummary(cookies, c); } }
  else if (process.env.YTDLP_COOKIES && !warnedCookies) { warnedCookies = true; console.error(`⚠️ YTDLP_COOKIES is set to "${process.env.YTDLP_COOKIES}" but that file does not exist — downloads will run without cookies.`); }
  if (process.env.YTDLP_PROXY) f.proxy = process.env.YTDLP_PROXY;
  const js = jsRuntimeFlag();
  if (js && versionAtLeast(binVersion, "2025.11.12")) f.jsRuntimes = js;
  // IPv6 ranges of hosting providers are the first thing YouTube flags: talk to it over IPv4 (YTDLP_IPV4=false to turn off)
  if (String(process.env.YTDLP_IPV4 || "").toLowerCase() !== "false") f.forceIpv4 = true;
  const rc = remoteComponentsFlag();
  if (rc && versionAtLeast(binVersion, "2025.11.12")) f.remoteComponents = rc;
  if (debugOn()) f.verbose = true;
  const ffLoc = require("./ffmpegCheck").location();       // bundled ffmpeg + ffprobe folder (null when the host has its own)
  if (ffLoc) f.ffmpegLocation = ffLoc;
  if (process.env.YTDLP_EXTRACTOR_ARGS) f.extractorArgs = process.env.YTDLP_EXTRACTOR_ARGS; // e.g. "youtube:player_client=mweb"
  return f;
}

async function exec(url, flags = {}, { timeout = 120000 } = {}) {
  const cmd = await ensureBinary();
  if (!cmd) throw new Error("yt-dlp is not available on this host.");
  if (!binVersion && !versionTried) { versionTried = true; await version(); }
  return new Promise((resolve, reject) => {
    const merged = { ...globalFlags(), ...flags };
    if (debugOn()) merged.noWarnings = false; // YTDLP_DEBUG=true: show yt-dlp's warnings too (e.g. a missing JavaScript runtime)
    const child = spawn(cmd, [...buildArgs(merged), "--", String(url)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false, overflow = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeout);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > MAX_OUTPUT_BYTES) { overflow = true; child.kill("SIGKILL"); }
    });
    child.stderr.on("data", (d) => { if (err.length < 200000) err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(Object.assign(e, { stderr: err })); });
    child.on("close", (code) => {
      clearTimeout(timer);
      // yt-dlp SKIPS a file over --max-filesize and still exits 0 — that is a failure for us, with a clear reason
      if (code === 0 && /larger than max-filesize/i.test(err + out)) {
        const e = new Error("File is larger than max-filesize"); e.stderr = err + out; e.exitCode = 0;
        return reject(e);
      }
      if (code === 0 && !timedOut && !overflow) return resolve(out);
      const e = new Error(timedOut ? "yt-dlp timed out" : overflow ? "yt-dlp output too large" : (err.trim().split("\n").pop() || `yt-dlp exited with code ${code}`));
      e.stderr = err; e.exitCode = code; e.timedOut = timedOut;
      if (!timedOut) console.error(`❌ [yt-dlp] exit ${code} for ${String(url).slice(0, 80)}:\n${err.trim().split("\n").slice(debugOn() ? -40 : -6).join("\n")}`);
      reject(e);
    });
  });
}

/** exec() + JSON.parse, for dumpSingleJson calls. */
async function json(url, flags, opts) {
  return JSON.parse(await exec(url, flags, opts));
}

/** yt-dlp's own version string, or null. */
async function version() {
  const cmd = await ensureBinary();
  if (!cmd) return null;
  return new Promise((resolve) => {
    try { require("child_process").execFile(cmd, ["--version"], { timeout: 15000 }, (err, out) => { const v = err ? null : String(out).trim(); if (v) binVersion = v; resolve(v); }); } catch { resolve(null); }
  });
}

// ---------------------------------------------------------------- keeping yt-dlp current
// YouTube changes every few weeks and an old yt-dlp is the most common reason downloads suddenly stop. The copy this bot
// downloaded itself is therefore refreshed automatically; a yt-dlp the host provides (YTDLP_PATH / PATH) is left alone.
let updating = null;
let lastUpdateAt = 0;

/**
 * Replace the managed yt-dlp with the newest release when there is one.
 * @param {{force?: boolean, minAgeMs?: number}} [o] force: download even when the version looks current;
 *   minAgeMs: skip when an update was already tried this recently (stops a broken source from causing a download loop)
 * @returns {Promise<{updated: boolean, from?: string, to?: string, reason?: string, error?: string}>}
 */
function updateNow(o = {}) {
  const target = deps.managedPath;
  if (!target || resolved !== target) return Promise.resolve({ updated: false, reason: "this host provides its own yt-dlp (update it there)" });
  if (updating) return updating;
  if (o.minAgeMs && Date.now() - lastUpdateAt < o.minAgeMs) return Promise.resolve({ updated: false, reason: "checked recently" });
  updating = (async () => {
    try {
      const from = await version();
      const latest = await deps.latestTag();
      lastUpdateAt = Date.now();
      if (latest && from && latest === from && !o.force) return { updated: false, reason: "already the latest", from, to: latest };
      if (!latest && !o.force) return { updated: false, reason: "could not reach GitHub to check", from };
      const asset = standaloneAsset();
      console.log(`⬇️  Updating yt-dlp ${from || "?"} → ${latest || "latest"}...`);
      await deps.download(RELEASE_BASE + asset, target);
      if (!(await probe(target))) throw new Error("the new yt-dlp does not run on this host");
      binVersion = null;
      const to = await version();
      console.log(`✅ yt-dlp is now ${to || "updated"}`);
      return { updated: true, from, to };
    } catch (e) {
      console.error("⚠️ yt-dlp update failed:", e.message);
      return { updated: false, error: e.message };
    } finally { updating = null; }
  })();
  return updating;
}

let upkeepStarted = false;
/** Once at start (if the file is old) and then every few hours: refresh the managed yt-dlp when it is stale. */
function startUpkeep() {
  if (upkeepStarted || process.env.YTDLP_AUTO_UPDATE === "false") return;
  upkeepStarted = true;
  const check = () => {
    const target = deps.managedPath;
    let age = Infinity;
    try { age = Date.now() - fs.statSync(target).mtimeMs; } catch { /* missing: nothing to refresh */ }
    if (age > UPDATE_EVERY_MS) updateNow().catch(() => {});
  };
  setTimeout(check, 5000).unref();
  setInterval(check, 6 * 3600 * 1000).unref();
}

/** Facts the error messages and .dltest report: is this host able to do YouTube at all? */
function health() {
  return { node: process.version, nodeOk: NODE_MAJOR >= MIN_NODE_FOR_YOUTUBE, jsRuntime: jsRuntimeFlag(), ipv4: String(process.env.YTDLP_IPV4 || "").toLowerCase() !== "false", managed: !!(deps.managedPath && resolved === deps.managedPath), cookies: cookieSummary() };
}

/** What the cookies setup looks like (counts only — never the values). */
function cookieSummary() {
  const file = findCookiesFile();
  if (!file) return null;
  const converted = prepareCookies(file);
  if (!converted) return { file, error: true };
  try {
    const lines = fs.readFileSync(converted, "utf8").split("\n").filter((l) => l && (!l.startsWith("#") || l.startsWith("#HttpOnly_")));
    const names = new Set(lines.map((l) => l.split("\t")[5]));
    const domains = [...new Set(lines.map((l) => l.split("\t")[0].replace(/^#HttpOnly_/, "").replace(/^\./, "")))];
    return { file, count: lines.length, domains: domains.slice(0, 8), login: AUTH_COOKIES.some((n) => names.has(n)) };
  } catch { return { file, error: true }; }
}

module.exports = { _resetUpdateClock: () => { lastUpdateAt = 0; }, deps, updateNow, health, jsRuntimeFlag, versionAtLeast, version, cookieSummary, findCookiesFile, prepareCookies, ensureBinary, exec, json, buildArgs, standaloneAsset, BIN_DIR };
