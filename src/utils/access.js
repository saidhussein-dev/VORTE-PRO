// src/utils/access.js
// Central scope / permission check, run by commandHandler BEFORE a command executes.
//
// A command declares (in its own file):
//   scope:    "PRIVATE" | "GROUP" | "BOTH" | "OWNER"   (OWNER = bot owner only, any chat)
//   admin:    true  -> group admin (or bot owner) required
//   botAdmin: true  -> the BOT must be a group admin
//   owner:    true  -> bot owner required (combine with scope GROUP, e.g. .leave)
//   scopes:   { alias: {scope, admin, botAdmin, owner} }   per-alias overrides
//   getAccess(name, args): optional function returning overrides at runtime (setting.js)
//
// The commands' own internal checks stay as a second line of defence.
const helpers = require("./helpers");
const { MSG } = require("./ui");

const SCOPES = ["PRIVATE", "GROUP", "BOTH", "OWNER"];

function requirementsFor(command, name, args = []) {
  let r = { scope: command.scope, admin: !!command.admin, botAdmin: !!command.botAdmin, owner: !!command.owner };
  if (command.scopes && command.scopes[name]) r = { ...r, ...command.scopes[name] };
  if (typeof command.getAccess === "function") {
    try { r = { ...r, ...(command.getAccess(name, args) || {}) }; } catch { /* keep static */ }
  }
  if (r.scope === "OWNER") r.owner = true;
  return r;
}

/**
 * @returns {Promise<{ok:true}|{ok:false, message:string}>}
 */
async function check(sock, m, command, name, args) {
  const req = requirementsFor(command, name, args);
  const chat = m.key.remoteJid;
  const group = !!helpers.isGroup(chat);

  // A command that does not declare a valid scope is refused (fail closed) instead of being open to everyone.
  if (!SCOPES.includes(req.scope)) return { ok: false, message: MSG.ownerOnly };

  if (req.scope === "GROUP" && !group) return { ok: false, message: MSG.groupOnly };
  if (req.scope === "PRIVATE" && group) return { ok: false, message: MSG.privateOnly };

  const needsPerms = req.owner || req.admin || req.botAdmin;
  if (!needsPerms) return { ok: true };

  const perms = await helpers.getPermissions(sock, m);

  if (req.owner && !perms.isOwner) return { ok: false, message: MSG.ownerOnly };
  if (req.admin && group && !perms.isOwner && !perms.isAdmin) return { ok: false, message: MSG.adminOnly };
  if (req.botAdmin && group && !perms.isBotAdmin) return { ok: false, message: MSG.botNotAdmin };
  return { ok: true };
}

module.exports = { check, requirementsFor, SCOPES };
