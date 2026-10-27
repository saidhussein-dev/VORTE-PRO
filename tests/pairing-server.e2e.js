// Session ID site backend with a FAKE Baileys (no WhatsApp needed). Run: node tests/pairing-server.e2e.js
const fs = require("fs"), os = require("os"), path = require("path"), events = require("events");
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pairsite-"));
process.chdir(tmp);                                      // storage/ (stats + temp sessions) lives in a throwaway folder
process.env.PORT = String(47000 + Math.floor(Math.random() * 2000));
process.env.PAIRING_COOLDOWN_MS = "700";
process.env.PAIRING_EXPIRE_MS = "6000";
delete process.env.BOT_DOWNLOAD_URL;

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? "✅" : "❌"} ${n}${ok ? "" : "  -> " + (typeof d === "string" ? d : JSON.stringify(d))}`); };
const section = (t) => console.log(`\n[${t}]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake baileys, injected before the server loads it ----
const instances = [], folders = [];
const fakeBaileys = {
  default: (cfg) => {
    const ev = new events.EventEmitter();
    const sock = { ev, cfg, ended: false, sent: [], codeFor: null, authState: { creds: {} }, user: { id: "255712345678:3@s.whatsapp.net" },
      end() { this.ended = true; }, sendMessage: async (j, c) => { sock.sent.push({ j, c }); return {}; },
      requestPairingCode: async (n) => { if (fakeBaileys.failCode) throw new Error("rate-overlimit"); sock.codeFor = n; return "ABCD1234"; } };
    instances.push(sock); return sock;
  },
  useMultiFileAuthState: async (folder) => { folders.push(folder); return { state: { creds: {}, keys: {} }, saveCreds: async () => {} }; },
  makeCacheableSignalKeyStore: (k) => k,
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
  DisconnectReason: { restartRequired: 515, connectionLost: 408, connectionClosed: 428, loggedOut: 401 },
  Browsers: {}
};
require.cache[require.resolve("baileys", { paths: [REPO] })] = { id: "baileys", filename: "baileys", loaded: true, exports: fakeBaileys };

const setupServer = require(path.join(REPO, "src/server/server.js"));
const { server } = setupServer();
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const post = async (p, body) => { const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
const get = async (p, headers = {}) => { const r = await fetch(BASE + p, { headers, redirect: "manual" }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, headers: r.headers, text: t, json: j }; };
const stats = async () => (await get("/api/stats")).json;
const PHONE = "255712345678";
const complete = async (sock, folder) => {            // what WhatsApp does when the user enters the code
  fs.writeFileSync(path.join(folder, "creds.json"), JSON.stringify({ noiseKey: { private: "x" }, me: { id: PHONE + ":3@s.whatsapp.net" } }));
  sock.ev.emit("connection.update", { connection: "open" });
};

(async () => {
  await sleep(300);

  section("real counters start at zero");
  let st = await stats();
  check("a fresh site shows 0 / 0 / 0 (nothing simulated)", st.visitors === 0 && st.successful === 0 && st.failed === 0, st);
  check("versions: VORTE PRO v1.0 and the real installed Baileys version", st.botVersion === "v1.0" && st.baileysVersion === require(path.join(REPO, "node_modules/baileys/package.json")).version, [st.botVersion, st.baileysVersion]);
  check("uptime is the real process uptime", st.uptimeSeconds >= 0 && st.uptimeSeconds < 30 && !!st.startedAt);

  section("visitors");
  let r = await get("/", { "User-Agent": "Mozilla/5.0 (Linux; Android 13) Chrome/120" });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  check("page loads (200) and sets a visitor cookie", r.status === 200 && /^vp_vid=/.test(cookie) && /pairing|VORTE/i.test(r.text.slice(0, 5000)));
  st = await stats(); check("1st visit -> 1 unique visitor, 1 view", st.visitors === 1 && st.pageViews === 1, st);
  r = await get("/", { "User-Agent": "Mozilla/5.0 Chrome/120", Cookie: cookie });
  st = await stats(); check("same browser again -> still 1 visitor, 2 views", st.visitors === 1 && st.pageViews === 2, st);
  await get("/", { "User-Agent": "Mozilla/5.0 Chrome/120" });
  st = await stats(); check("a different browser (no cookie) -> 2 visitors", st.visitors === 2 && st.pageViews === 3, st);
  for (const ua of ["Googlebot/2.1", "curl/8.0", "UptimeRobot/2.0", "python-requests/2.31"]) await get("/", { "User-Agent": ua });
  st = await stats(); check("bots, curl and uptime monitors are NOT counted", st.visitors === 2 && st.pageViews === 3, st);
  await fetch(BASE + "/", { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0 Chrome/120" } });
  await get("/health"); await get("/api/stats");
  st = await stats(); check("HEAD, /health and /api calls don't inflate it", st.visitors === 2 && st.pageViews === 3, st);

  section("validation");
  check("no phone -> 400", (await post("/api/request-code", {})).status === 400);
  check("too short -> 400", (await post("/api/request-code", { phone: "123" })).status === 400);

  section("THE BUG: wrong code must not block a new one");
  const pA = post("/api/request-code", { phone: PHONE });          // first request (the server takes ~2.5 s to get the code)
  await sleep(50);
  const quick = await post("/api/request-code", { phone: PHONE });  // impatient double tap
  check("a rapid second request -> polite 429 with seconds to wait (not 'already in progress')", quick.status === 429 && quick.json.retryAfter >= 1 && /Please wait \d+s/.test(quick.json.error) && !/in progress/.test(quick.json.error), quick);
  const a = await pA;
  check("first request -> pairing code issued (the blocked tap did not cancel it)", a.status === 200 && a.json.success && a.json.code === "ABCD-1234" && /^[a-f0-9]{48}$/.test(a.json.token) && a.json.token !== PHONE, a);
  check("the token is a random secret, never the phone number", !String(a.json.token).includes(PHONE));
  const tokA = a.json.token;
  check("the phone number itself is NOT a valid token (nobody can read a session by knowing the number)", (await get("/api/session-status/" + PHONE)).status === 404);
  const first = instances[instances.length - 1], firstFolder = folders[folders.length - 1];
  check("pairing code requested for exactly that number", first.codeFor === PHONE);
  check("the working attempt is still open", first.ended === false);
  let st0 = await stats(); check("one pairing waiting", st0.activePairings === 1);
  // user typed the wrong code in WhatsApp... nothing happens; they ask again:
  const b = await post("/api/request-code", { phone: PHONE });
  check("asking again -> a NEW code for the SAME number is issued (previously: 'pairing in progress' until restart)", b.status === 200 && b.json.success && b.json.code === "ABCD-1234", b);
  const tokB = b.json.token;
  check("the replacement attempt gets its own new token", tokB !== tokA && /^[a-f0-9]{48}$/.test(tokB));
  check("the replaced attempt's token no longer works", (await get("/api/session-status/" + tokA)).status === 404);
  const second = instances[instances.length - 1], secondFolder = folders[folders.length - 1];
  check("the old attempt was cancelled (socket closed)", first.ended === true && second !== first && second.ended === false);
  check("each attempt has its own temp folder", firstFolder !== secondFolder);
  st = await stats(); check("only the new attempt is waiting", st.activePairings === 1, st);
  check("replacing an attempt counts as a retry, NOT a failure", st.failed === 0, st);
  const status1 = await get("/api/session-status/" + tokB);
  check("the token now follows the new attempt (waiting)", status1.json.success && status1.json.status === "waiting", status1.json);
  first.ev.emit("connection.update", { connection: "open" }); await sleep(100);
  check("late events from the cancelled attempt are ignored", (await get("/api/session-status/" + tokB)).json.status === "waiting");

  section("successful pairing");
  await complete(second, secondFolder);
  await sleep(4700);
  const ready = await get("/api/session-status/" + tokB);
  check("session is ready and is a VORTE_PRO~ id", ready.json.status === "ready" && /^VORTE_PRO~/.test(ready.json.sessionId), ready.json);
  check("the Session ID is handed over ONCE: a second read finds nothing", (await get("/api/session-status/" + tokB)).status === 404);
  const decoded = JSON.parse(Buffer.from(ready.json.sessionId.slice(10), "base64").toString());
  check("the id decodes to the credentials file", decoded.me.id.startsWith(PHONE));
  check("the session was also sent to the user's own WhatsApp", second.sent.length === 2 && /SESSION GENERATED/.test(second.sent[0].c.text) && second.sent[1].c.text === ready.json.sessionId, second.sent.map((x) => x.c.text.slice(0, 30)));
  st = await stats(); check("successful generations = 1, failed still 0", st.successful === 1 && st.failed === 0, st);
  await sleep(700);
  let c = await post("/api/request-code", { phone: PHONE });
  check("after success the same number can start a new pairing straight away", c.status === 200 && c.json.success, c);
  const third = instances[instances.length - 1];
  const tokC = c.json.token;
  check("a finished session does not count as 'replaced'", (await stats()).failed === 0);

  section("failures are counted");
  fakeBaileys.failCode = true;
  const PH2 = "255799000111";
  const f = await post("/api/request-code", { phone: PH2 });
  check("WhatsApp refuses the code -> clean 500", f.status === 500 && f.json.error === "Failed to generate pairing code", f);
  st = await stats(); check("failed generations = 1", st.failed === 1, st);
  check("nothing left waiting for that number", (await get("/api/session-status/" + PH2)).status === 404);
  check("the socket was closed (no leak)", instances[instances.length - 1].ended === true);
  fakeBaileys.failCode = false;
  const retryOk = await (async () => { await sleep(800); return post("/api/request-code", { phone: PH2 }); })();
  check("and the user can immediately try that number again", retryOk.status === 200 && retryOk.json.success, retryOk);

  section("a pairing nobody completes expires (counted as failed, cleaned up)");
  await sleep(6300);
  st = await stats();
  check("expired attempts are cleaned up and counted as failed", st.failed >= 2 && st.activePairings === 0, st);
  check("an expired attempt's socket is closed", third.ended === true && instances[instances.length - 1].ended === true);
  check("expired token -> status 404 with a clear message", (await get("/api/session-status/" + tokC)).status === 404);
  check("the login QR page is OFF unless ENABLE_QR_PAGE=true", (await get("/qr")).status === 404);

  section("temp files");
  await sleep(5200);
  check("cancelled / expired attempts' folders are removed", folders.filter((f) => !fs.existsSync(f)).length >= 3, folders.map((f) => fs.existsSync(f)));
  const old = path.join(tmp, "storage", "temp_sessions", "stale_from_crash"); fs.mkdirSync(old, { recursive: true }); fs.utimesSync(old, new Date(Date.now() - 3600e3), new Date(Date.now() - 3600e3));

  section("stats are saved and survive a restart");
  await sleep(2300);
  const file = path.join(tmp, "storage", "site-stats.json");
  check("counters written to storage/site-stats.json", fs.existsSync(file));
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  check("file holds the real numbers", saved.successful === 1 && saved.failed >= 2 && saved.visitors === 2, saved);
  delete require.cache[require.resolve(path.join(REPO, "src/server/siteStats.js"))];
  const reloaded = require(path.join(REPO, "src/server/siteStats.js")).snapshot();
  check("a restarted server loads them back", reloaded.successful === 1 && reloaded.visitors === 2, reloaded);
  fs.writeFileSync(file, "{ this is not json");
  delete require.cache[require.resolve(path.join(REPO, "src/server/siteStats.js"))];
  check("a corrupted stats file never crashes startup (starts from zero)", require(path.join(REPO, "src/server/siteStats.js")).snapshot().successful === 0);

  section("bot file download");
  const zip = path.join(REPO, "files", "VORTE-PRO.zip");
  const hadZip = fs.existsSync(zip); if (hadZip) fs.renameSync(zip, zip + ".bak");
  try {
    let bf = await get("/api/bot-file");
    check("no ZIP and no link -> reported as not available", bf.json.available === false, bf.json);
    check("/download/bot -> 404 with a message (no crash)", (await get("/download/bot")).status === 404);
    fs.writeFileSync(zip, Buffer.from("PK-fake-zip-content-1234567890"));
    bf = await get("/api/bot-file");
    check("ZIP uploaded -> available with name, size and version", bf.json.available && bf.json.kind === "file" && bf.json.name === "VORTE-PRO.zip" && bf.json.sizeBytes === 30 && bf.json.version === "v1.0", bf.json);
    const dl = await fetch(BASE + "/download/bot"); const body = Buffer.from(await dl.arrayBuffer());
    check("download works as an attachment named VORTE-PRO.zip with the exact bytes", dl.status === 200 && /attachment/.test(dl.headers.get("content-disposition")) && /VORTE-PRO\.zip/.test(dl.headers.get("content-disposition")) && body.toString() === "PK-fake-zip-content-1234567890");
    check("downloads are counted", (await stats()).downloads === 1);
    fs.unlinkSync(zip);
    process.env.BOT_DOWNLOAD_URL = "https://github.com/abudharyally48-cloud/VORTE-PRO/releases/latest/download/VORTE-PRO.zip";
    bf = await get("/api/bot-file");
    check("no ZIP but BOT_DOWNLOAD_URL set -> available as a link", bf.json.available && bf.json.kind === "link", bf.json);
    const rd = await get("/download/bot");
    check("…and /download/bot redirects there", rd.status === 302 && rd.headers.get("location") === process.env.BOT_DOWNLOAD_URL);
    process.env.BOT_DOWNLOAD_URL = "javascript:alert(1)";
    check("a non-http(s) BOT_DOWNLOAD_URL is ignored (no open redirect to weird schemes)", (await get("/api/bot-file")).json.available === false && (await get("/download/bot")).status === 404);
  } finally {
    delete process.env.BOT_DOWNLOAD_URL; try { fs.unlinkSync(zip); } catch {} if (hadZip) fs.renameSync(zip + ".bak", zip);
  }

  section("health / status");
  const h = (await get("/health")).json;
  check("/health still works and now reports activeSessions", h.status === "ok" && typeof h.activeSessions === "number" && typeof h.uptime === "number", h);
  check("/api/status still works", typeof (await get("/api/status")).json.activePairings === "number");

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  server.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
