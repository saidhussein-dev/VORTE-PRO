// The new API-less commands (.age .bmi .tip .percent .morse .roman .numwords .countdown .zodiac .lorem) and .ssweb.
// Dates are fixed to Friday 2026-10-16 so every expected value can be checked by hand. Run: node tests/extras.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, makeStore, lastText } = M;
const handler = require("../src/bot/handlers/commandHandler");
const extras = require("../src/commands/extras");
const ssweb = require("../src/commands/ssweb");
extras._internal.deps.now = () => new Date(2026, 9, 16, 12, 0, 0);

const run = async (text, sockOverride) => {
  const s = sockOverride || makeSock(); const st = makeStore();
  const m = privateMsg(text, { from: "stranger", id: "X" + Math.random() });
  m.key.remoteJid = "97" + Math.floor(Math.random() * 1e9) + "@lid"; // fresh sender: the 1 s cooldown must not couple checks
  await handler.handle(s, m, text, st.getSettings, st.saveSettings);
  return s;
};
const has = (s, ...parts) => parts.every((p) => (p instanceof RegExp ? p.test(lastText(s)) : lastText(s).includes(p)));

(async () => {
  section("age");
  let s = await run(".age 2001-05-14");
  check("25 years, 5 months, 2 days", has(s, "25 years, 5 months, 2 days"), lastText(s));
  check("born on a Monday, Taurus, next birthday in 210 days (a Friday)", has(s, "Monday, 2001-05-14", "Taurus", "in 210 days (Friday)"), lastText(s));
  s = await run(".age 14/05/2001"); check("day-first date works", has(s, "25 years, 5 months, 2 days"), lastText(s));
  s = await run(".age 14 May 2001"); check("'14 May 2001' works", has(s, "25 years, 5 months, 2 days"), lastText(s));
  s = await run(".age 2000-02-29"); check("a 29 Feb birthday (month/day borrowing): 26 years, 7 months, 17 days", has(s, "26 years, 7 months, 17 days"), lastText(s));
  s = await run(".age 2000-10-16"); check("birthday today", has(s, "26 years, 0 months, 0 days", "today"), lastText(s));
  s = await run(".age 2030-01-01"); check("future date is refused", has(s, "future"), lastText(s));
  s = await run(".age 2001-02-30"); check("an impossible date shows the usage", has(s, "Usage"), lastText(s));
  s = await run(".age"); check("no argument shows the usage", has(s, "Usage"), lastText(s));

  section("bmi");
  s = await run(".bmi 70 175"); check("70 kg / 175 cm = 22.9, normal, healthy range 56.7 - 76.3", has(s, "BMI: 22.9", "Normal weight", "56.7 - 76.3 kg"), lastText(s));
  s = await run(".bmi 70 1.75"); check("height in metres works", has(s, "BMI: 22.9"), lastText(s));
  s = await run(".bmi 50 175"); check("underweight", has(s, "Underweight"), lastText(s));
  s = await run(".bmi 95 175"); check("obesity", has(s, "Obesity"), lastText(s));
  s = await run(".bmi 5000 175"); check("absurd weight refused", has(s, "don't look right"), lastText(s));
  s = await run(".bmi 70"); check("missing height shows the usage", has(s, "Usage"), lastText(s));

  section("tip");
  s = await run(".tip 85000 10 3"); check("tip 8,500, total 93,500, 31,166.67 each", has(s, "Tip (10%): 8,500", "Total: 93,500", "Per person (3): 31,166.67"), lastText(s));
  s = await run(".tip 100"); check("defaults to 10% for one person", has(s, "Tip (10%): 10", "Total: 110") && !has(s, "Per person"), lastText(s));
  s = await run(".tip abc"); check("bad bill shows the usage", has(s, "Usage"), lastText(s));

  section("percent");
  s = await run(".percent 20 of 150"); check("20% of 150 = 30", has(s, "20% of 150 = 30"), lastText(s));
  s = await run(".percent 30 outof 120"); check("30 is 25% of 120", has(s, "30 is 25% of 120"), lastText(s));
  s = await run(".percent 80 to 100"); check("80 to 100 = +25%", has(s, "+25% (increase)"), lastText(s));
  s = await run(".percent 100 to 80"); check("100 to 80 = -20%", has(s, "-20% (decrease)"), lastText(s));
  s = await run(".percent 5 outof 0"); check("divide by zero refused", has(s, "zero"), lastText(s));
  s = await run(".percent hello"); check("nonsense shows the usage", has(s, "Usage"), lastText(s));

  section("morse");
  s = await run(".morse sos"); check("sos -> ... --- ...", has(s, "... --- ..."), lastText(s));
  s = await run(".morse hello world"); check("two words joined with /", has(s, ".... . .-.. .-.. --- / .-- --- .-. .-.. -.."), lastText(s));
  s = await run(".morse ... --- ..."); check("morse in -> text out (SOS)", has(s, "MORSE → TEXT", "SOS"), lastText(s));
  s = await run(".morse .... .. / - .... . .-. ."); check("decodes words separated by /", has(s, "HI THERE"), lastText(s));
  s = await run(".morse ~~~"); check("only unsupported characters -> clear error", has(s, "None of those characters"), lastText(s));

  section("roman");
  s = await run(".roman 2024"); check("2024 = MMXXIV", has(s, "2024 = MMXXIV"), lastText(s));
  s = await run(".roman 1994"); check("1994 = MCMXCIV", has(s, "MCMXCIV"), lastText(s));
  s = await run(".roman 4"); check("4 = IV", has(s, "4 = IV"), lastText(s));
  s = await run(".roman mmxxiv"); check("MMXXIV = 2024 (any case)", has(s, "MMXXIV = 2024"), lastText(s));
  s = await run(".roman IIII"); check("IIII is not a valid numeral", has(s, "isn't a valid Roman numeral"), lastText(s));
  s = await run(".roman 4000"); check("4000 is out of range", has(s, "1 to 3999"), lastText(s));

  section("numwords");
  const nw = async (n, expect) => { const x = await run(`.numwords ${n}`); check(`${n} -> ${expect}`, has(x, expect), lastText(x)); };
  await nw("12345", "twelve thousand three hundred forty-five");
  await nw("0", "zero"); await nw("101", "one hundred one"); await nw("1000000", "one million"); await nw("1000001", "one million one");
  await nw("-7", "minus seven"); await nw("12.05", "twelve point zero five"); await nw("1,234,567", "one million two hundred thirty-four thousand five hundred sixty-seven");
  await nw("999999999999999", "nine hundred ninety-nine trillion nine hundred ninety-nine billion");
  s = await run(".numwords abc"); check("not a number shows the usage", has(s, "Usage"), lastText(s));

  section("countdown / zodiac");
  s = await run(".countdown 2026-12-25"); check("70 days to Christmas (a Friday)", has(s, "Friday, 2026-12-25", "70 days to go (10 weeks, 0 days)"), lastText(s));
  s = await run(".countdown 25 dec"); check("no year = the next 25 Dec", has(s, "2026-12-25", "70 days"), lastText(s));
  s = await run(".countdown 10 oct"); check("a date already passed this year -> next year", has(s, "2027-10-10"), lastText(s));
  s = await run(".countdown 2026-10-10"); check("an explicit past date says ago", has(s, "6 days ago"), lastText(s));
  s = await run(".countdown 2026-10-16"); check("today", has(s, "today"), lastText(s));
  for (const [d, sign] of [["14 May", "Taurus"], ["22 dec", "Capricorn"], ["19 jan", "Capricorn"], ["20 jan", "Aquarius"], ["23 jul", "Leo"], ["31/10", "Scorpio"], ["2001-03-20", "Pisces"], ["21 mar", "Aries"]]) {
    s = await run(`.zodiac ${d}`); check(`zodiac ${d} = ${sign}`, has(s, `Sign: ${sign}`), lastText(s));
  }
  s = await run(".zodiac 31 feb"); check("an impossible date shows the usage", has(s, "Usage"), lastText(s));

  section("lorem");
  s = await run(".lorem 2"); const txt = lastText(s).split("\n").slice(2).join(" ");
  check("two capitalised sentences ending in full stops", (txt.match(/[A-Z][^.]+\./g) || []).length === 2, txt);
  s = await run(".lorem 99"); check("capped at 10 sentences", (lastText(s).split("\n").slice(2).join(" ").match(/\./g) || []).length === 10, lastText(s));

  section(".ssweb: addresses");
  const n = ssweb._internal.normalizeUrl;
  check("example.com -> https://example.com/", n("example.com").url === "https://example.com/", n("example.com"));
  check("a full link is kept", n("https://github.com/a/b?x=1").url === "https://github.com/a/b?x=1");
  for (const bad of ["http://localhost:3000", "localhost", "http://127.0.0.1", "192.168.1.1", "10.0.0.5", "172.20.0.1", "169.254.169.254/latest", "http://[::1]/", "http://user:pass@example.com", "ftp://example.com", "intranet", "printer.local", "javascript:alert(1)", ""]) {
    check(`refused: ${bad || "(empty)"}`, !!n(bad).error, n(bad));
  }
  check("a public IP is fine", n("8.8.8.8").url === "http://8.8.8.8/" || n("8.8.8.8").url === "https://8.8.8.8/", n("8.8.8.8"));

  section(".ssweb: services are tried in order, only real pictures count");
  const PNG = Buffer.alloc(8000, 1);
  const calls = [];
  const fake = (plan) => async (url) => { calls.push(url); const r = plan(url); if (r instanceof Error) throw r; return r; };
  ssweb._internal.deps.sleep = async () => {};
  ssweb._internal.deps.get = fake((u) => (u.includes("thum.io") ? Object.assign(new Error("boom"), { response: { status: 500 } }) : { headers: { "content-type": "image/png" }, data: PNG }));
  let cap = await ssweb._internal.capture("https://example.com/", "desktop");
  check("thum.io fails -> microlink answers", cap.via === "microlink" && cap.buffer.length === 8000 && calls.length === 2, { via: cap.via, calls });
  calls.length = 0;
  ssweb._internal.deps.get = fake((u) => (u.includes("thum.io") ? { headers: { "content-type": "text/html" }, data: Buffer.from("<html>blocked</html>".repeat(300)) } : { headers: { "content-type": "image/png" }, data: PNG }));
  cap = await ssweb._internal.capture("https://example.com/", "desktop");
  check("an HTML error page from the first service is not accepted as a picture", cap.via === "microlink", cap.via);
  calls.length = 0;
  let mshotsTries = 0;
  ssweb._internal.deps.get = fake((u) => { if (u.includes("mshots")) { mshotsTries++; return mshotsTries < 3 ? { headers: { "content-type": "image/gif" }, data: Buffer.alloc(5000, 2) } : { headers: { "content-type": "image/jpeg" }, data: PNG }; } return Object.assign(new Error("down"), { code: "ECONNRESET" }); });
  cap = await ssweb._internal.capture("https://example.com/", "desktop");
  check("mshots 'still working' placeholder is retried until the real picture", cap.via === "wordpress mshots" && mshotsTries === 3, { via: cap.via, mshotsTries });
  ssweb._internal.deps.get = fake(() => Object.assign(new Error("down"), { code: "ETIMEDOUT" }));
  let failed = null; try { await ssweb._internal.capture("https://example.com/", "desktop"); } catch (e) { failed = e; }
  check("every service down -> one clear error with the reasons kept for the log", !!failed && /None of the screenshot services/.test(failed.message) && failed.details.length === 3, failed && failed.details);
  const pdesk = ssweb._internal.providers("https://example.com/", "desktop")[0].url, pmob = ssweb._internal.providers("https://example.com/", "mobile")[0].url, pfull = ssweb._internal.providers("https://example.com/", "full")[0].url;
  check("modes: desktop 1280, mobile 390, full page", pdesk.includes("width/1280/crop/720") && pmob.includes("width/390/crop/844") && pfull.includes("fullpage"), [pdesk, pmob, pfull]);

  section(".ssweb: the command");
  calls.length = 0;
  ssweb._internal.deps.get = fake(() => ({ headers: { "content-type": "image/png" }, data: PNG }));
  s = await run(".ssweb example.com mobile");
  const img = s.sent.find((x) => x.content.image)?.content;
  check("sends the picture with the link and the view in the caption", !!img && img.image.length === 8000 && /https:\/\/example\.com\//.test(img.caption) && /Mobile view/.test(img.caption), img && img.caption);
  check("asked the mobile size", calls[0].includes("width/390"), calls[0]);
  s = await run(".ssweb"); check("no link shows the usage", has(s, "Usage: .ssweb"), lastText(s));
  s = await run(".ssweb http://localhost:8080"); check("a private address is refused before any request", has(s, "private") && calls.length === 1, lastText(s));
  ssweb._internal.deps.get = fake(() => Object.assign(new Error("down"), { code: "ETIMEDOUT" }));
  const quiet = console.error; console.error = () => {};
  s = await run(".ssweb example.com"); console.error = quiet;
  check("when every service fails the user gets a clear message, no crash", s.sent.some((x) => /None of the screenshot services/.test(x.content.text || "")) && !s.sent.some((x) => x.content.image), s.sent.map((x) => x.content.text));

  done();
})().catch((e) => { console.error(e); process.exit(1); });
