// The API-less utilities: hash, encode, decode, json, uuid, color, convert, time, fileinfo, tomp3, toimg.
// Run: node tests/utilities.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore, texts, lastText } = M;
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto"), { execFileSync } = require("child_process");
const handler = require("../src/bot/handlers/commandHandler");
const quoted = require("../src/utils/quoted");
const ffcheck = require("../src/services/downloaders/ffmpegCheck");
const codec = require("../src/utils/codec");

const run = async (text, opts = {}) => {
  const s = makeSock(); const st = makeStore();
  const m = opts.msg || privateMsg(text, { from: "stranger", id: "U" + Math.random() });
  m.key.remoteJid = "98" + Math.floor(Math.random() * 1e9) + "@lid"; // fresh sender: the 1 s per-sender cooldown must not couple checks
  await handler.handle(s, m, text, st.getSettings, st.saveSettings);
  return s;
};
const reply = (text, quotedMessage, extra = {}) => ({ key: { remoteJid: "9555@lid", id: "R" + Math.random(), fromMe: false }, message: { extendedTextMessage: { text, contextInfo: { stanzaId: "Q1", participant: "9555@lid", quotedMessage } } }, ...extra });
const sha = (alg, s) => crypto.createHash(alg).update(s).digest("hex");

(async () => {
  section("hash");
  let s = await run(".hash abc");
  check("default is sha256 and correct", lastText(s).includes(sha("sha256", "abc")) && /SHA256/.test(lastText(s)), lastText(s));
  for (const a of ["md5", "sha1", "sha512"]) { s = await run(`.hash ${a} abc`); check(`${a} correct`, lastText(s).includes(sha(a, "abc"))); }
  s = await run(".hash hello world");
  check("'hello world' (first word is not an algorithm) hashes the whole text", lastText(s).includes(sha("sha256", "hello world")));
  s = await run(".hash", { msg: reply(".hash", { conversation: "replied text" }) });
  check("replying to a text hashes that text", lastText(s).includes(sha("sha256", "replied text")), lastText(s));
  quoted._deps.download = async () => Buffer.from("file-bytes-123");
  s = await run(".hash md5", { msg: reply(".hash md5", { documentMessage: { fileName: "a.bin", fileLength: 14, mimetype: "application/octet-stream" } }) });
  check("replying to a FILE hashes its bytes", lastText(s).includes(sha("md5", "file-bytes-123")) && /a\.bin/.test(lastText(s)), lastText(s));
  s = await run(".hash");
  check("no input -> usage", /Usage: \.hash/.test(lastText(s)));
  s = await run(".hash sha256", { msg: reply(".hash sha256", { documentMessage: { fileLength: 99 * 1024 * 1024 } }) });
  check("huge file refused before downloading", /too large/.test(lastText(s)));

  section("encode / decode");
  const samples = { base64: "Hello, Wörld 🌍", base64url: "a?b>c~d", hex: "Hi there", url: "a b&c=d/é", binary: "OK 👍", morse: "sos 123", rot13: "Hello" };
  for (const [t, text] of Object.entries(samples)) {
    const enc = codec.encode(t, text), dec = codec.decode(t, enc);
    check(`${t}: round trip`, t === "morse" ? dec === text : dec === text, [enc, dec]);
  }
  check("base64 known value", codec.encode("base64", "hello") === "aGVsbG8=");
  check("hex known value", codec.encode("hex", "AB") === "4142");
  check("url known value", codec.encode("url", "a b") === "a%20b");
  check("morse known value", codec.encode("morse", "sos") === "... --- ...");
  check("rot13 known value", codec.encode("rot13", "Hello") === "Uryyb");
  s = await run(".encode base64 hello world");
  check(".encode base64 via the command", lastText(s).includes("aGVsbG8gd29ybGQ="), lastText(s));
  s = await run(".decode base64 aGVsbG8gd29ybGQ=");
  check(".decode base64 via the command", lastText(s).includes("hello world"));
  s = await run(".decode base64 !!!notbase64???");
  check("bad base64 -> friendly error", /isn't valid base64/.test(lastText(s)));
  s = await run(".decode hex 4g");
  check("bad hex -> friendly error", /isn't valid hex/.test(lastText(s)));
  s = await run(".decode binary 0101");
  check("bad binary -> friendly error", /groups of 8/.test(lastText(s)));
  s = await run(".encode nonsense hi");
  check("unknown type -> usage with the list of types", /Types: base64, base64url, hex, url, binary, morse, rot13/.test(lastText(s)));
  s = await run(".encode base64", { msg: reply(".encode base64", { conversation: "from reply" }) });
  check("encode a replied text", lastText(s).includes(Buffer.from("from reply").toString("base64")));
  s = await run(".encode");
  check("no input -> usage", /Usage: \.encode/.test(lastText(s)));

  section("json");
  s = await run('.json {"a":1,"b":[1,2,{"c":null}]}');
  check("valid JSON is pretty-printed with a summary", /Valid JSON \(object, 2 keys\)/.test(lastText(s)) && /"a": 1/.test(lastText(s)) && /\n/.test(lastText(s)), lastText(s));
  s = await run('.json min { "a" : 1 , "b" : [ 1 , 2 ] }');
  check("min removes the spaces", lastText(s).includes('{"a":1,"b":[1,2]}'), lastText(s));
  s = await run(".json [1,2,3]");
  check("arrays are described", /array, 3 items/.test(lastText(s)));
  s = await run('.json {"a": }');
  check("invalid JSON -> clear error with the reason", /Not valid JSON/.test(lastText(s)) && /Unexpected|token|position/i.test(lastText(s)), lastText(s));
  s = await run(".json", { msg: reply(".json", { conversation: '{"x":true}' }) });
  check("JSON from a replied message", /Valid JSON/.test(lastText(s)) && /"x": true/.test(lastText(s)));
  s = await run(".json");
  check("no input -> usage", /Usage: \.json/.test(lastText(s)));

  section("uuid");
  s = await run(".uuid");
  const ids = lastText(s).match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g) || [];
  check("one valid v4 UUID", ids.length === 1, lastText(s));
  s = await run(".uuid 5"); const five = lastText(s).match(/[0-9a-f]{8}-[0-9a-f]{4}-4/g) || [];
  check("count works", five.length === 5);
  s = await run(".uuid 500"); check("capped at 10", (lastText(s).match(/[0-9a-f]{8}-[0-9a-f]{4}-4/g) || []).length === 10);
  s = await run(".uuid 3"); const set = new Set(lastText(s).match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f-]+/g)); check("all different", set.size === 3);

  section("color");
  s = await run(".color red");
  check("name -> HEX/RGB/HSL", /Name: red/.test(lastText(s)) && /HEX: #FF0000/.test(lastText(s)) && /rgb\(255, 0, 0\)/.test(lastText(s)) && /hsl\(0, 100%, 50%\)/.test(lastText(s)), lastText(s));
  s = await run(".color #008000"); check("#hex", /Name: green/.test(lastText(s)) && /rgb\(0, 128, 0\)/.test(lastText(s)));
  s = await run(".color f80"); check("short hex #f80 -> #FF8800", /#FF8800/.test(lastText(s)));
  s = await run(".color rgb(0,128,128)"); check("rgb(...) -> teal", /Name: teal/.test(lastText(s)));
  s = await run(".color 255 0 128"); check("three numbers", /#FF0080/.test(lastText(s)));
  s = await run(".color dark blue"); check("two-word name", /#00008B/.test(lastText(s)));
  s = await run(".color #fe0001"); check("nearest name for an unnamed colour", /Name: red \(nearest\)/.test(lastText(s)), lastText(s));
  s = await run(".color banana"); check("unknown -> friendly error", /I don't understand "banana"/.test(lastText(s)));
  s = await run(".color rgb(300,0,0)"); check("out-of-range rgb rejected", /I don't understand/.test(lastText(s)));
  s = await run(".color"); check("no input -> usage", /Usage: \.color/.test(lastText(s)));

  section("convert");
  const conv = require("../src/commands/convert").convert;
  const near = (a, b) => Math.abs(a - b) < 1e-4 * Math.max(1, Math.abs(b));
  check("10 km -> 6.21371 mi", near(conv(10, "km", "mi").result, 6.21371));
  check("100 c -> 212 f", near(conv(100, "c", "f").result, 212));
  check("32 f -> 0 c", near(conv(32, "f", "c").result, 0));
  check("0 c -> 273.15 k", near(conv(0, "c", "k").result, 273.15));
  check("1 gb -> 1024 mb", near(conv(1, "gb", "mb").result, 1024));
  check("5 lb -> 2.26796 kg", near(conv(5, "lb", "kg").result, 2.26796));
  check("1 mi -> 1.609344 km", near(conv(1, "mi", "km").result, 1.609344));
  check("60 kmh -> 37.2823 mph", near(conv(60, "kmh", "mph").result, 37.2823));
  check("90 min -> 1.5 h", near(conv(90, "min", "h").result, 1.5));
  check("1 gal -> 3.78541 l", near(conv(1, "gal", "l").result, 3.78541));
  check("plural / long names: miles, kilometers, pounds, celsius", near(conv(1, "miles", "kilometers").result, 1.609344) && near(conv(2, "pounds", "kilograms").result, 0.907185) && near(conv(0, "celsius", "fahrenheit").result, 32));
  s = await run(".convert 10 km to mi"); check("through the command", /10 km = 6\.2137\d* mi/.test(lastText(s)), lastText(s));
  s = await run(".convert 2,5 kg to g"); check("comma decimals", /2\.5 kg = 2500 g/.test(lastText(s)), lastText(s));
  s = await run(".convert 5 kg to km"); check("incompatible units -> clear error", /Can't convert mass \(kg\) to length \(km\)/.test(lastText(s)));
  s = await run(".convert 5 blorp to km"); check("unknown unit -> clear error", /don't know the unit "blorp"/.test(lastText(s)));
  s = await run(".convert"); check("no input -> help with every group", /length:/.test(lastText(s)) && /temperature:/.test(lastText(s)));

  section("time");
  const tm = require("../src/commands/time");
  check("zones resolve: nairobi, kenya, london, dar es salaam, tokyo, new york", ["nairobi", "kenya", "london", "dar es salaam", "tokyo", "new york"].map(tm.resolveZone).join() === "Africa/Nairobi,Africa/Nairobi,Europe/London,Africa/Dar_es_Salaam,Asia/Tokyo,America/New_York", ["nairobi", "kenya", "london", "dar es salaam", "tokyo", "new york"].map(tm.resolveZone));
  check("an exact IANA zone works", tm.resolveZone("Africa/Nairobi") === "Africa/Nairobi");
  check("nonsense -> null", tm.resolveZone("zzzzqqq") === null);
  const d = tm.describe("Africa/Dar_es_Salaam", new Date("2026-10-10T09:30:00Z"));
  check("known instant: 12:30 on Sat 10 Oct 2026 in Dar es Salaam, UTC+3", /Sat, 10 Oct 2026|Sat 10 Oct 2026/.test(d.when) && /12:30/.test(d.when) && d.off === "UTC+3", d);
  s = await run(".time dar es salaam"); check("command shows city, time and offset", /Dar es Salaam/.test(lastText(s)) && /UTC\+3/.test(lastText(s)), lastText(s));
  s = await run(".time"); check("no place -> 5 big cities", (lastText(s).match(/UTC/g) || []).length === 5, lastText(s));
  s = await run(".time zzzzqqq"); check("unknown place -> friendly error", /don't know a place called "zzzzqqq"/.test(lastText(s)));

  section("fileinfo");
  s = await run(".fileinfo", { msg: reply(".fileinfo", { documentMessage: { fileName: "plan.pdf", mimetype: "application/pdf", fileLength: 2 * 1048576, pageCount: 12, fileSha256: Buffer.from("ab".repeat(16), "hex") } }) });
  check("document: name, mime, size, pages, sha256", /Name: plan\.pdf/.test(lastText(s)) && /Mime: application\/pdf/.test(lastText(s)) && /Size: 2\.00 MB/.test(lastText(s)) && /Pages: 12/.test(lastText(s)) && /SHA-256: abababab/.test(lastText(s)), lastText(s));
  s = await run(".fileinfo", { msg: reply(".fileinfo", { imageMessage: { mimetype: "image/jpeg", fileLength: 51200, width: 1080, height: 720, caption: "holiday" } }) });
  check("photo: dimensions and caption", /Dimensions: 1080 × 720/.test(lastText(s)) && /Size: 50\.0 KB/.test(lastText(s)) && /Caption: holiday/.test(lastText(s)));
  s = await run(".fileinfo", { msg: reply(".fileinfo", { audioMessage: { mimetype: "audio/ogg; codecs=opus", fileLength: 9000, seconds: 75, ptt: true } }) });
  check("voice note: duration", /voice note/.test(lastText(s)) && /Duration: 1m 15s/.test(lastText(s)));
  s = await run(".fileinfo", { msg: reply(".fileinfo", { stickerMessage: { isAnimated: true, mimetype: "image/webp" } }) });
  check("sticker: animated flag", /Sticker \(animated\)/.test(lastText(s)));
  s = await run(".fileinfo"); check("nothing to inspect -> usage", /Reply to a photo/.test(lastText(s)));
  const own = { key: { remoteJid: "9556@lid", id: "OWN", fromMe: false }, message: { documentMessage: { fileName: "direct.txt", fileLength: 10, caption: ".fileinfo" } } };
  s = await run(".fileinfo", { msg: own }); check("works on a file sent WITH the command", /Name: direct\.txt/.test(lastText(s)));

  section("tomp3 / toimg (real ffmpeg)");
  let MAKER = null;
  for (const c of ["ffmpeg", (() => { try { return require("@ffmpeg-installer/ffmpeg").path; } catch { return null; } })()]) { if (!c) continue; try { execFileSync(c, ["-version"], { stdio: "pipe" }); MAKER = c; break; } catch { /* next */ } }
  if (!MAKER) { console.log("  (no ffmpeg on this host — conversion checks skipped)"); }
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conv-"));
    execFileSync(MAKER, ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, "v.mp4")]);
    let webp = null; try { execFileSync(MAKER, ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=1", "-frames:v", "1", "-c:v", "libwebp", path.join(dir, "s.webp")], { stdio: "pipe" }); webp = fs.readFileSync(path.join(dir, "s.webp")); } catch { /* no webp encoder here */ }
    ffcheck._reset(); delete process.env.FFMPEG_DISABLE;
    quoted._deps.download = async () => fs.readFileSync(path.join(dir, "v.mp4"));
    s = await run(".tomp3", { msg: reply(".tomp3", { videoMessage: { mimetype: "video/mp4", fileLength: 9000 } }) });
    const au = s.sent.find((x) => x.content.audio);
    check("video -> a real MP3 is sent", au && au.content.mimetype === "audio/mpeg" && Buffer.isBuffer(au.content.audio) && au.content.audio.length > 1000 && (au.content.audio.slice(0, 3).toString() === "ID3" || au.content.audio[0] === 0xff), au && au.content.audio.slice(0, 4));
    quoted._deps.download = async () => fs.readFileSync(path.join(dir, "v.mp4"));
    s = await run(".tomp3", { msg: reply(".tomp3", { audioMessage: { mimetype: "audio/mp4", ptt: true, fileLength: 9000 } }) });
    check("a voice note works too", s.sent.some((x) => x.content.audio));
    s = await run(".tomp3"); check("nothing to convert -> usage", /Reply to a video/.test(lastText(s)));
    s = await run(".tomp3", { msg: reply(".tomp3", { videoMessage: { fileLength: 99 * 1024 * 1024 } }) }); check("huge file refused", /too large/.test(lastText(s)));
    s = await run(".tomp3", { msg: reply(".tomp3", { imageMessage: { mimetype: "image/png" } }) }); check("a photo is not convertible -> usage", /Reply to a video/.test(lastText(s)));
    process.env.FFMPEG_DISABLE = "true"; ffcheck._reset();
    s = await run(".tomp3", { msg: reply(".tomp3", { videoMessage: { mimetype: "video/mp4", fileLength: 9000 } }) });
    check("without ffmpeg: an honest message pointing to .dltest", /needs ffmpeg/.test(lastText(s)) && /dltest/.test(lastText(s)), lastText(s));
    delete process.env.FFMPEG_DISABLE; ffcheck._reset();
    if (webp) {
      quoted._deps.download = async () => webp;
      s = await run(".toimg", { msg: reply(".toimg", { stickerMessage: { mimetype: "image/webp", isAnimated: false } }) });
      const im = s.sent.find((x) => x.content.image);
      check("still sticker -> a real PNG image", im && Buffer.isBuffer(im.content.image) && im.content.image.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
    } else console.log("  (no webp encoder on this host — sticker conversion check skipped)");
    s = await run(".toimg", { msg: reply(".toimg", { stickerMessage: { isAnimated: true } }) });
    check("animated sticker -> clear refusal", /animated — \.toimg only converts still stickers/.test(lastText(s)));
    s = await run(".toimg"); check("nothing to convert -> usage", /Reply to a sticker/.test(lastText(s)));
    process.env.FFMPEG_DISABLE = "true"; ffcheck._reset();
    s = await run(".toimg", { msg: reply(".toimg", { stickerMessage: { isAnimated: false } }) });
    check("without ffmpeg: honest message", /needs ffmpeg/.test(lastText(s)));
    delete process.env.FFMPEG_DISABLE; ffcheck._reset();
    const leftovers = fs.existsSync(require("../src/utils/convertMedia").DIR) ? fs.readdirSync(require("../src/utils/convertMedia").DIR) : [];
    check("no temp files left behind", leftovers.length === 0, leftovers);
  }

  section("they work in groups too, and are listed once each");
  const g = makeSock(); const st = makeStore();
  await handler.handle(g, groupMsg(3, ".uuid"), ".uuid", st.getSettings, st.saveSettings);
  check("a utility runs in a group", /UUID/.test(lastText(g)));
  const names = ["hash", "encode", "decode", "json", "uuid", "color", "convert", "time", "fileinfo", "tomp3", "toimg"];
  check("each has exactly one name (no aliases), scope BOTH", names.every((n) => { const c = handler.commands.get(n); return c && !(c.aliases || []).length && c.scope === "BOTH"; }));

  done();
})().catch((e) => { console.error(e); process.exit(1); });
