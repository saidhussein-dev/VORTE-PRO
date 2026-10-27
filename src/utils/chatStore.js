// src/utils/chatStore.js
// Baileys (v6+) no longer ships a built-in chat store, so broadcast.js had
// nothing to read from. This tracks every chat JID the bot sees a message
// from/in, persisted to disk so it survives restarts.
// The list is loaded ONCE into a Set and written back (debounced, atomically) only when a NEW chat appears —
// no disk read or parse on the message hot path.
const fs = require('fs');
const path = require('path');

const CHATS_FILE = path.join(__dirname, '../../storage/knownChats.json');
const WRITE_DELAY_MS = 3000;

let chats = null;      // Set of chat JIDs
let timer = null;
let dirty = false;

function load() {
  if (chats) return chats;
  chats = new Set();
  try {
    const data = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
    if (Array.isArray(data)) for (const j of data) if (typeof j === 'string') chats.add(j);
  } catch { /* first run, or an unreadable file: start empty */ }
  return chats;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!dirty || !chats) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(CHATS_FILE), { recursive: true });
    const tmp = CHATS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...chats], null, 2));
    fs.renameSync(tmp, CHATS_FILE);
  } catch (e) { console.error('⚠️ could not save known chats:', e.message); }
}

/** Status updates and channels are not chats a broadcast should ever go to. */
const isTrackable = (jid) => !!jid && jid !== 'status@broadcast' && !jid.endsWith('@broadcast') && !jid.endsWith('@newsletter');

function getKnownChats() {
  return [...load()];
}

function trackChat(jid) {
  if (!isTrackable(jid)) return;
  const set = load();
  if (set.has(jid)) return;
  set.add(jid);
  dirty = true;
  if (!timer) { timer = setTimeout(flush, WRITE_DELAY_MS); if (timer.unref) timer.unref(); }
}

process.on('exit', flush);

module.exports = { getKnownChats, trackChat };
