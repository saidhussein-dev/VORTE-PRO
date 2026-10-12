# 🚀 VORTE-PRO Deployment Guide

This guide will walk you through the process of deploying your VORTE-PRO WhatsApp bot to various platforms.

---

## ⚠️ Important: ephemeral storage

Most free/low-cost hosts (Heroku, Railway free tier, most "panel" hosts) wipe the filesystem on every restart/redeploy. This bot already handles the WhatsApp **session** correctly for that (via `SESSION_ID`, generated from the pairing site — no local file needed).

However, the **menu picture/video** set via `.setmenudisplay` is saved locally to `storage/menu/` and is **not** covered by `SESSION_ID`. On an ephemeral host, you'll need to re-run `.setmenudisplay` after each redeploy/restart. If your host offers a persistent volume/disk, mount it at `storage/` to avoid this.

---

## 🔐 Authentication (SESSION_ID)

VORTE PRO is self-hosted: **each installation owns its own WhatsApp session**. Nothing is sent to a central server.

**SESSION_ID (the supported way to deploy):** open the official VORTE PRO Session ID Generator website, pair your number with the pairing code, copy the whole `VORTE_PRO~...` value it gives you, and set it as the `SESSION_ID` environment variable. The bot loads it and connects — no QR needed. The bot never generates Session IDs itself.

How the bot treats it:
- The value is validated on start (it must decode to real, fully-paired WhatsApp credentials). Quotes and line breaks added by copy/paste are tolerated; a cut or altered ID gets a clear error instead of a silent QR loop.
- **No SESSION_ID? Paste it in the console.** If `SESSION_ID` is missing, invalid, or logged out, the bot asks you to paste it into the console (panel console, SSH or terminal) and starts as soon as it's valid. A paste that the console cuts into several lines is stitched together; type `reset` to start over. **If your host's console can't send input to the bot** (the bot prints "This host does not pass console input"), create a file named `session.txt` next to `index.js` in the host's file manager, paste the `SESSION_ID` into it and save: the bot checks every few seconds, starts as soon as it is valid, and deletes the file after reading it (the session is kept as credentials). The pasted ID is saved as credentials, so restarts on a persistent disk don't ask again.  Set `SESSION_PROMPT=false` to disable the prompt. Note the console shows what you paste; treat the panel's console like a password field.
- `ENABLE_QR=true` re-enables the terminal QR for local testing only.
- Using the **same** `SESSION_ID` again after a restart keeps the saved (fresher) credentials; supplying a **new** `SESSION_ID` replaces them.
- If WhatsApp logs the session out, the bot stops, prints `Generate a NEW SESSION_ID`, and will not retry that dead ID on restart (so a crash-restarting panel doesn't hammer WhatsApp).
- **One session = one running bot.** If the same `SESSION_ID` is running on two hosts (e.g. an old Render service and a new panel) WhatsApp disconnects one with code 440; the bot stops instead of fighting. Stop the other deployment.
- On hosts that wipe the disk on restart, the bot logs in from `SESSION_ID` each time. Some chat encryption state is rebuilt on demand, so an occasional first message after a restart may need to be resent. Mount a persistent disk at `storage/` (or set `SESSION_FOLDER`) to avoid that.

### Security switches (both default to OFF)
| Variable | Effect |
|---|---|
| `ENABLE_EVAL=true` | Enables the owner-only `.sudo` code-execution command. It can read your API keys and session — only enable it if you understand the risk. |
| `ENABLE_QR_PAGE=true` | Serves the login QR at `/qr` over HTTP. A browser-visible login QR is effectively a credential; prefer the terminal QR. |

### Pairing-site deployment
`SESSION_GENERATOR_ONLY=true` (as set in `render.yaml`) turns a deployment into the Session ID Generator website only. **Never set it on a normal bot deployment.**

---

## 🐳 Docker-based panels (Pterodactyl, Katabump, Railway, generic VPS panels) <a name="docker"></a>

A `Dockerfile` is included. Any panel that supports "deploy from Dockerfile" or "Docker image" will work:

1. Point the panel at this repo (or upload the zip).
2. Set your environment variables in the panel's env/variables section — see `.env.example` for the full list.
3. The panel should auto-detect the `Dockerfile` and build/run it. If it asks for a start command anyway, use `node index.js`.
4. Make sure the panel exposes/forwards port `3000` (or set `PORT` to whatever the panel requires).

---

## 🟣 Heroku <a name="heroku"></a>

Heroku is a popular cloud platform that makes it easy to deploy Node.js applications.

### Prerequisites
- A [Heroku account](https://signup.heroku.com/).
- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed (optional but recommended).

### Steps
1. **GitHub Link**: Push your bot code to a private GitHub repository.
2. **Create App**: Go to the Heroku Dashboard and create a new app — or use the included `app.json` for a one-click "Deploy to Heroku" button (update the `repository` field in `app.json` to point at your repo first).
3. **Connect GitHub**: In the "Deploy" tab, connect your GitHub repository.
4. **Config Vars**: Go to the "Settings" tab and click "Reveal Config Vars". Add all variables listed in `.env.example` (at minimum: `OWNER_1`, `SESSION_ID`).
5. **Deploy**: Go back to the "Deploy" tab and click "Deploy Branch".
6. **Worker**: (Important) Once deployed, go to the "Resources" tab and ensure the `web` dyno is turned ON.

---

## 🌐 Render <a name="render"></a>

1. Create a new **Web Service** on [Render](https://render.com), pointed at your repo.
2. Build command: `npm install`. Start command: `npm start` (or `node index.js`).
3. Add your environment variables (same list as `.env.example`) under the service's **Environment** tab.
4. Render's free tier also wipes disk on redeploy — see the ephemeral storage note above.

*Note: this is separate from the pairing site (`vorte-pro-pairing.onrender.com`), which is its own Render deployment and isn't affected by anything here.*

---

## ⚡ Katabump <a name="katabump"></a>

Katabump is a specialized hosting service for Discord and WhatsApp bots.

### Steps
1. **Register**: Sign up at [Katabump](https://katabump.com/).
2. **Create Server**: Create a new Node.js (or Docker) server.
3. **Upload Files**: You can either link your GitHub or upload your files as a ZIP (excluding `node_modules`).
4. **Environment Variables**: Add your `.env` variables in the Katabump panel.
5. **Start**: The platform will automatically run `npm install` and `npm start`.

---

## 🖥️ VPS (Ubuntu/Linux) <a name="vps"></a>

For users who want full control and better performance.

### Prerequisites
- A VPS running Ubuntu 20.04+ (DigitalOcean, AWS, Google Cloud, etc.).
- [Node.js](https://nodejs.org/) installed.
- [PM2](https://pm2.keymetrics.io/) installed.

### Steps
1. **Connect**: SSH into your VPS.
2. **Clone**: 
   ```bash
   git clone https://github.com/your-username/VORTE-PRO.git
   cd VORTE-PRO
   ```
3. **Install**:
   ```bash
   npm install
   ```
4. **Configure**:
   ```bash
   cp .env.example .env
   nano .env # Fill in your details
   ```
5. **Run with PM2**:
   ```bash
   pm2 start index.js --name "vorte-pro"
   pm2 save
   pm2 startup
   ```
6. **Monitor**:
   ```bash
   pm2 logs vorte-pro
   ```

---

*Need help? Contact the developers or check the [GitHub Issues](https://github.com/your-username/VORTE-PRO/issues).*


## 🌐 Session ID site (pairing page)

- **Wrong code?** A new code for the same number can be requested at any time (short pause between requests, `PAIRING_COOLDOWN_MS`). An unfinished pairing expires after `PAIRING_EXPIRE_MS` (default 10 min) and is counted as failed.
- **Real counters** (visitors, successful / failed generations, uptime) are counted on the server and saved to `storage/site-stats.json`. Hosts that wipe the disk on redeploy start from zero again.
- **Bot download button:** upload your ZIP as `files/VORTE-PRO.zip` (see `files/README.md`), or set `BOT_DOWNLOAD_URL` to a link. Never include `.env`, `session.txt`, or `storage/session` in that ZIP.

## 🔣 Prefix

One `PREFIX` setting, same rules as Queen Anita v4:

- `PREFIX=.` — only `.` works (the default).
- `PREFIX=.!*` — each of `.` `!` `*` works.
- `PREFIX=all` — any symbol works, and so does no prefix at all (only real command names react, so ordinary chat is ignored).

The owner can change it live: `.prefix !`, `.prefix .!*`, `.prefix all`, and undo it with `.prefix reset`. That last one **always** works, whatever the current prefix, so you can't lock yourself out. Menus and usage messages show the real prefix. To keep the old behaviour (`. ! ? $ % & *` all working) set `PREFIX=.!?$%&*`.
