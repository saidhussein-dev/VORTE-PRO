// Dynamic bot / owner numbers. Run: node tests/botinfo.e2e.js
process.env.OWNER_1 = "+255 757 332 074";   // how an owner might type it into .env
process.env.OWNER_2 = "";
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, makeStore, texts, lastText } = M;
const botInfo = require("../src/utils/botInfo");
const config = require("../src/config/config");
const handler = require("../src/bot/handlers/commandHandler");

const run = async (sock, text) => { const st = makeStore({ global: { menu: { style: 2 } } }); // style 2 = the text menu as a picture caption (unchanged)
  const m = privateMsg(text, { from: "stranger" }); m.key.remoteJid = "97" + Math.floor(Math.random() * 1e9) + "@lid"; await handler.handle(sock, m, text, st.getSettings, st.saveSettings); return sock; };
const linked = (id) => { const s = makeSock(); s.user = { id: `${id}:7@s.whatsapp.net`, lid: "9099:7@lid" }; return s; };

(async () => {
  section("phone numbers are printed readably");
  const f = botInfo.formatPhone;
  check("+255 757 332 074 (your number)", f("255757332074") === "+255 757 332 074", f("255757332074"));
  check("+255 778 271 055 (the linked account)", f("255778271055") === "+255 778 271 055");
  check("other countries: +1 415 555 2671, +44 791 112 3456, +91 987 654 3210, +33 612 345 678", [f("14155552671"), f("447911123456"), f("919876543210"), f("33612345678")].join("|") === "+1 415 555 2671|+44 791 112 3456|+91 987 654 3210|+33 612 345 678");
  check("an unknown prefix is still shown (just not grouped)", f("999") === "+999" && f("") === "");

  section("owner number comes from OWNER_1, in any typing style");
  check("'+255 757 332 074' in .env becomes 255757332074", config.owner1 === "255757332074", config.owner1);
  check("ownerNumbers() returns it", JSON.stringify(botInfo.ownerNumbers(linked("255778271055"))) === '["255757332074"]');
  check("ownerPhones() prints it as +255 757 332 074", botInfo.ownerPhones(linked("255778271055")).join() === "+255 757 332 074");

  section("the BOT's number is read live from the linked account");
  let s = linked("255778271055");
  check("shows the linked account", botInfo.botPhone(s) === "+255 778 271 055");
  s.user = { id: "255700123456:2@s.whatsapp.net" };
  check("link another account -> it changes by itself (nothing stored)", botInfo.botPhone(s) === "+255 700 123 456");
  check("not connected -> clear placeholder", botInfo.botPhone({ user: null }) === "not connected");
  check("falls back to the saved credentials while connecting", botInfo.botPhone({ authState: { creds: { me: { id: "255711000222:4@s.whatsapp.net" } } } }) === "+255 711 000 222");

  section("where they are shown");
  s = await run(linked("255778271055"), ".owner");
  check(".owner: owner +255 757 332 074 and bot number +255 778 271 055", /Owner: \+255 757 332 074/.test(lastText(s)) && /Bot number: \+255 778 271 055/.test(lastText(s)), texts(s).join("|"));
  s = await run(linked("255778271055"), ".ownernumber");
  check(".ownernumber shows both", /Owner: \+255 757 332 074/.test(lastText(s)) && /Bot number: \+255 778 271 055/.test(lastText(s)));
  s = linked("255778271055");
  await run(s, ".owner");
  const card = s.sent.find((x) => x.content.contacts);
  check("a contact card for the OWNER number is sent", card && /waid=255757332074/.test(card.content.contacts.contacts[0].vcard));
  s = await run(linked("255778271055"), ".menu");
  const menu = s.sent.map((x) => x.content.text || x.content.caption || "").join("\n");
  check("the menu header shows the owner's number and the bot's number", /Owner no: \+255 757 332 074/.test(menu) && /Bot no\. : \+255 778 271 055/.test(menu), menu.slice(0, 400));
  s = linked("255799888777"); await run(s, ".menu");
  check("link a different account and the menu shows the new bot number at once", /Bot no\. : \+255 799 888 777/.test(s.sent.map((x) => x.content.text || x.content.caption || "").join("\n")));

  section("no OWNER_1 set -> the linked account is the owner");
  const saved = [config.owner1, config.owner2]; config.owner1 = null; config.owner2 = null;
  check("owner = the linked account", botInfo.ownerPhones(linked("255778271055")).join() === "+255 778 271 055");
  s = await run(linked("255778271055"), ".ownernumber");
  check(".ownernumber still answers sensibly", /Owner: \+255 778 271 055/.test(lastText(s)));
  [config.owner1, config.owner2] = saved;

  section("the owner number is NOT hardcoded anywhere in the code");
  const fs = require("fs"), path = require("path");
  const hits = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (["node_modules", ".git", "tests", "storage"].includes(f)) continue; const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.(js|json|html)$/.test(f) && /255\s?757\s?332\s?074/.test(fs.readFileSync(p, "utf8"))) hits.push(p); } })(path.join(__dirname, ".."));
  check("no file in the distributable contains the number (it would make everyone's bot yours)", hits.length === 0, hits);

  done();
})().catch((e) => { console.error(e); process.exit(1); });
