// src/commands/joinrequests.js
// Join-request workflow for groups with "approve new members" on:
//   .requests | .accept <n> | .reject <n> | .acceptall | .rejectall
const helpers = require("../utils/helpers");
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 JOIN REQUESTS";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Phone digits of a pending request entry (v7 gives a LID jid plus phone_number). */
function numberOf(p) {
  const raw = p.phone_number || p.phoneNumber;
  if (raw) return groupOps.digits(raw);
  const pn = identity.toPn(p.jid || p.id);
  return pn || groupOps.digits(p.jid || p.id);
}

module.exports = {
  name: "requests",
  aliases: ["accept", "reject", "acceptall", "rejectall"],
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Manage pending join requests (admin only): .requests | .accept <n> | .reject <n> | .acceptall | .rejectall",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const cmd = helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase();

    let pending;
    try {
      const list = await sock.groupRequestParticipantsList(chat);
      pending = (list || []).map((p) => ({ jid: p.jid || p.id, number: numberOf(p) })).filter((p) => p.jid);
    } catch (err) {
      return sock.sendMessage(chat, { text: panel(TITLE, [`❌ I couldn't fetch join requests: ${groupOps.errorReason(err)}.`, "(Is 'approve new members' turned on for this group?)"]) });
    }

    if (cmd === "requests") {
      if (!pending.length) return sock.sendMessage(chat, { text: panel(TITLE, ["ℹ️ No pending join requests."]) });
      return sock.sendMessage(chat, { text: panel(`${TITLE} (${pending.length})`, [...pending.map((p, i) => `${i + 1}. +${p.number}`), "", "Use .accept <number> / .reject <number> / .acceptall / .rejectall"]) });
    }

    const action = cmd.startsWith("accept") ? "approve" : "reject";
    let targets;
    if (cmd === "acceptall" || cmd === "rejectall") {
      targets = pending;
    } else {
      const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      const wanted = groupOps.digits(mentioned || args[0] || "");
      if (!wanted) return sock.sendMessage(chat, { text: panel(TITLE, [`Usage: .${cmd} <number>`]) });
      targets = pending.filter((p) => p.number === wanted);
      if (!targets.length) return sock.sendMessage(chat, { text: panel(TITLE, [`ℹ️ +${wanted} has no pending request.`]) });
    }
    if (!targets.length) return sock.sendMessage(chat, { text: panel(TITLE, ["ℹ️ No pending join requests."]) });

    let results;
    try {
      results = await sock.groupRequestParticipantsUpdate(chat, targets.map((t) => t.jid), action);
    } catch (err) {
      return sock.sendMessage(chat, { text: panel(TITLE, [`❌ I couldn't process the requests: ${groupOps.errorReason(err)}.`]) });
    }
    identity.invalidate(chat);
    await sleep(300);

    // truth = what is still pending now
    let stillPending = new Set();
    try { stillPending = new Set(((await sock.groupRequestParticipantsList(chat)) || []).map((p) => p.jid || p.id)); } catch { /* fall back to statuses */ }
    const statusOf = (jid) => String((Array.isArray(results) ? results.find((r) => r?.jid === jid) : null)?.status ?? "");
    const done = targets.filter((t) => !stillPending.has(t.jid) && (statusOf(t.jid) === "" || statusOf(t.jid) === "200"));
    const failed = targets.filter((t) => !done.includes(t));
    const verb = action === "approve" ? "Approved" : "Rejected";
    const lines = [];
    if (done.length) lines.push(`✅ ${verb} ${done.length} request(s).`);
    if (failed.length) lines.push(`⚠️ ${failed.length} request(s) could not be ${action === "approve" ? "approved" : "rejected"}: ${failed.slice(0, 5).map((f) => "+" + f.number).join(", ")}`);
    await sock.sendMessage(chat, { text: panel(TITLE, lines) });
  }
};
