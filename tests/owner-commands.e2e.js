// Owner-only commands must accept the owner (configured number, sudo, or the paired number itself) and refuse everyone else.
// Run: node tests/owner-commands.e2e.js
const M = require("./_mock");
const { check, section, done, makeSock, privateMsg, groupMsg, makeStore, texts, lastText } = M;
const handler = require("../src/bot/handlers/commandHandler");

const run = async (sock, m, store = makeStore()) => { await handler.handle(sock, m, m.message.conversation, store.getSettings, store.saveSettings); };
const refused = (s) => /only the bot owner|owner only|for my owner only|main owner/i.test(texts(s).join("|"));

// commands that check the owner a second time inside the command (these were the ones that could wrongly refuse the owner)
const COMMANDS = ["mode public", "ownername Tester", "setbio hello", "setnamebot Tester", "anticall off", "anticallmsg hi", "online on", "safemode on", "setstatusreact on", "blocklist", "getprivacy", "listsudo", "broadcast hi", "botdp", "addsudo 255700000077", "delsudo 255700000077"];

(async () => {
  section("the PAIRED number (fromMe) is accepted by every owner command — even typed inside someone ELSE's chat");
  for (const c of COMMANDS) {
    const s = makeSock();
    s.updateProfileStatus = async () => {}; s.updateProfileName = async () => {}; s.fetchBlocklist = async () => []; s.fetchPrivacySettings = async () => ({});
    // fromMe in a chat with a stranger: the chat id is the OTHER person's, so only "this is the linked account" identifies the owner
    await run(s, privateMsg("." + c, { from: "stranger", fromMe: true }));
    check(`.${c.split(" ")[0]} accepts the paired number`, !refused(s), texts(s));
  }

  section("restart / update / sudo use the same check (not executed here — they would restart or update the bot)");
  {
    const helpers = require("../src/utils/helpers");
    const s = makeSock();
    check("paired number (fromMe, in a stranger's chat) is a true owner", await helpers.senderIsTrueOwner(s, privateMsg(".restart", { from: "stranger", fromMe: true })));
    check("a stranger is not", !(await helpers.senderIsTrueOwner(s, privateMsg(".restart", { from: "stranger" }))));
    check("OWNER_1 (LID mapped to the number) is a true owner", await helpers.senderIsTrueOwner(s, privateMsg(".restart", { from: "owner" })));
    for (const f of ["restart", "update", "sudo", "setbio", "broadcast", "setnamebot"]) {
      const src = require("fs").readFileSync(require("path").join(__dirname, "../src/commands", f + ".js"), "utf8");
      check(`.${f} uses the shared owner check`, /senderIs(True)?Owner\(sock, m\)/.test(src) && !/helpers\.isOwner\(sender\)|helpers\.isTrueOwner\(sender\)/.test(src));
    }
  }

  section("the configured OWNER (arriving as a LID, mapped to OWNER_1) is accepted");
  for (const c of COMMANDS) {
    const s = makeSock();
    s.updateProfileStatus = async () => {}; s.updateProfileName = async () => {}; s.fetchBlocklist = async () => []; s.fetchPrivacySettings = async () => ({});
    await run(s, privateMsg("." + c, { from: "owner" }));
    check(`.${c.split(" ")[0]} accepts OWNER_1`, !refused(s), texts(s));
  }

  section("everyone else is still refused");
  for (const c of COMMANDS) {
    const s = makeSock();
    await run(s, privateMsg("." + c, { from: "stranger" }));
    check(`.${c.split(" ")[0]} refuses a stranger`, refused(s), texts(s));
  }

  section("owner in a group (LID participant)");
  {
    const s = makeSock();
    await run(s, groupMsg(1, ".mode public"));
    check(".mode accepts the owner inside a group", !refused(s), texts(s));
    const t = makeSock();
    await run(t, groupMsg(3, ".mode public"));
    check(".mode refuses a plain member inside a group", refused(t), texts(t));
  }

  section("undeclared scope fails closed");
  {
    const access = require("../src/utils/access");
    const r = await access.check(makeSock(), privateMsg(".x", { from: "stranger" }), { name: "x" }, "x", []);
    check("a command with no scope is refused, not open to everyone", r.ok === false, r);
  }
  done();
})();
