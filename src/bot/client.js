// src/bot/client.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const config = require("../config/config");
const helpers = require("../utils/helpers");
const sessionLoader = require("./sessionLoader");
const { acquireSession } = require("./sessionPrompt");
const botActivity = require("../utils/botActivity");
const identity = require("../utils/identity");

const QR_ENABLED = process.env.ENABLE_QR === "true";
let reconnectAttempts = 0;
let reconnectTimer = null;

/** One reconnect at a time, with a catch: a failed attempt schedules the next one instead of crashing the process. */
function scheduleReconnect(pairingState, handlers, delay) {
  if (reconnectTimer) return; // one is already pending
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await startBot(pairingState, handlers);
    } catch (e) {
      console.error("❌ Reconnect failed:", e.message);
      reconnectAttempts++;
      scheduleReconnect(pairingState, handlers, Math.min(5000 * 2 ** reconnectAttempts, 60000));
    }
  }, delay + Math.random() * 1000);
}

// Suppress annoying libsignal Bad MAC errors during initial sync
const originalConsoleError = console.error;
console.error = function() {
  const arg1 = arguments[0];
  const arg2 = arguments.length > 1 ? arguments[1] : '';
  if (typeof arg1 === 'string' && (arg1.includes('Bad MAC') || arg1.includes('Failed to decrypt'))) return;
  if (typeof arg2 === 'string' && (arg2.includes('Bad MAC') || arg2.includes('Failed to decrypt'))) return;
  originalConsoleError.apply(console, arguments);
};

async function startBot(pairingState, handlers = {}) {
  console.log('🤖 Initializing WhatsApp Bot Client...');

  helpers.ensureDir(config.sessionFolder);

  // ---- Session: SESSION_ID (session-only deployment) ----
  const hasSavedCreds = fs.existsSync(path.join(config.sessionFolder, "creds.json"));
  // Uses SESSION_ID / saved credentials; otherwise asks for the ID in the console.
  const session = await acquireSession(config.sessionFolder, process.env, {
    allowPrompt: !QR_ENABLED && process.env.SESSION_PROMPT !== "false",
    hasSavedCreds
  });

  if (session.status === "loaded") console.log(`📦 SESSION_ID loaded for +${session.phone}.`);
  else if (session.status === "unchanged") console.log(`📦 SESSION_ID unchanged (+${session.phone}) — using saved credentials.`);

  const stop = (lines) => {
    console.error("\n" + lines.map((l) => "❌ " + l).join("\n") + "\n");
    pairingState.sock = null;
    return null; // bot stays idle (web server keeps running) instead of crash-looping against WhatsApp
  };

  if (session.status === "invalid") return stop([`SESSION_ID problem: ${session.message}`, "Fix the SESSION_ID variable and restart."]);
  if (session.status === "dead") return stop([session.message]);
  const nowHasCreds = fs.existsSync(path.join(config.sessionFolder, "creds.json"));
  if (session.status === "missing" && !nowHasCreds && !QR_ENABLED) {
    return stop([
      "No SESSION_ID was provided, so there is nothing to log in with.",
      "Set the SESSION_ID variable, paste it into the console, or put it in a session.txt file next to index.js — then restart.",
      "(For local testing only, ENABLE_QR=true prints a QR code instead.)"
    ]);
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    browser: ["VORTE-PRO", "Chrome", "1.0.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: "silent" })),
    },
    version,
  });

  sock.ev.on("creds.update", saveCreds);

  // Track what the bot itself sends/deletes so AntiDelete/AntiEdit can ignore it (one wrapper, no per-command changes).
  botActivity.install(sock);

  // Group state changed (name, description, open/close, edit-info lock, ephemeral…): drop cached
  // metadata so the next command reads fresh state instead of stale data.
  sock.ev.on("groups.update", (updates) => {
    for (const u of updates || []) identity.invalidate(u.id);
  });

  // Update pairing state reference
  pairingState.sock = sock;

  // Immediately register handlers to avoid missing initial events
  if (handlers.onMessage) {
    sock.ev.on("messages.upsert", (upsert) => {
      Promise.resolve(handlers.onMessage(sock, upsert)).catch((e) => console.error("❌ message handler error:", e));
    });
  }
  if (handlers.onGroupUpdate) {
    sock.ev.on("group-participants.update", (update) => Promise.resolve(handlers.onGroupUpdate(sock, update)).catch((e) => console.error("❌ group update error:", e)));
  }

  if (handlers.onMessageUpdate) {
    sock.ev.on("messages.update", (updates) => Promise.resolve(handlers.onMessageUpdate(sock, updates)).catch((e) => console.error("❌ message update error:", e)));
  }

  if (handlers.onCall) {
    sock.ev.on("call", (calls) => Promise.resolve(handlers.onCall(sock, calls)).catch((e) => console.error("❌ call handler error:", e)));
  }

  // Connection handling
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      pairingState.latestQR = qr;
      if (!QR_ENABLED) {
        console.error("❌ WhatsApp is asking for a new login (QR) — the saved session is not valid. Generate a new SESSION_ID. (Set ENABLE_QR=true to print QR codes.)");
      } else {
        // Render the QR in the terminal (Baileys 7 no longer does this automatically).
        const qrcode = require("qrcode-terminal");
        console.log("\n📷 Scan this QR with WhatsApp → Linked Devices → Link a Device:\n");
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === "close") {
      pairingState.sock = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Connection closed (Code: ${code}).`);

      // Cases where reconnecting is pointless or harmful:
      if (code === DisconnectReason.loggedOut || code === 403) {
        sessionLoader.markDead(config.sessionFolder, process.env.SESSION_ID);
        console.error("❌ WhatsApp logged this session out (or banned it). Generate a NEW SESSION_ID, set it, and restart. Not reconnecting.");
        return;
      }
      if (code === DisconnectReason.connectionReplaced) { // 440
        console.error("❌ This session was opened somewhere else (same SESSION_ID running on another host/instance). Stop the other one — not reconnecting, to avoid a fight.");
        return;
      }
      if (code === DisconnectReason.badSession) { // 500: corrupted local state -> rebuild from SESSION_ID
        console.error("⚠️ Local session state was corrupted — rebuilding from SESSION_ID.");
        sessionLoader.forgetLoaded(config.sessionFolder);
      }

      // Everything else (incl. 515 restart-after-pairing): reconnect with growing delay.
      const delay = code === DisconnectReason.restartRequired ? 1000 : Math.min(5000 * 2 ** reconnectAttempts, 60000);
      reconnectAttempts++;
      console.log(`🔄 Reconnecting in ${Math.round(delay / 1000)}s...`);
      // retire the dead socket so its listeners can never fire again, then reconnect exactly once
      try { sock.ev.removeAllListeners(); sock.end(undefined); } catch { /* already closed */ }
      scheduleReconnect(pairingState, handlers, delay);
    }

    if (connection === "open") {
      const devicePhone = sock.user.id.split(':')[0];
      reconnectAttempts = 0;
      console.log(`✅ Connected successfully as ${devicePhone}`);
      pairingState.latestQR = null;

      // Send startup confirmation to the bot's own number
      const jid = `${devicePhone}@s.whatsapp.net`;
      sock.sendMessage(jid, { 
        text: `🤖 *VORTE-PRO SYSTEM ONLINE*\n\n✅ Successfully securely connected.\n📡 Environment: ${process.env.SESSION_ID ? 'Hosted (SESSION_ID)' : 'Local Storage'}\n⚡ The bot is now actively monitoring events.`
      }).catch(err => console.error("Failed to send startup message:", err));
    }
  });

  return sock;
}

module.exports = { startBot };
