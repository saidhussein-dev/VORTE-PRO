// src/index.js
const fs = require('fs');
const path = require('path');
const config = require('./config/config');
const helpers = require('./utils/helpers');
const setupServer = require('./server/server');
const { startBot } = require('./bot/client');
const { handleMessage } = require('./bot/events/messageHandler');
const { handleGroupUpdate } = require('./bot/events/groupHandler');
const { handleMessageUpdate } = require('./bot/events/editHandler');
const { handleCall } = require('./bot/events/callHandler');

// A crash-proof process: one rejected promise or stray exception must never take the whole bot down.
process.on('unhandledRejection', (reason) => console.error('⚠️ Unhandled rejection:', reason));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught exception:', err));

async function main() {
  console.log('🚀 Starting VORTE PRO WhatsApp Bot (Modular Implementation)...');

  // 1. Ensure storage exists
  helpers.ensureDir(path.dirname(config.settingsPath));
  // One-time migration: older versions stored settings in groupSettings.json.
  const legacySettingsPath = path.join(path.dirname(config.settingsPath), 'groupSettings.json');
  if (!fs.existsSync(config.settingsPath) && fs.existsSync(legacySettingsPath)) {
    fs.copyFileSync(legacySettingsPath, config.settingsPath); // copy, not move: keeps a backup
    console.log('📦 Migrated legacy groupSettings.json -> settings.json');
  }
  if (!fs.existsSync(config.settingsPath)) {
    fs.writeFileSync(config.settingsPath, JSON.stringify({}, null, 2));
  }

  // 2. Settings management functions
  // Cached text + ATOMIC writes (temp file, then rename): a kill in the middle of a save can never leave half a file,
  // and the file is not re-read from disk on every message. A .bak of the last good copy is kept as a safety net.
  const bakPath = config.settingsPath + '.bak';
  let raw = null;        // text currently in memory
  let lastGood = null;   // last text that parsed correctly
  let lastWrite = 0;
  const getSettings = () => {
    try {
      if (raw === null) raw = fs.readFileSync(config.settingsPath, 'utf8');
      const parsed = JSON.parse(raw);
      lastGood = raw;
      return parsed;
    } catch (e) {
      console.error('⚠️ settings.json is unreadable (' + e.message + ') — falling back to the last good copy.');
      raw = null;
      try { const b = fs.readFileSync(bakPath, 'utf8'); const parsed = JSON.parse(b); raw = b; return parsed; } catch { raw = '{}'; return {}; }
    }
  };
  const saveSettings = (data) => {
    const text = JSON.stringify(data, null, 2);
    const tmp = config.settingsPath + '.tmp';
    if (lastGood) { try { fs.writeFileSync(bakPath, lastGood); } catch { /* backup is best effort */ } }
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, config.settingsPath);
    raw = text; lastGood = text; lastWrite = Date.now();
  };
  // If someone edits storage/settings.json by hand (panel file manager), pick the change up without a restart.
  try { fs.watchFile(config.settingsPath, { interval: 5000, persistent: false }, () => { if (Date.now() - lastWrite > 6000) raw = null; }); } catch { /* optional */ }

  // 2b. Upgrade stored settings to the scoped formats (idempotent)
  try {
    const st = getSettings();
    if (require('./utils/settingsMigrate').migrate(st)) {
      saveSettings(st);
      console.log('📦 Settings upgraded to the scoped automation/antidelete format');
    }
  } catch (e) { console.error('⚠️ Settings migration skipped:', e.message); }

  // 2c. One stats line a minute (kept short) so a crash can be diagnosed from the last log lines.
  if (process.env.BOT_STATS_LOG !== 'false') {
    setInterval(() => {
      const m = process.memoryUsage();
      console.log(`[stats] rss=${(m.rss / 1e6) | 0}MB heap=${(m.heapUsed / 1e6) | 0}MB ext=${(m.external / 1e6) | 0}MB up=${process.uptime() | 0}s`);
    }, 60000).unref();
  }

  // 3. Setup Web Server
  const { pairingState } = setupServer();

  // 4. Start WhatsApp Bot with handlers (unless Render is hosting as a generator purely)
  if (process.env.SESSION_GENERATOR_ONLY === 'true') {
    console.log('🛑 SESSION_GENERATOR_ONLY is true. The main bot logic will NOT be started.');
    console.log('✅ Ready to serve standalone pairing requests on the web server.');
  } else {
    const sock = await startBot(pairingState, {
      onMessage: (sock, upsert) => handleMessage(sock, upsert, getSettings, saveSettings),
      onGroupUpdate: (sock, update) => handleGroupUpdate(sock, update, getSettings),
      onMessageUpdate: (sock, updates) => handleMessageUpdate(sock, updates, getSettings),
      onCall: (sock, calls) => handleCall(sock, calls, getSettings)
    });
  
    console.log('✅ Bot initialization complete. Monitoring events...');

    // Get the download tools ready in the background (yt-dlp binary, ffmpeg) so the first user doesn't wait for them.
    if (process.env.DOWNLOAD_PREWARM !== 'false') {
      const warm = setTimeout(() => {
        const dl = require('./services/downloaders/ytdlp');
        const ff = require('./services/downloaders/ffmpegCheck');
        Promise.allSettled([dl.ensureBinary(), ff.ensureFfmpeg()]).catch(() => {});
      }, 4000);
      if (warm.unref) warm.unref();
    }
  }
}

main().catch(err => {
  console.error('💥 Critical error during startup:', err);
  process.exit(1);
});
