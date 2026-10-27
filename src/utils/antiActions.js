// src/utils/antiActions.js
// ONE enforcement engine for every anti feature (antilink / antispam / antimention /
// antibug / antibot): action modes WARN | DELETE | REMOVE, per-group + per-user +
// per-feature persistent warning counters, and honest bot-admin handling.
const helpers = require("./helpers");
const identity = require("./identity");
const groupOps = require("./groupOps");
const { MSG } = require("./ui");

const FEATURES = {
  antilink: { label: "ANTILINK", rule: "AntiLink" },
  antispam: { label: "ANTISPAM", rule: "AntiSpam" },
  antimention: { label: "ANTIMENTION", rule: "AntiMention" },
  antibug: { label: "ANTIBUG", rule: "AntiBug" },
  antibot: { label: "ANTIBOT", rule: "AntiBot", defaultAction: "remove" } // legacy behaviour: flagged bots were removed
};
const ACTIONS = ["warn", "delete", "remove"];
const ACTION_LABEL = { warn: "⚠️ WARN", delete: "🗑️ DELETE", remove: "🚫 REMOVE" };
const WARN_LIMIT = 3;

const noticeSeen = new Map();
const NOTICE_EVERY_MS = 10 * 60 * 1000;

function getConfig(settings, chat, feature) {
  const cs = settings?.[chat] || {};
  const action = ACTIONS.includes(cs.antiActions?.[feature]) ? cs.antiActions[feature] : (FEATURES[feature]?.defaultAction || "warn");
  return { enabled: !!cs[feature], action };
}

/** Enable/disable and/or set the action. `arg`: on | off | warn | delete | remove */
function applyArg(settings, chat, feature, arg) {
  const a = String(arg || "").toLowerCase();
  settings[chat] = settings[chat] || {};
  const cs = settings[chat];
  if (a === "on") cs[feature] = true;
  else if (a === "off") cs[feature] = false;
  else if (ACTIONS.includes(a)) { cs[feature] = true; cs.antiActions = cs.antiActions || {}; cs.antiActions[feature] = a; }
  else return null;
  return getConfig(settings, chat, feature);
}

function describe(feature, cfg) {
  const f = FEATURES[feature];
  const lines = [`🛡️ ${f.label}`, "", `Status: ${cfg.enabled ? "✅ ON" : "❌ OFF"}`, `Action: ${ACTION_LABEL[cfg.action]}`];
  if (cfg.action === "warn") lines.push(`Warning limit: ${WARN_LIMIT}`);
  return lines.join("\n");
}

/** Stable per-person key so a LID and a phone JID share one warning counter. */
function personKey(jid) {
  const pn = identity.toPn(jid);
  return pn ? `pn:${pn}` : (identity.keysOf(jid)[0] || String(jid));
}

const getWarnings = (settings, chat, feature, jid) => settings?.[chat]?.antiWarnings?.[feature]?.[personKey(jid)] || 0;

function setWarnings(settings, chat, feature, jid, n) {
  settings[chat] = settings[chat] || {};
  const cs = settings[chat];
  cs.antiWarnings = cs.antiWarnings || {};
  cs.antiWarnings[feature] = cs.antiWarnings[feature] || {};
  if (n > 0) cs.antiWarnings[feature][personKey(jid)] = n;
  else delete cs.antiWarnings[feature][personKey(jid)];
}

async function tryDelete(sock, m) {
  try { await sock.sendMessage(m.key.remoteJid, { delete: m.key }); return true; }
  catch (e) { console.error("❌ anti: delete failed:", e.message); return false; }
}

/**
 * Enforce `feature` against `sender` for message `m`.
 * Callers have already decided the message violates the rule and that the sender is
 * not an admin/owner.
 * @returns {Promise<{handled:boolean, reason?:string}>}
 */
async function enforce(sock, { chat, sender, m, feature, settings, saveSettings, detail }) {
  const f = FEATURES[feature];
  const { action } = getConfig(settings, chat, feature);
  const tag = groupOps.mentionText(sender);

  // 10) Bot-admin safety: never pretend. Tell the group (rarely) and stop.
  if (!(await helpers.isBotAdmin(sock, chat))) {
    const k = chat + ":" + feature;
    if (Date.now() - (noticeSeen.get(k) || 0) > NOTICE_EVERY_MS) {
      noticeSeen.set(k, Date.now());
      while (noticeSeen.size > 2000) noticeSeen.delete(noticeSeen.keys().next().value);
      await sock.sendMessage(chat, { text: `${MSG.botNotAdmin}\n(${f.rule} is on, but I can't enforce it.)` }).catch(() => {});
    }
    return { handled: false, reason: "bot-not-admin" };
  }

  const deleted = await tryDelete(sock, m);
  const delLine = deleted ? "The message has been deleted." : "I couldn't delete the message.";

  if (action === "delete") {
    await sock.sendMessage(chat, { text: deleted ? "🗑️ Message deleted." : "⚠️ I couldn't delete that message." }).catch(() => {});
    return { handled: true };
  }

  if (action === "remove") {
    const res = await groupOps.participantAction(sock, chat, [sender], "remove");
    const removed = res.ok.length > 0;
    await sock.sendMessage(chat, {
      text: [deleted ? "🚫 Message deleted." : "⚠️ I couldn't delete the message.",
        removed ? "👤 User removed from the group." : `⚠️ I couldn't remove ${tag}: ${res.failed[0]?.reason || "WhatsApp refused"}.`].join("\n"),
      mentions: [sender]
    }).catch(() => {});
    return { handled: true };
  }

  // warn
  const n = getWarnings(settings, chat, feature, sender) + 1;
  if (n < WARN_LIMIT) {
    setWarnings(settings, chat, feature, sender, n);
    saveSettings(settings);
    const body = n === 1
      ? `${tag} Your message violated the ${f.rule} rule.\n${delLine}`
      : `${tag} You have received another warning.\n${WARN_LIMIT - n} warning${WARN_LIMIT - n === 1 ? "" : "s"} remaining before removal.\n${delLine}`;
    await sock.sendMessage(chat, { text: `⚠️ WARNING ${n}/${WARN_LIMIT}\n\n${body}`, mentions: [sender] }).catch(() => {});
    return { handled: true };
  }

  const res = await groupOps.participantAction(sock, chat, [sender], "remove");
  if (res.ok.length) {
    setWarnings(settings, chat, feature, sender, 0); // removed -> clean slate if they ever rejoin
    saveSettings(settings);
    await sock.sendMessage(chat, {
      text: `🚫 WARNING ${WARN_LIMIT}/${WARN_LIMIT}\n\n${tag} has reached the warning limit.\n${deleted ? "The violating message was deleted and the user has been removed." : "The user has been removed (I couldn't delete the message)."}`,
      mentions: [sender]
    }).catch(() => {});
  } else {
    setWarnings(settings, chat, feature, sender, WARN_LIMIT); // stays at the limit; next violation retries
    saveSettings(settings);
    await sock.sendMessage(chat, {
      text: `🚫 WARNING ${WARN_LIMIT}/${WARN_LIMIT}\n\n${tag} has reached the warning limit, but I couldn't remove them: ${res.failed[0]?.reason || "WhatsApp refused"}.`,
      mentions: [sender]
    }).catch(() => {});
  }
  return { handled: true };
}

module.exports = { FEATURES, ACTIONS, ACTION_LABEL, WARN_LIMIT, getConfig, applyArg, describe, getWarnings, setWarnings, personKey, enforce };
