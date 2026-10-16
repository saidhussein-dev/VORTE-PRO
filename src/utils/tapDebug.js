// src/utils/tapDebug.js — a switchable recorder for "why doesn't the button / poll tap reach the bot?".
//
// No environment variable needed: the OWNER switches it with the .debugtaps command and the recording is a plain file,
// storage/debug/taps.log, which `.debugtaps send` delivers into the chat as a document.
//
// What is recorded (only while switched on):
//   - for every incoming delivery: its type (notify / append), whether it came from the bot's own account, what KIND of chat
//     it is, and the TYPES of content inside (e.g. interactiveResponseMessage). Ordinary text is never recorded, only
//     that it was text.
//   - for a button / list / poll reply: the reply itself (ids and labels of OUR menu, no personal content).
//   - NOTE lines from the menu and the handler (which menu form was sent; which tap became which command).
const fs = require("fs");
const path = require("path");
const baileys = require("baileys");

const DIR = process.env.TAPDEBUG_DIR || path.join(__dirname, "../../storage/debug");
const FILE = path.join(DIR, "taps.log");
const FLAG = path.join(DIR, "enabled");
const MAX_BYTES = 400 * 1024; // the file never grows past this: the oldest half is dropped

let on = false;
try { on = fs.existsSync(FLAG); } catch { /* off */ }

const enabled = () => on;

function setEnabled(value) {
  on = !!value;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    if (on) fs.writeFileSync(FLAG, "1"); else fs.rmSync(FLAG, { force: true });
  } catch (e) { console.error("⚠️ tapDebug: couldn't save the switch:", e.message); }
}

function write(line) {
  if (!on) return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(FILE, `${new Date().toISOString()} ${line}\n`);
    if (fs.statSync(FILE).size > MAX_BYTES) {
      const text = fs.readFileSync(FILE, "utf8");
      fs.writeFileSync(FILE, text.slice(Math.floor(text.length / 2)).replace(/^[^\n]*\n/, ""));
    }
  } catch { /* debugging must never break the bot */ }
}

/** A free-text line from the menu / handler. */
const note = (text) => write(`NOTE ${text}`);

const REPLY_KEYS = ["interactiveResponseMessage", "buttonsResponseMessage", "listResponseMessage", "templateButtonReplyMessage", "pollUpdateMessage"];
const chatKind = (jid) => { const j = String(jid || ""); return j.endsWith("@g.us") ? "group" : j === "status@broadcast" ? "status" : j.endsWith("@newsletter") || j.endsWith("@broadcast") ? "other" : "private"; };

/** Record one delivery from messages.upsert (every message in it). */
function recordUpsert(upsert) {
  if (!on) return;
  try {
    for (const m of upsert?.messages || []) {
      let msg = m?.message;
      try { msg = baileys.normalizeMessageContent(msg) || msg; } catch { /* as is */ }
      const keys = Object.keys(msg || {}).filter((k) => k !== "messageContextInfo");
      const reply = REPLY_KEYS.find((k) => msg?.[k]);
      let line = `upsert type=${upsert.type} fromMe=${!!m?.key?.fromMe} chat=${chatKind(m?.key?.remoteJid)} id=${String(m?.key?.id || "").slice(0, 10)} ts=${m?.messageTimestamp ?? "-"} content=[${keys.join(",") || (m?.messageStubType ? "stub:" + m.messageStubType : "empty")}]`;
      if (reply) line += ` REPLY(${reply})=${JSON.stringify(msg[reply], (k, v) => (v && v.type === "Buffer" ? "<bytes>" : v))}`;
      write(line);
    }
  } catch { /* never break the bot */ }
}

const read = () => { try { return fs.readFileSync(FILE, "utf8"); } catch { return ""; } };
const clear = () => { try { fs.rmSync(FILE, { force: true }); } catch { /* ignore */ } };
const size = () => { try { return fs.statSync(FILE).size; } catch { return 0; } };

module.exports = { enabled, setEnabled, note, recordUpsert, read, clear, size, FILE };
