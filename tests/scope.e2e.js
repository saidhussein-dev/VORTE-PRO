// Scope / permission gate for every command. Run: node tests/scope.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore, texts, lastText, G } = M;
const handler = require("../src/bot/handlers/commandHandler");
const access = require("../src/utils/access");
const fs = require("fs"), path = require("path");

const run = async (sock, m, store = makeStore()) => { await handler.handle(sock, m, m.message.conversation || m.message.extendedTextMessage.text, store.getSettings, store.saveSettings); return store; };
const has = (sock, re) => texts(sock).some((t) => re.test(t));

(async () => {
  section("every command declares a valid scope");
  const missing = [], seen = new Set();
  for (const [name, c] of handler.commands) {
    if (seen.has(c)) continue; seen.add(c);
    if (c.name === "setting") { if (typeof c.getAccess !== "function") missing.push(c.name + " (getAccess)"); continue; }
    if (!access.SCOPES.includes(c.scope)) missing.push(c.name);
  }
  check(`all ${seen.size} commands have PRIVATE|GROUP|BOTH|OWNER (or dynamic getAccess)`, missing.length === 0, missing.join(", "));
  const ownerCmds = [...seen].filter((c) => c.scope === "OWNER").map((c) => c.name);
  check("owner-only (OWNER scope): sudo, restart, mode, update", ["sudo", "restart", "mode", "update"].every((n) => ownerCmds.includes(n)), ownerCmds.join(","));
  check("group-only + owner-only: leave, togroupstatus (group status is posted INTO the current group)", ["leave", "togroupstatus"].every((n) => { const r = access.requirementsFor(handler.commands.get(n), n, []); return r.scope === "GROUP" && r.owner === true; }));
  check("destructive group commands require admin + bot admin", ["kick", "kickall", "promote", "demote", "add", "close", "open", "setgroupname"].every((n) => { const c = handler.commands.get(n); return c.scope === "GROUP" && c.admin && c.botAdmin; }));

  section("wrong context -> clean message, never silence");
  let s = makeSock();
  await run(s, privateMsg(".tagall"));
  check(".tagall in private -> group-only message", lastText(s) === "⚠️ This command can only be used in a group.", texts(s));
  s = makeSock(); await run(s, privateMsg(".kick @x"));
  check(".kick in private -> group-only message", lastText(s) === "⚠️ This command can only be used in a group.");
  s = makeSock(); await run(s, privateMsg(".antilink warn"));
  check(".antilink warn in private -> group-only message", lastText(s) === "⚠️ This command can only be used in a group.", texts(s));
  s = makeSock(); await run(s, privateMsg(".antibot on"));
  check(".antibot on in private -> group-only", lastText(s) === "⚠️ This command can only be used in a group.");
  s = makeSock(); await run(s, privateMsg(".antibothelp"));
  check(".antibothelp works in private (per-alias override)", has(s, /ANTIBOT HELP/), texts(s));
  const fakePrivateOnly = { scope: "PRIVATE" };
  const v = await access.check(makeSock(), groupMsg(1, "x"), fakePrivateOnly, "x", []);
  check("PRIVATE-scope command used in a group -> private-only message", !v.ok && v.message === "⚠️ This command can only be used in private chat.", v);

  section("BOTH-scope commands work in private AND group");
  s = makeSock(); await run(s, privateMsg(".userid"));
  check(".userid in private", has(s, /Your ID/), texts(s));
  s = makeSock(); await run(s, groupMsg(3, ".userid"));
  check(".userid in group", has(s, /Your ID/), texts(s));
  s = makeSock(); await run(s, privateMsg(".menu"), makeStore({ global: { menu: { style: 2 } } }));
  check(".menu in private produces a menu (text menu, style 2)", s.sent.map((x) => x.content?.text || x.content?.caption || "").some((t) => /◈ 👥 GROUP ◈/.test(t)), s.sent.map((x) => String(x.content?.caption || x.content?.text || "").slice(0, 60)));
  s = makeSock(); await run(s, privateMsg(".menu group"));
  check(".menu group in private -> the group commands (what the Group button opens)", has(s, /GROUP COMMANDS/), texts(s).map((t) => t.slice(0, 60)));

  section("owner-only stays owner-only (any chat)");
  s = makeSock(); await run(s, groupMsg(2, ".restart"));
  check(".restart by group ADMIN -> denied", lastText(s) === "🚫 Only the bot owner can use this command.", texts(s));
  s = makeSock(); await run(s, groupMsg(3, ".mode self"));
  check(".mode by MEMBER -> denied", lastText(s) === "🚫 Only the bot owner can use this command.");
  s = makeSock(); await run(s, privateMsg(".addsudo 2557", { from: "stranger" }));
  check(".addsudo by stranger in private -> denied", lastText(s) === "🚫 Only the bot owner can use this command.", texts(s));
  s = makeSock(); await run(s, groupMsg(2, ".togroupstatus hello"));
  check(".togroupstatus by group admin -> denied (it used to be open to everyone)", lastText(s) === "🚫 Only the bot owner can use this command.");
  s = makeSock(); await run(s, groupMsg(2, ".leave"));
  check(".leave by group admin -> denied", lastText(s) === "🚫 Only the bot owner can use this command." && !s.calls.some((c) => c[0] === "leave"));
  s = makeSock(); await run(s, groupMsg(1, ".leave"));
  check(".leave by OWNER -> executes", s.calls.some((c) => c[0] === "leave"), texts(s));
  s = makeSock(); await run(s, privateMsg(".leave"));
  check(".leave by owner in PRIVATE -> group-only message", lastText(s) === "⚠️ This command can only be used in a group.");

  section("admin-only commands");
  s = makeSock(); await run(s, groupMsg(3, ".kick @x", { mentions: [M.jidOf(4)] }));
  check(".kick by MEMBER -> admin-only message, nothing kicked", lastText(s) === "🚫 Only group admins or the bot owner can use this command." && !s.calls.some((c) => c[0] === "participants"), texts(s));
  s = makeSock({ botAdmin: false }); await run(s, groupMsg(2, ".kick @x", { mentions: [M.jidOf(4)] }));
  check(".kick by admin while BOT is not admin -> 'I need to be a group admin'", lastText(s) === "⚠️ I need to be a group admin to perform this action." && !s.calls.some((c) => c[0] === "participants"), texts(s));
  s = makeSock(); await run(s, groupMsg(2, ".kick @x", { mentions: [M.jidOf(4)] }));
  check(".kick by ADMIN -> user really removed", !s.state.participants.some((p) => p.id === M.jidOf(4)) && /Removed/.test(lastText(s)), texts(s));
  s = makeSock(); await run(s, groupMsg(1, ".kick @x", { mentions: [M.jidOf(3)] }));
  check(".kick by OWNER (not an admin of the group) -> allowed", !s.state.participants.some((p) => p.id === M.jidOf(3)), texts(s));
  s = makeSock({ lid: false }); await run(s, groupMsg(2, ".kick @x", { lid: false, mentions: [M.jidOf(4, false)] }));
  check(".kick works in a phone-addressed group too", !s.state.participants.some((p) => p.id === M.jidOf(4, false)), texts(s));
  s = makeSock(); await run(s, groupMsg(3, ".tagall"));
  check(".tagall by MEMBER -> denied (admins only)", lastText(s) === "🚫 Only group admins or the bot owner can use this command.");
  s = makeSock(); await run(s, groupMsg(2, ".tagall hello"));
  check(".tagall by ADMIN -> tags everyone", s.sent.some((x) => x.content.mentions && x.content.mentions.length === 6), texts(s));

  section(".tagall / .hidetag: bot owner and group admins only");
  for (const lid of [true, false]) {
    for (const [cmdText, shown] of [[".tagall Meeting", (x) => x.content.mentions?.length === 6 && /Meeting/.test(x.content.text)], [".hidetag Quiet ping", (x) => x.content.text === "Quiet ping" && x.content.mentions?.length === 6]]) {
      const name = cmdText.split(" ")[0];
      const tag = `${name} (${lid ? "LID" : "phone"} group)`;
      s = makeSock({ lid }); await run(s, groupMsg(1, cmdText, { lid }));
      check(`${tag}: bot OWNER who is NOT a group admin -> allowed`, s.sent.some(shown), texts(s));
      s = makeSock({ lid }); await run(s, groupMsg(2, cmdText, { lid }));
      check(`${tag}: group ADMIN -> allowed`, s.sent.some(shown), texts(s));
      s = makeSock({ lid }); await run(s, groupMsg(5, cmdText, { lid }));
      check(`${tag}: group CREATOR (superadmin) -> allowed`, s.sent.some(shown), texts(s));
      s = makeSock({ lid }); await run(s, groupMsg(3, cmdText, { lid }));
      check(`${tag}: regular MEMBER -> denied, nothing sent but the refusal`, s.sent.length === 1 && lastText(s) === "🚫 Only group admins or the bot owner can use this command.", texts(s));
      s = makeSock({ lid }); await run(s, groupMsg(4, cmdText, { lid }));
      check(`${tag}: another member -> denied`, !s.sent.some((x) => x.content.mentions?.length));
    }
  }
  s = makeSock(); await run(s, privateMsg(".hidetag hi"));
  check(".hidetag in private -> group-only message", lastText(s) === "⚠️ This command can only be used in a group.");
  s = makeSock(); await run(s, privateMsg(".tagall", { from: "stranger" }));
  check(".tagall by a stranger in private -> group-only message", lastText(s) === "⚠️ This command can only be used in a group.");
  check("both commands are declared admin-or-owner in the registry", ["tagall", "hidetag", "tagadmins"].every((n) => { const r = access.requirementsFor(handler.commands.get(n), n, []); return r.scope === "GROUP" && r.admin === true && !r.botAdmin; }));

  section(".setting family: permission depends on what you change");
  s = makeSock(); await run(s, groupMsg(2, ".autotyping on"));
  check(".autotyping on by group admin -> owner only", lastText(s) === "🚫 Only the bot owner can use this command.", texts(s));
  s = makeSock(); let st = await run(s, groupMsg(1, ".autotyping private"));
  check(".autotyping private by owner -> saved + panel", st.raw().global.automation.autotyping.scope === "private" && /Scope: 👤 Private/.test(lastText(s)), lastText(s));
  s = makeSock(); await run(s, groupMsg(3, ".autotyping"));
  check(".autotyping (status only) readable by anyone", /AUTO TYPING/.test(lastText(s)), texts(s));
  s = makeSock(); await run(s, groupMsg(3, ".antilink warn"));
  check(".antilink warn by MEMBER -> admin only", lastText(s) === "🚫 Only group admins or the bot owner can use this command.");
  s = makeSock(); st = await run(s, groupMsg(2, ".antilink warn"));
  check(".antilink warn by ADMIN -> saved", st.raw()[G].antilink === true && st.raw()[G].antiActions.antilink === "warn", st.raw());
  s = makeSock(); await run(s, groupMsg(2, ".antidelete on"));
  check(".antidelete on by group admin -> owner only", lastText(s) === "🚫 Only the bot owner can use this command.");
  s = makeSock(); st = await run(s, privateMsg(".antidelete on"));
  check(".antidelete on by owner in private -> saved globally", st.raw().global.antidelete.enabled === true, lastText(s));
  s = makeSock(); st = await run(s, privateMsg(".welcome on"));
  check(".welcome on in private -> group-only (it only works in groups)", lastText(s) === "⚠️ This command can only be used in a group.", texts(s));

  done();
})().catch((e) => { console.error(e); process.exit(1); });
