// Every group command against a STATEFUL fake group (LID-addressed and phone-addressed).
// Run: node tests/groupcmds.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, groupMsg, privateMsg, makeStore, texts, lastText, G, jidOf, people } = M;
const handler = require("../src/bot/handlers/commandHandler");
const { processMessage } = require("../src/bot/events/messageHandler");
const identity = require("../src/utils/identity");
const helpers = require("../src/utils/helpers");

const body = (m) => m.message.conversation || m.message.extendedTextMessage.text;
const run = async (sock, m, store = makeStore()) => { await handler.handle(sock, m, body(m), store.getSettings, store.saveSettings); return store; };
const apiCalls = (s) => s.calls.filter((c) => ["participants", "subject", "desc", "setting", "removepp", "revoke", "request"].includes(c[0]));
const inGroup = (s, n, lid = true) => s.state.participants.some((p) => p.id === jidOf(n, lid));
const isAdmin = (s, n, lid = true) => !!s.state.participants.find((p) => p.id === jidOf(n, lid))?.admin;

(async () => {
  for (const lid of [true, false]) {
    const label = lid ? "LID-addressed group" : "phone-addressed group";
    const J = (n) => jidOf(n, lid);
    const mk = (o = {}) => makeSock({ lid, ...o });
    const msg = (n, text, o = {}) => groupMsg(n, text, { lid, ...o });

    section(`${label}: kick / promote / demote / add / kickall`);
    let s = mk();
    await run(s, msg(2, ".kick @x", { mentions: [J(4)] }));
    check("kick @mention really removes the member", !inGroup(s, 4, lid) && /👢 Removed: @/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".kick", { replyTo: J(3) }));
    check("kick by REPLYING to their message", !inGroup(s, 3, lid), texts(s));
    s = mk(); await run(s, msg(2, `.kick 25570000000${4}`));
    check("kick by phone NUMBER", !inGroup(s, 4, lid), texts(s));
    s = mk(); await run(s, msg(2, ".kick @a @b", { mentions: [J(3), J(4)] }));
    check("kick two people at once", !inGroup(s, 3, lid) && !inGroup(s, 4, lid));
    s = mk(); await run(s, msg(2, ".kick"));
    check("kick with no target -> usage", /Usage: \.kick @user/.test(lastText(s)) && !apiCalls(s).length);
    s = mk(); await run(s, msg(2, ".kick @creator", { mentions: [J(5)] }));
    check("cannot kick the group CREATOR (refused before calling WhatsApp)", inGroup(s, 5, lid) && /group creator/.test(lastText(s)) && !apiCalls(s).length, texts(s));
    s = mk(); await run(s, msg(2, ".kick @owner", { mentions: [J(1)] }));
    check("cannot kick the bot OWNER", inGroup(s, 1, lid) && /my owner/.test(lastText(s)) && !apiCalls(s).length, texts(s));
    s = mk(); await run(s, msg(2, ".kick @bot", { mentions: [lid ? "9099@lid" : M.BOT_PN] }));
    check("cannot kick the BOT itself", /can't do that to myself/.test(lastText(s)) && !apiCalls(s).length, texts(s));
    s = mk(); await run(s, msg(2, ".kick @ghost", { mentions: ["99999@lid"] }));
    check("kick someone not in the group -> clear message", /not in this group/.test(lastText(s)));
    s = mk({ refuse: { [`${lid ? "9004" : "255700000004"}`]: 403 } });
    await run(s, msg(2, ".kick @x", { mentions: [J(4)] }));
    check("WhatsApp REFUSES (403) -> reported as failure, NOT 'Removed'", inGroup(s, 4, lid) && !/Removed/.test(lastText(s)) && /refused/.test(lastText(s)), texts(s));
    s = mk({ lag: true }); await run(s, msg(2, ".kick @x", { mentions: [J(4)] }));
    check("WhatsApp says OK but nothing changed -> NOT reported as success", inGroup(s, 4, lid) && !/Removed/.test(lastText(s)) && /did not change/.test(lastText(s)), texts(s));
    s = mk({ throwOn: { participants: "forbidden" } }); await run(s, msg(2, ".kick @x", { mentions: [J(4)] }));
    check("API error -> human reason about admin permission", /permission|admin/.test(lastText(s)) && !/Removed/.test(lastText(s)), texts(s));

    s = mk(); await run(s, msg(2, ".promote @x", { mentions: [J(3)] }));
    check("promote makes them admin (verified by re-fetch)", isAdmin(s, 3, lid) && /Promoted to admin/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".promote @x", { mentions: [J(2)] }));
    check("promote an existing admin -> 'already an admin'", /already an admin/.test(lastText(s)) && !apiCalls(s).length);
    s = mk(); await run(s, msg(2, ".promote", { replyTo: J(4) }));
    check("promote by reply", isAdmin(s, 4, lid));
    s = mk({ lag: true }); await run(s, msg(2, ".promote @x", { mentions: [J(3)] }));
    check("promote that WhatsApp silently ignored -> not reported as success", !isAdmin(s, 3, lid) && !/Promoted/.test(lastText(s)));
    s = mk(); await run(s, msg(1, ".demote @x", { mentions: [J(2)] }));
    check("demote (by owner) removes admin rights", !isAdmin(s, 2, lid) && /Demoted/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".demote @x", { mentions: [J(3)] }));
    check("demote a non-admin -> 'not an admin'", /not an admin/.test(lastText(s)) && !apiCalls(s).length);
    s = mk(); await run(s, msg(2, ".demote @x", { mentions: [J(5)] }));
    check("cannot demote the group creator", isAdmin(s, 5, lid) && /group creator/.test(lastText(s)));

    s = mk(); await run(s, msg(2, ".add 255700000077"));
    check("add a number -> really added", s.state.participants.some((p) => p.id === "255700000077@s.whatsapp.net") && /Added: \+255700000077/.test(lastText(s)), texts(s));
    s = mk({ refuse: { "255700000078": 403 } }); await run(s, msg(2, ".add 255700000078"));
    check("add refused by privacy (403) -> reason + invite-link hint", /privacy/.test(lastText(s)) && /gclink/.test(lastText(s)) && !/Added/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".add"));
    check("add without number -> usage", /Usage: \.add/.test(lastText(s)));
    s = mk(); await run(s, msg(2, ".kickall"));
    check("kickall removes members but keeps admins, creator, bot and the owner", !inGroup(s, 3, lid) && !inGroup(s, 4, lid) && inGroup(s, 1, lid) && inGroup(s, 2, lid) && inGroup(s, 5, lid) && /Removed 2 of 2/.test(lastText(s)), texts(s));

    section(`${label}: open / close / name / description / picture / link`);
    s = mk(); await run(s, msg(2, ".close"));
    check("close -> announce really on", s.state.announce === true && /Group closed/.test(lastText(s)), texts(s));
    s = mk(); s.state.announce = true; await run(s, msg(2, ".close"));
    check("close when already closed -> info, no API call", /already closed/.test(lastText(s)) && !apiCalls(s).length);
    s = mk(); s.state.announce = true; await run(s, msg(2, ".open"));
    check("open -> announce really off", s.state.announce === false && /Group opened/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".open"));
    check("open when already open -> info", /already open/.test(lastText(s)) && !apiCalls(s).length);
    s = mk({ lag: true }); await run(s, msg(2, ".close"));
    check("WhatsApp accepts but does not apply -> 'I couldn't close', never 'Group closed'", /couldn't close/.test(lastText(s)) && !/Group closed/.test(lastText(s)), texts(s));
    s = mk({ throwOn: { setting: "not-authorized" } }); await run(s, msg(2, ".close"));
    check("not-authorized -> says it lacks permission", /permission/.test(lastText(s)));
    s = mk(); await run(s, msg(2, ".setgroupname Brand New Name"));
    check("setgroupname -> subject really changed", s.state.subject === "Brand New Name" && /Group name updated to: Brand New Name/.test(lastText(s)), texts(s));
    check("fresh read right after the change returns the NEW name (cache invalidated)", (await identity.getMetadata(s, G)).subject === "Brand New Name");
    s = mk(); await run(s, msg(2, ".updategname Alias Works"));
    check(".updategname (removed duplicate name) no longer exists", s.state.subject !== "Alias Works" && !apiCalls(s).length, texts(s));
    s = mk({ lag: true }); await run(s, msg(2, ".setgroupname Never Applied"));
    check("name change WhatsApp ignored -> not reported as updated", /couldn't change the group name/.test(lastText(s)) && !/updated to/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".setgroupname " + "x".repeat(101)));
    check("name longer than 100 chars -> rejected up front", /too long/.test(lastText(s)) && !apiCalls(s).length);
    s = mk(); await run(s, msg(2, ".setgroupname"));
    check("name missing -> usage", /Usage: \.setgroupname/.test(lastText(s)));
    s = mk(); await run(s, msg(2, ".updategdesc New rules: be kind"));
    check("updategdesc -> description really changed", s.state.desc === "New rules: be kind" && /description updated/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(2, ".delppgroup"));
    check("delppgroup uses REMOVE (not 'upload blank image') and verifies", s.calls.some((c) => c[0] === "removepp") && s.state.pic === false && /picture removed/.test(lastText(s)), texts(s));
    s = mk({ lag: true }); await run(s, msg(2, ".delppgroup"));
    check("picture still there -> honest warning instead of success", /still shows/.test(lastText(s)) && !/picture removed/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(3, ".gclink"));
    check("gclink (any member) returns the link", /https:\/\/chat\.whatsapp\.com\/INVITECODE/.test(lastText(s)));
    s = mk(); await run(s, msg(2, ".revoke"));
    check("revoke returns the NEW link", s.calls.some((c) => c[0] === "revoke") && /NEWCODE/.test(lastText(s)));

    section(`${label}: tagging / info / poll`);
    s = mk(); await run(s, msg(2, ".tagall Meeting now"));
    check("tagall mentions every member (6) with the note", s.sent[0].content.mentions.length === 6 && /Meeting now/.test(s.sent[0].content.text), texts(s));
    const big = Array.from({ length: 400 }, (_, i) => ({ id: `8${String(i).padStart(4, "0")}@lid`, phoneNumber: `2557001${String(i).padStart(5, "0")}@s.whatsapp.net`, admin: null }));
    s = mk({ participants: [...people({ lid: true }).filter((p) => p.admin), ...big] }); await run(s, msg(2, ".tagall"));
    check("400 members -> split into several messages, all tagged", s.sent.length === 3 && s.sent.reduce((n, x) => n + x.content.mentions.length, 0) === 403, s.sent.map((x) => x.content.mentions.length));
    s = mk(); await run(s, msg(2, ".hidetag Quiet ping"));
    check("hidetag: the .hidetag command message is deleted", s.sent.some((x) => x.content.delete));
    const ht = s.sent.find((x) => x.content.mentions);
    check("hidetag: text without @tags, everyone mentioned", ht?.content.text === "Quiet ping" && ht.content.mentions.length === 6);
    s = mk(); await run(s, msg(2, ".hidetag"));
    check("hidetag with nothing to send -> usage", /Usage: \.hidetag/.test(lastText(s)) && s.sent.length === 1);
    s = mk(); await run(s, msg(2, ".hidetag", { replyTo: J(3) }));
    const ht2 = s.sent.find((x) => x.content.mentions);
    check("hidetag replying to a text re-sends that text to everyone", ht2?.content.text === "quoted text" && ht2.content.mentions.length === 6);
    s = mk(); await run(s, msg(2, ".tagadmins Help!"));
    check("tagadmins mentions only the admins (3)", s.sent[0].content.mentions.length === 3, s.sent[0].content.mentions);
    s = mk(); await run(s, msg(3, ".listadmins"));
    check("listadmins (any member) shows 3 admins, marks the creator", /GROUP ADMINS \(3\)/.test(lastText(s)) && /\(creator\)/.test(lastText(s)), texts(s));
    s = mk({ subject: "First Name" }); await run(s, msg(3, ".ginfo"));
    check("ginfo shows members/admins", /Members: 6/.test(lastText(s)) && /Admins: 3/.test(lastText(s)) && /First Name/.test(lastText(s)), texts(s));
    s.state.subject = "Changed Elsewhere"; await run(s, msg(3, ".ginfo"));
    check("ginfo is fresh: sees a change made outside the bot", /Changed Elsewhere/.test(lastText(s)));
    s = mk(); await run(s, msg(2, ".poll Lunch?|Rice|Pilau|Chips"));
    check("poll created with 3 options", s.sent[0].content.poll?.values.length === 3 && s.sent[0].content.poll.name === "Lunch?");
    s = mk(); await run(s, msg(2, ".poll Lunch?|OnlyOne"));
    check("poll with <2 options -> usage", /Usage: \.poll/.test(lastText(s)) && !s.sent.some((x) => x.content.poll));

    section(`${label}: mute / unmute / warn`);
    s = mk(); let st = makeStore();
    await run(s, msg(2, ".mute @x 15", { mentions: [J(3)] }), st);
    const muted = st.raw()[G]?.mutedUsers || {};
    check("mute stores the member under BOTH phone and LID digits", muted["255700000003"] > Date.now() && /muted for 15 minute/.test(lastText(s)), muted);
    s.sent.length = 0;
    await processMessage(s, msg(3, "can anyone hear me", { id: "MUTED1" }), st.getSettings, st.saveSettings);
    check("a muted member's next message is deleted", s.sent.some((x) => x.content.delete?.id === "MUTED1"));
    s.sent.length = 0;
    await processMessage(s, msg(4, "I am not muted", { id: "FREE1" }), st.getSettings, st.saveSettings);
    check("other members unaffected", !s.sent.some((x) => x.content.delete));
    await run(s, msg(2, ".unmute @x", { mentions: [J(3)] }), st);
    check("unmute clears every stored key", Object.keys(st.raw()[G].mutedUsers).length === 0 && /unmuted/.test(lastText(s)), st.raw()[G]);
    s = mk(); await run(s, msg(1, ".mute @a", { mentions: [J(2)] }));
    check("cannot mute an admin", /can't mute/.test(lastText(s)) && !(makeStore().raw()[G]));
    s = mk(); st = makeStore(); await run(s, msg(2, ".mute", { replyTo: J(4) }), st);
    check("mute by reply (default 10 min)", /muted for 10 minute/.test(lastText(s)));
    s = mk(); st = makeStore();
    for (let i = 1; i <= 2; i++) await run(s, msg(2, ".warn @x", { mentions: [J(4)] }), st);
    check("warn: 2 warnings, still in the group", inGroup(s, 4, lid) && /Total warnings: 2\/3/.test(lastText(s)), texts(s));
    await run(s, msg(2, ".warn @x", { mentions: [J(4)] }), st);
    check("warn: 3rd warning removes them for real", !inGroup(s, 4, lid) && /reached 3\/3 warnings and was removed/.test(lastText(s)), texts(s));
    s = mk(); await run(s, msg(1, ".warn @a", { mentions: [J(2)] }));
    check("cannot warn an admin", /can't warn/.test(lastText(s)));

    section(`${label}: join requests`);
    s = mk(); s.state.pending = [{ jid: "9010@lid", phone_number: "255700000010@s.whatsapp.net" }, { jid: "9011@lid", phone_number: "255700000011@s.whatsapp.net" }];
    await run(s, msg(2, ".requests"));
    check("requests lists pending with phone numbers", /JOIN REQUESTS \(2\)/.test(lastText(s)) && /\+255700000010/.test(lastText(s)) && /\+255700000011/.test(lastText(s)), texts(s));
    await run(s, msg(2, ".accept 255700000010"));
    check("accept <number> approves exactly that request", s.state.pending.length === 1 && s.calls.some((c) => c[0] === "request" && c[1] === "approve" && c[2][0] === "9010@lid") && /Approved 1/.test(lastText(s)), texts(s));
    await run(s, msg(2, ".rejectall"));
    check("rejectall clears the rest", s.state.pending.length === 0 && /Rejected 1/.test(lastText(s)), texts(s));
    await run(s, msg(2, ".requests"));
    check("none pending -> says so", /No pending join requests/.test(lastText(s)));
    s = mk({ lag: true }); s.state.pending = [{ jid: "9010@lid", phone_number: "255700000010@s.whatsapp.net" }];
    await run(s, msg(2, ".acceptall"));
    check("approval that did not apply -> not reported as success", /could not be approved/.test(lastText(s)) && !/✅ Approved/.test(lastText(s)), texts(s));

    section(`${label}: antibot management`);
    s = mk(); st = makeStore();
    await run(s, msg(2, ".antibot add 255700000004"), st);
    check("antibot add flags the number", st.raw()[G].knownBots.includes("255700000004") && /flagged as a bot/.test(lastText(s)), texts(s));
    await run(s, msg(2, ".antibot warn"), st);
    check("antibot warn -> enabled with WARN action", /ANTIBOT/.test(lastText(s)) && /WARN/.test(lastText(s)) && st.raw()[G].antibot === true);
    await run(s, msg(2, ".antibot remove"), st);
    check("'.antibot remove' (no number) sets the REMOVE action", /REMOVE/.test(lastText(s)) && st.raw()[G].antiActions.antibot === "remove");
    await run(s, msg(2, ".antibot remove 255700000004"), st);
    check("'.antibot remove <number>' still unflags (old meaning kept)", !st.raw()[G].knownBots.includes("255700000004"), texts(s));
    await run(s, msg(2, ".antibot add 255700000004"), st); await run(s, msg(2, ".botlist"), st);
    check("botlist shows flagged numbers", /255700000004/.test(lastText(s)), lastText(s));
    await run(s, msg(2, ".kickbot"), st);
    check("kickbot removes flagged members for real", !inGroup(s, 4, lid), texts(s));
    await run(s, msg(3, ".antibothelp"), st);
    check("antibothelp (any member) explains the modes", /warn \| delete \| remove/.test(lastText(s)));
    s = mk({ botAdmin: false }); st = makeStore(); await run(s, msg(2, ".kickbot"), st);
    check("kickbot while bot isn't admin -> 'I need to be a group admin'", /I need to be a group admin/.test(lastText(s)) && !apiCalls(s).length);

    section(`${label}: permission gates on EVERY admin command`);
    const adminCmds = ["add 255700000077", "kick @x", "kickall", "promote @x", "demote @x", "close", "open", "setgroupname Zed", "updategdesc Zed", "delppgroup", "revoke", "mute @x", "unmute @x", "warn @x", "hidetag hi", "tagall", "tagadmins", "poll Q|A|B", "requests", "setwelcome hi", "setgoodbye bye", "delete"];
    let leaked = [], noBotAdminLeak = [];
    for (const c of adminCmds) {
      s = mk(); await run(s, msg(3, "." + c, { mentions: [J(4)] }));
      if (apiCalls(s).length || s.sent.some((x) => x.content.mentions?.length > 1 || x.content.poll)) leaked.push(c);
      else if (lastText(s) !== "🚫 Only group admins or the bot owner can use this command.") leaked.push(c + " (wrong message: " + lastText(s) + ")");
    }
    check("a plain MEMBER is stopped on all " + adminCmds.length + " admin commands, nothing executed", leaked.length === 0, leaked.join(" | "));
    const needBot = ["add 255700000077", "kick @x", "kickall", "promote @x", "demote @x", "close", "open", "setgroupname Zed", "updategdesc Zed", "delppgroup", "revoke", "mute @x", "requests"];
    for (const c of needBot) {
      s = mk({ botAdmin: false }); await run(s, msg(2, "." + c, { mentions: [J(4)] }));
      if (apiCalls(s).length || lastText(s) !== "⚠️ I need to be a group admin to perform this action.") noBotAdminLeak.push(c + ": " + lastText(s));
    }
    check("when the BOT is not admin, all " + needBot.length + " bot-admin commands say so and call nothing", noBotAdminLeak.length === 0, noBotAdminLeak.join(" | "));

    section(`${label}: sync / cache`);
    s = mk(); await run(s, msg(2, ".promote @x", { mentions: [J(3)] }));
    check("right after .promote the permission check already sees the new admin", (await helpers.isAdmin(s, G, J(3))) === true);
    s = mk(); await identity.getMetadata(s, G); const before = s.calls.filter((c) => c[0] === "groupMetadata").length;
    await identity.getMetadata(s, G);
    check("metadata cached briefly (one command ≠ many network calls)", s.calls.filter((c) => c[0] === "groupMetadata").length === before);
    identity.invalidate(G); await identity.getMetadata(s, G);
    check("invalidate (groups.update / participants.update) forces a fresh read", s.calls.filter((c) => c[0] === "groupMetadata").length === before + 1);
  }

  done();
})().catch((e) => { console.error(e); process.exit(1); });
