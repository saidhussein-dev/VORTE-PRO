// Prefix system (Queen Anita style: ".", ".!*", "all"). Run: node tests/prefix.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore, texts, lastText, sleep, G } = M;
const prefix = require("../src/utils/prefix");
const handler = require("../src/bot/handlers/commandHandler");
const { processMessage } = require("../src/bot/events/messageHandler");

const store = (p, extra = {}) => makeStore({ global: { ...(p === undefined ? {} : { prefix: p }), menu: { style: 2 }, ...extra } }); // style 2 = text menu as picture caption (unchanged)
const run = async (sock, m, st) => { const b = m.message.conversation || m.message.extendedTextMessage.text; await handler.handle(sock, m, b, st.getSettings, st.saveSettings); };
const feed = async (sock, m, st) => { await processMessage(sock, m, st.getSettings, st.saveSettings); await sleep(40); };
const priv = (text, o) => privateMsg(text, o);
let strangerN = 0;   // a different sender each time: the 1 s per-sender command cooldown must not couple unrelated checks
const stranger = (text) => { const m = privateMsg(text, { from: "stranger" }); m.key.remoteJid = `98${++strangerN}@lid`; return m; };
const answered = (s) => s.sent.length > 0;

(async () => {
  section("parsing the setting");
  check("'.' -> one prefix", JSON.stringify(prefix.parse(".").chars) === '["."]' && !prefix.parse(".").all);
  check("'.!*' -> three prefixes", JSON.stringify(prefix.parse(".!*").chars) === '[".","!","*"]');
  check("'. ! *' (spaces) -> same three", JSON.stringify(prefix.parse(". ! *").chars) === '[".","!","*"]');
  check("'all' / 'ALL' -> all mode", prefix.parse("all").all && prefix.parse("ALL").all);
  check("empty -> '.'", JSON.stringify(prefix.parse("").chars) === '["."]');
  check("duplicates removed", JSON.stringify(prefix.parse("..!!").chars) === '[".","!"]');
  check("letters and digits are refused", !!prefix.parse("x").error && !!prefix.parse("!7").error);
  check("emoji works as a single prefix", JSON.stringify(prefix.parse("🔥").chars) === '["🔥"]');
  check("more than 10 characters refused", !!prefix.parse("!@#$%^&*()_+").error);

  section("default behaviour (like Queen Anita): only '.'");
  const none = {};
  check("'.ping' matches", prefix.match(".ping", none)?.rest === "ping");
  check("'!ping' does NOT match by default (the old fixed list is gone)", prefix.match("!ping", none) === null);
  check("plain words don't match", prefix.match("ping", none) === null && prefix.match(" .ping", none) === null && prefix.match("", none) === null);
  check("display is '.'", prefix.display(none) === "." && prefix.headline(none) === ".");

  section("several prefixes");
  const multi = { global: { prefix: ".!*" } };
  check("each of . ! * matches", [".a", "!a", "*a"].every((t) => prefix.match(t, multi)?.rest === "a"));
  check("others don't", prefix.match("#a", multi) === null && prefix.match("?a", multi) === null);
  check("display = first, headline lists the others", prefix.display(multi) === "." && prefix.headline(multi) === ".  (also works: ! *)", prefix.headline(multi));

  section("'all': any symbol, or none");
  const all = { global: { prefix: "all" } };
  check("any symbol: . ! # / $ ?", [".a", "!a", "#a", "/a", "$a", "?a"].every((t) => prefix.match(t, all)?.rest === "a"));
  check("no prefix at all: 'ping' matches with prefix ''", prefix.match("ping hi", all)?.prefix === "" && prefix.match("ping hi", all)?.rest === "ping hi");
  check("all-mode matches are 'loose' (the word must be a real command)", prefix.match("hello", all).loose === true);
  check("display '.' and headline says all", prefix.display(all) === "." && /all/.test(prefix.headline(all)));
  check("'.prefix reset' ALWAYS works whatever the prefix (lock-out hatch)", [multi, all, { global: { prefix: "!" } }, { global: { prefix: "🔥" } }].every((st) => prefix.match(".prefix reset", st)?.rest === "prefix reset"));

  section("legacy settings keep working");
  check("old `customPrefix` is added on top of PREFIX", prefix.match("#a", { global: { customPrefix: "#" } })?.rest === "a" && prefix.match(".a", { global: { customPrefix: "#" } })?.rest === "a");
  check("runtime setting overrides the legacy one", prefix.match("#a", { global: { prefix: "!", customPrefix: "#" } }) === null);

  section("commands run under ANY prefix (they are written against '.')");
  let s = makeSock(), st = store("!");
  await run(s, priv("!userid"), st);
  check("'!userid' works when PREFIX is '!'", /Your ID/.test(lastText(s)), texts(s));
  s = makeSock(); await run(s, priv(".userid"), st);
  check("'.userid' is ignored when only '!' is allowed", !answered(s));
  s = makeSock(); st = store(".!*");
  await run(s, groupMsg(2, "!antilink warn"), st);
  check("a command that re-reads its own name (the .setting family) works with '!'", st.raw()[G].antilink === true && st.raw()[G].antiActions.antilink === "warn", [texts(s), st.raw()]);
  for (const [cmdText, label] of [["!joke", "fun.js"], ["!password 10", "tools.js"], ["!hangmanstart", "hangman.js"], ["!tictactoe", "tictactoe"], ["!meme", "meme"]]) {
    s = makeSock(); await run(s, priv(cmdText), store(".!*"));
    check(`'${cmdText}' (${label}) is recognised under '!'`, answered(s), texts(s));
  }
  s = makeSock(); st = store("🔥");
  await run(s, priv("🔥userid"), st);
  check("an emoji prefix works (2 UTF-16 units: body.slice(1) would have broken it)", /Your ID/.test(lastText(s)), texts(s));
  s = makeSock(); await run(s, groupMsg(2, "🔥antilink delete"), makeStore({ global: { prefix: "🔥" } }));
  check("…even for the commands that read their own name", /ANTILINK/.test(lastText(s)) && /DELETE/.test(lastText(s)), texts(s));

  section("replies show the REAL prefix");
  s = makeSock(); await run(s, groupMsg(2, "!kick"), store("!"));
  check("usage text says '!kick', not '.kick'", /Usage: !kick @user/.test(lastText(s)) && !/\.kick/.test(lastText(s)), lastText(s));
  s = makeSock(); await run(s, groupMsg(2, ".kick"), store(".!"));
  check("with '.' first the usual text is unchanged", /Usage: \.kick @user/.test(lastText(s)), lastText(s));
  s = makeSock(); await run(s, groupMsg(2, "!antilink"), store("!"));
  check("status text for the .setting family: '!antilink on|off|…'", /Usage: !antilink on\|off\|warn\|delete\|remove/.test(lastText(s)), lastText(s));
  check("rewrite touches command names only (www.example.com, e.g., 3.14 stay)", prefix.rewriteText("see www.example.com e.g. 3.14 and .kick now", "!", new Set(["kick"])) === "see www.example.com e.g. 3.14 and !kick now");
  check("rewrite is word-exact (.kicker is not .kick)", prefix.rewriteText(".kicker and .kick", "!", new Set(["kick"])) === ".kicker and !kick");
  check("rewrite works inside quotes, bold and lists", prefix.rewriteText('use `.kick` or *.kick* or "(.kick)"', "#", new Set(["kick"])) === 'use `#kick` or *#kick* or "(#kick)"');
  s = makeSock(); await run(s, priv("!menu"), store("!"));
  const menuText = s.sent.map((x) => x.content.text || x.content.caption || "").join("\n");
  check("the menu header says Prefix : !", /Prefix  : !/.test(menuText) && /│➽ !kick @user/.test(menuText) && !/│➽ \.[a-z]/.test(menuText), menuText.slice(0, 300));
  s = makeSock(); await run(s, priv(".menu"), store(".!*"));
  check("menu lists the extra prefixes", /Prefix  : \.  \(also works: ! \*\)/.test(s.sent.map((x) => x.content.text || x.content.caption || "").join("\n")));
  s = makeSock(); await run(s, priv("menu"), store("all"));
  check("menu in 'all' mode says so", /Prefix  : all \(any symbol, or none\)/.test(s.sent.map((x) => x.content.text || x.content.caption || "").join("\n")));

  section("'all' mode: only REAL commands react");
  s = makeSock(); st = store("all");
  await feed(s, stranger("hello how are you"), st);
  check("a normal sentence does nothing", !answered(s));
  s = makeSock(); await feed(s, stranger("userid"), st);
  check("a bare command word works with no prefix", /Your ID/.test(lastText(s)), texts(s));
  s = makeSock(); await feed(s, stranger("#userid"), st);
  check("any symbol works: '#userid'", /Your ID/.test(lastText(s)));
  s = makeSock(); await feed(s, stranger("/start"), st);
  check("an unknown '/start' is ignored silently", !answered(s));
  s = makeSock(); st = store("all", { safemode: true });
  await feed(s, stranger("just chatting"), st);
  check("safemode's delay is NOT triggered by ordinary chat in 'all' mode", !s.calls.some((c) => c[0] === "presence" && c[1] === "composing"), s.calls);
  s = makeSock(); st = store("all");
  const first = stranger("hello again"); await feed(s, first, st);
  s = makeSock(); await feed(s, stranger("userid"), st);
  check("chatting first does not use up the command cooldown", /Your ID/.test(lastText(s)));
  s = makeSock(); st = store(".", { mode: "public" });
  await feed(s, stranger("userid"), st);
  check("with the default '.', a bare 'userid' does nothing", !answered(s));
  s = makeSock(); await feed(s, stranger(".userid"), makeStore({}));
  check("…and '.userid' works through the real message handler", /Your ID/.test(lastText(s)));
  s = makeSock(); await feed(s, stranger("!userid"), makeStore({}));
  check("'!userid' is ignored by default", !answered(s));

  section("self-sent commands use the same matcher");
  s = makeSock(); st = store("!");
  await feed(s, privateMsg("!userid", { from: "owner", fromMe: true }), st);
  check("own-phone '!userid' runs", /Your ID/.test(lastText(s)), texts(s));
  s = makeSock(); await feed(s, privateMsg("just a note to self", { from: "owner", fromMe: true }), st);
  check("own-phone chatter is ignored", !answered(s));

  section(".prefix command");
  s = makeSock(); st = makeStore({});
  await run(s, privateMsg(".prefix"), st);
  check("shows the current prefix and how to change it", /Current: \./.test(lastText(s)) && /\.prefix all/.test(lastText(s)), lastText(s));
  await run(s, privateMsg(".prefix .!*"), st);
  check("set several -> saved + confirmation", st.raw().global.prefix === ".!*" && /Prefix updated/.test(lastText(s)) && /also works: ! \*/.test(lastText(s)), lastText(s));
  await run(s, privateMsg("!prefix all"), st);
  check("the new prefix controls the command itself: '!prefix all'", st.raw().global.prefix === "all", st.raw().global);
  await run(s, privateMsg(".prefix !"), st);   // with 'all' any symbol works
  check("'.prefix !' under 'all' -> only '!'", st.raw().global.prefix === "!");
  s = makeSock(); await run(s, privateMsg("!prefix 7"), st);
  check("a digit/letter is refused with an explanation", st.raw().global.prefix === "!" && /can't be used as a prefix/.test(lastText(s)), lastText(s));
  s = makeSock(); await run(s, privateMsg("!prefix this-is-way-too-long-for-a-prefix"), st);
  check("garbage is refused", st.raw().global.prefix === "!");
  s = makeSock(); await run(s, privateMsg(".prefix reset"), st);
  check("'.prefix reset' works even though only '!' was allowed (lock-out hatch) and restores '.'", !("prefix" in st.raw().global) && /Prefix reset/.test(lastText(s)), [st.raw(), lastText(s)]);
  s = makeSock(); st = makeStore({ global: { customPrefix: "#" } });
  await run(s, privateMsg(".prefix !"), st);
  check("setting a prefix retires the legacy customPrefix", st.raw().global.prefix === "!" && !("customPrefix" in st.raw().global));
  s = makeSock(); await run(s, groupMsg(3, ".prefix !"), makeStore({}));
  check("members can't change it (owner only)", lastText(s) === "🚫 Only the bot owner can use this command.");
  s = makeSock(); await run(s, groupMsg(2, ".prefix !"), makeStore({}));
  check("neither can group admins", lastText(s) === "🚫 Only the bot owner can use this command.");

  done();
})().catch((e) => { console.error(e); process.exit(1); });
