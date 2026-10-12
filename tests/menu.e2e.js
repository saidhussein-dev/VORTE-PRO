// Menu = real commands only, no duplicates, nothing forgotten. Run: node tests/menu.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, makeStore, texts } = M;
const handler = require("../src/bot/handlers/commandHandler");
const { CATEGORIES, buildMenuBody } = require("../src/utils/menuBuilder");

(async () => {
  const entries = CATEGORIES.flatMap((c) => c.items.map((i) => ({ ...i, cat: c.title })));
  const registry = handler.commands;

  section("every menu entry is a real command");
  const phantom = entries.filter((e) => !registry.has(e.c)).map((e) => e.c);
  check(`${entries.length} entries all resolve to an implementation`, phantom.length === 0, phantom.join(", "));
  const badAliases = entries.flatMap((e) => (e.a || []).filter((a) => !registry.has(a)).map((a) => `${e.c}->${a}`));
  check("every alias shown in the menu really exists", badAliases.length === 0, badAliases.join(", "));
  const wrongAlias = entries.flatMap((e) => (e.a || []).filter((a) => registry.has(a) && registry.get(a) !== registry.get(e.c) && !(e.c === "settings")).map((a) => `${e.c}~${a}`));
  check("aliases shown next to a command belong to that same command", wrongAlias.length === 0, wrongAlias.join(", "));

  section("no duplicates");
  const names = entries.map((e) => e.c);
  const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
  check("no command name listed twice", dupNames.length === 0, dupNames.join(", "));
  const shownAliases = entries.flatMap((e) => e.a || []);
  const clash = shownAliases.filter((a) => names.includes(a));
  check("an alias is never ALSO listed as its own entry", clash.length === 0, clash.join(", "));
  const aliasDup = shownAliases.filter((a, i) => shownAliases.indexOf(a) !== i);
  check("no alias shown twice", aliasDup.length === 0, aliasDup.join(", "));
  const sameImpl = new Map();
  for (const e of entries) { const c = registry.get(e.c); if (c.name !== "setting" && !["fun", "tools", "imageai", "hangman", "quiz", "setmenu"].includes(c.name)) { if (sameImpl.has(c)) sameImpl.get(c).push(e.c); else sameImpl.set(c, [e.c]); } }
  const dupImpl = [...sameImpl.values()].filter((v) => v.length > 1);
  check("two entries never point at one implementation (except intentional multi-feature files)", dupImpl.length === 0, JSON.stringify(dupImpl));

  section("nothing forgotten");
  const covered = new Set(entries.map((e) => registry.get(e.c)));
  const hidden = [...new Set(registry.values())].filter((c) => !covered.has(c)).map((c) => c.name);
  check("every implemented command appears in the menu", hidden.length === 0, hidden.join(", "));

  section("one working name per command");
  // Commands that are NOT synonyms: one file serving several distinct commands, or names that change what the command does.
  const DISTINCT = new Set(["setting", "fun", "tools", "imageai", "hangman", "quiz", "setmenu1", "blacklist", "requests", "antibot", "gpt", "randommovie"]);
  const withAliases = [...new Set(registry.values())].filter((c) => (c.aliases || []).length && !DISTINCT.has(c.name)).map((c) => `${c.name}: ${c.aliases.join(",")}`);
  check("no command keeps a duplicate name (only distinct-behaviour names remain)", withAliases.length === 0, withAliases.join(" | "));
  const removed = ["tt", "ig", "s", "link", "del", "resetlink", "ttt", "youtube", "video", "tr", "ddg", "setonline", "id", "uptime", "short", "privacy", "admins", "ai", "ask", "imagine", "groupinfo", "wikipedia", "updatebio", "description", "setgdesc", "everyone", "dictionary", "ytdebug", "dlcheck", "updategname", "play", "music", "wouldyourather", "creategroup", "movie", "tmdb", "help", "eval", "botname", "setname", "groupstatus", "gstatus", "tostatusgroup"];
  check("every removed duplicate name is really gone", removed.filter((n) => registry.has(n)).length === 0, removed.filter((n) => registry.has(n)).join(", "));
  check("the kept names exist", ["instagram", "tiktok", "sticker", "togroupstatus", "gpt", "claude", "deepseek", "randomtv"].every((n) => registry.has(n)));

  section("rendering");
  const body = buildMenuBody(".", registry);
  check("uses the configured prefix", body.includes("│➽ .kick @user") && !body.includes("undefined"));
  const body2 = buildMenuBody("#", registry);
  check("a different prefix changes every line", body2.includes("│➽ #kick @user") && !/│➽ \.[a-z]/.test(body2));
  check("badges come from real permissions: .kick 👮, .restart 👑, .tagall 👮, .ping none", /│➽ \.kick @user 👮/.test(body) && /│➽ \.restart 👑/.test(body) && /│➽ \.tagall \[msg\] 👮/.test(body) && /│➽ \.ping\n/.test(body), body.split("\n").filter((l) => /kick|restart|ping$/.test(l)));
  check("setting-driven keys get the right badge: autotyping 👑, antilink 👮, welcome 👮", /\.autotyping [^\n]*👑/.test(body) && /\.antilink [^\n]*👮/.test(body) && /\.welcome [^\n]*👮/.test(body));
  check("leave is badged owner", /│➽ \.leave 👑/.test(body), body.split("\n").find((l) => /\.leave/.test(l)));
  check("group status is listed under its ONE name, .togroupstatus", /│➽ \.togroupstatus /.test(body) && !/tostatusgroup/.test(body));
  const titles = [...body.matchAll(/◈ ([^◈\n]+) ◈/g)].map((x) => x[1]);
  check("no duplicate category titles", new Set(titles).size === titles.length, titles);
  check("legend present", /👑 owner only · 👮 group admin · 👥 group only/.test(body));
  // Style 2/3/4 still send the full text menu (as a picture/video caption) — that is the text this block verifies.
  const s = makeSock(); const st = makeStore({ global: { menu: { style: 2 } } });
  await handler.handle(s, privateMsg(".menu"), ".menu", st.getSettings, st.saveSettings);
  const sentText = s.sent.map((x) => x.content.text || x.content.caption || "").join("\n");
  check("the real .menu command sends it (header + body)", /Plugins : \d+/.test(sentText) && /◈ 👥 GROUP ◈/.test(sentText) && /◈ 👑 OWNER ◈/.test(sentText), sentText.slice(0, 200));
  const n = Number((sentText.match(/Plugins : (\d+)/) || [])[1]);
  check("Plugins counts distinct commands, not aliases", n === new Set(registry.values()).size && n < registry.size, { n, distinct: new Set(registry.values()).size, withAliases: registry.size });

  done();
})().catch((e) => { console.error(e); process.exit(1); });
