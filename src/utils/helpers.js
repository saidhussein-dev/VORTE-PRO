// src/utils/helpers.js
const fs = require('fs');
const config = require('../config/config');
const path = require('path');
const sudoStore = require('./sudoStore');
const identity = require('./identity');

/**
 * Check if a JID is a group
 * @param {string} jid 
 * @returns {boolean}
 */
function isGroup(jid) {
  return jid && jid.endsWith("@g.us");
}

/**
 * Convert JID to simple number
 * @param {string} jid 
 * @returns {string}
 */
function jidToNumber(jid) {
  return jid ? jid.split("@")[0] : jid;
}

/**
 * Format current time
 * @returns {string}
 */
function formatTime() {
  return new Date().toLocaleTimeString();
}

/**
 * Format Tic-Tac-Toe board
 * @param {Array} board 
 * @returns {string}
 */
function tttBoardToText(board) {
  let b = board.map((c, i) => c || (i + 1)).map(c => ` ${c} `);
  return `${b[0]}|${b[1]}|${b[2]}\n───┼───┼───\n${b[3]}|${b[4]}|${b[5]}\n───┼───┼───\n${b[6]}|${b[7]}|${b[8]}`;
}

/**
 * Ensure directory exists
 * @param {string} dir 
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Normalize any WhatsApp JID format down to its bare digit string, so JIDs
 * from different sources (message sender vs group metadata) can be reliably
 * compared even when WhatsApp reports them in different formats
 * (@s.whatsapp.net vs @lid, with/without a :device suffix).
 * @param {string} jid
 * @returns {string}
 */
function normalizeJid(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

/**
 * Check if a JID is an owner
 * @param {string} jid 
 * @returns {boolean}
 */
function isTrueOwner(jid) {
  if (!jid) return false;
  // A @lid sender is mapped back to its phone number (learned per message by
  // identity.resolveSender); plain phone JIDs / digit strings behave as before.
  const num = identity.keyOf(jid) ? (identity.toPn(jid) || '') : normalizeJid(jid);
  if (!num) return false;
  const owners = [config.owner1, config.owner2, ...(config.sudo || [])].filter(Boolean);
  return owners.some(o => num === normalizeJid(o));
}

/**
 * Owner-level check: env-configured owners OR anyone on the persisted sudo list.
 * Use isTrueOwner() instead for actions sudo users must NOT be able to perform
 * (managing the sudo list itself, eval).
 * @param {string} jid
 * @returns {boolean}
 */
function isOwner(jid) {
  if (!jid) return false;
  if (isTrueOwner(jid)) return true;
  const num = identity.keyOf(jid) ? (identity.toPn(jid) || '') : normalizeJid(jid);
  if (!num) return false;
  return sudoStore.list().some(n => n === num);
}

/**
 * Check if a JID is an admin (or superadmin) in a group.
 * Compares normalized phone numbers rather than raw JID strings, since
 * WhatsApp/Baileys can report the same participant under different JID
 * formats (@lid vs @s.whatsapp.net) between group metadata and message events.
 * @param {object} sock
 * @param {string} chat
 * @param {string} user
 * @returns {Promise<boolean>}
 */
async function isAdmin(sock, chat, user) {
  return identity.isGroupAdmin(sock, chat, user);
}

/**
 * Check if the bot is an admin in a group (matches the bot's phone JID AND its LID).
 * @param {object} sock
 * @param {string} chat
 * @returns {Promise<boolean>}
 */
async function isBotAdmin(sock, chat) {
  return identity.isBotGroupAdmin(sock, chat);
}

/**
 * Central permission lookup for one message. Use this instead of re-deriving
 * owner/admin/bot-admin inside commands.
 * @returns {Promise<{chat:string, sender:string, isGroup:boolean, isOwner:boolean, isAdmin:boolean, isBotAdmin:boolean}>}
 */
async function getPermissions(sock, m) {
  const chat = m.key.remoteJid;
  const sender = m.key.participant || m.key.remoteJid;
  await identity.resolveSender(sock, m);
  const group = isGroup(chat);
  const owner = isOwner(sender) || !!m.key?.fromMe;
  const ids = [sender, m.key.participantAlt].filter(Boolean);
  return {
    chat, sender, isGroup: !!group, isOwner: owner,
    isAdmin: group ? await identity.isGroupAdmin(sock, chat, ids) : false,
    isBotAdmin: group ? await identity.isBotGroupAdmin(sock, chat) : false
  };
}

/**
 * Reliably extract the text body of a message. Baileys messages do not have
 * a top-level `m.body` — that was a bug present in several command files
 * (fun.js, hangman.js, quiz.js, tools.js, imageai.js), silently breaking
 * every command in each of those files. Always use this instead.
 * @param {object} m
 * @returns {string}
 */
function getBody(m) {
  return (
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    ""
  );
}

/**
 * The ONE owner check for commands: learns the LID <-> phone mapping for this sender first, then accepts
 * the configured owners, sudo users, and the paired number itself (messages the linked account sends).
 */
async function senderIsOwner(sock, m) {
  const perms = await getPermissions(sock, m);
  return !!perms.isOwner;
}

/** Same, but for actions sudo users must NOT be able to do (sudo list, eval, update): OWNER_1/OWNER_2 or the paired number. */
async function senderIsTrueOwner(sock, m) {
  try { await identity.resolveSender(sock, m); } catch { /* fall through to what is already known */ }
  const sender = m.key.participant || m.key.remoteJid;
  return !!m.key?.fromMe || isTrueOwner(sender);
}

module.exports = {
  senderIsOwner,
  senderIsTrueOwner,
  isTrueOwner,
  isGroup,
  jidToNumber,
  normalizeJid,
  formatTime,
  tttBoardToText,
  ensureDir,
  isOwner,
  isAdmin,
  isBotAdmin,
  getPermissions,
  getBody
};
