// src/commands/kickall.js — remove every non-admin member (never the bot, an admin, or my owner).
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const { panel, status } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";
const CHUNK = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: "kickall",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Remove all non-admin members from the group",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    const meta = await identity.getMetadata(sock, chat, { force: true });
    const candidates = (meta.participants || []).filter((p) => !p.admin).map((p) => p.id);
    const { allowed } = groupOps.protect(sock, meta, candidates, "remove");
    if (!allowed.length) return sock.sendMessage(chat, { text: panel(TITLE, ["ℹ️ No non-admin members to remove."]) });

    const s = await status(sock, chat, panel(TITLE, [`⚙️ Removing ${allowed.length} member(s)...`]));
    let removed = 0; const failed = [];
    for (let i = 0; i < allowed.length; i += CHUNK) {
      const res = await groupOps.participantAction(sock, chat, allowed.slice(i, i + CHUNK), "remove", { verify: true });
      removed += res.ok.length; failed.push(...res.failed);
      if (i + CHUNK < allowed.length) await sleep(800); // stay under WhatsApp's rate limit
    }
    const lines = [`✅ Removed ${removed} of ${allowed.length} member(s).`];
    if (failed.length) lines.push(`⚠️ ${failed.length} could not be removed (${[...new Set(failed.map((f) => f.reason))].slice(0, 2).join("; ")}).`);
    await s.finish(panel(TITLE, lines));
  }
};
