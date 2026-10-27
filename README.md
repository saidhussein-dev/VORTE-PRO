<div align="center">

# VORTE PRO

### WhatsApp automation, built to be extended.

A modular WhatsApp bot powered by **Node.js** and **Baileys**, with command handling, group utilities, media tools, session pairing, and configurable automation.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-MIT-64748b.svg)](LICENSE)

[Features](#features) · [Getting Started](#getting-started) · [Configuration](#configuration) · [Commands](#commands) · [Deployment](#deployment)

</div>

---

## Overview

**VORTE PRO** is a modular WhatsApp automation project designed around a maintainable command system and separated bot services. It brings everyday automation, group-management utilities, media workflows, and session management into one Node.js application.

The project is organized so that bot events, command logic, shared utilities, and web-session functionality can be maintained independently instead of turning one entry-point file into an archaeological site.

## Features

### Bot and command system
- **Command-based interaction** with a configurable prefix (default: `.`).
- **Message processing and event handling** through dedicated bot modules.
- **Permission-aware commands** with scope checks for owner, admin, and general-user actions where configured.
- **Connection recovery** for reconnecting after supported connection interruptions.

### Group utilities
- Welcome and group-management features where enabled.
- Admin-scoped moderation commands.
- Group and participant tracking used by supported bot features.

### Media and downloads
- Media-download commands backed by downloader services.
- Concurrency limits to help prevent too many downloads from running at once.
- Shared service and utility modules to keep download logic separate from command handlers.

### AI and image features
- AI-related commands and image-generation support where the required provider configuration is supplied.
- Image-generation rate limiting to help control repeated requests.

### Session pairing and web server
- Web-based phone-number pairing flow.
- Session generation for deployments that use a `SESSION_ID`.
- Optional terminal QR pairing for local development.
- Session validation and a lightweight web endpoint for bot status or pairing workflows, depending on the configured entry point.

### Additional automation
- Anti-delete functionality for supported message types.
- Optional owner-level utilities such as `.sudo` when enabled in configuration.
- Modular services and storage for features that need persistent settings or message-related state.

> **Note:** Available commands and integrations depend on the current code and environment configuration. External services may require API keys, system packages, or additional binaries. Check the relevant command and configuration files before assuming a feature is enabled.

## Architecture

The repository separates application startup, WhatsApp event handling, commands, services, and web-session functionality.

```text
VORTE-PRO/
├── src/
│   ├── index.js                 # Application entry point
│   ├── bot/
│   │   ├── client.js            # WhatsApp client setup
│   │   └── events/
│   │       └── messageHandler.js# Incoming-message processing
│   ├── commands/                # Command handlers
│   ├── services/                # External APIs and media services
│   ├── server/                  # Pairing and web-server functionality
│   ├── config/                  # Configuration
│   └── utils/                   # Shared helpers
├── storage/                     # Runtime data and settings (if configured)
├── index.js                     # Root bootloader
├── session-server.js            # Separate session-server entry point, if used
├── Dockerfile                   # Container deployment
├── DEPLOY.md                    # Deployment instructions
└── README.md
```

Some filenames or directories may differ between revisions. Treat the checked-out repository as the source of truth.

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) **20 or later**
- npm
- A WhatsApp account to link as a linked device
- Git
- Any external API credentials or system dependencies required by the features you intend to use

### 1. Clone the repository

```bash
git clone https://github.com/saidhussein-dev/VORTE-PRO.git
cd VORTE-PRO
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file if the repository includes one:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Open `.env` and configure the values required by your version of VORTE PRO. Never commit `.env`, WhatsApp session credentials, or API keys to Git.

> If your checkout does not contain `.env.example`, inspect the configuration files and deployment guide to identify the environment variables expected by that revision. Do not create random variables and hope the bot develops psychic abilities.

### 4. Start the bot

```bash
npm start
```

The exact startup behavior depends on your configuration. For hosted use, follow the session-pairing flow below. For local testing, use terminal QR pairing only if it is supported and explicitly enabled in your configuration.

## Configuration and Pairing

VORTE PRO supports a web-based pairing flow for environments configured to use a `SESSION_ID`.

### Web pairing

1. Start the application using the command required by your deployment.
2. Open the pairing page at `http://localhost:3000` when the web server is configured to use port `3000`.
3. Enter the WhatsApp phone number with its country code, using digits only if requested by the page.
4. Follow the pairing-code instructions shown in the web interface: WhatsApp → **Linked devices** → **Link with phone number**.
5. If the flow sends a session identifier to WhatsApp, copy it into the server's environment configuration as `SESSION_ID`.
6. Restart the application if your hosting platform does not automatically restart it after environment changes.

The web port and exact flow are configuration-dependent. When deployed, use the public URL and port settings supplied by your host.

### Terminal QR pairing

For local development only, enable the QR option supported by your configuration (the original setup uses `ENABLE_QR=true`) and leave `SESSION_ID` empty. Scan the QR code from WhatsApp's **Linked devices** screen.

Do not expose pairing endpoints publicly without appropriate protections. A session identifier can grant access to your WhatsApp account.

## Commands

The default command prefix is `.`. The following are examples of core commands documented for this project; the full command list depends on the current revision and enabled modules.

| Command | Purpose | Access |
|---|---|---|
| `.menu` | Display the available command menu | General |
| `.ping` | Check bot response / latency | General |
| `.gpt <query>` | Send a prompt to the configured AI integration | Depends on configuration |
| `.tagall` | Mention group participants | Group-admin restricted where configured |

Use `.menu` in a connected chat to view the commands exposed by your running instance. Command names and access requirements may change between versions.

## Deployment

VORTE PRO can be run locally or deployed to a Node.js-compatible host. This repository includes Docker deployment support and a deployment guide; follow the instructions that match the files in your checkout.

### Docker

If Docker is installed and the repository's `Dockerfile` is present:

```bash
docker build -t volte-pro .
docker run --env-file .env -p 3000:3000 volte-pro
```

> Replace the image name, ports, and run options as needed for the actual `Dockerfile` and server configuration. Persistent storage must be configured if your deployment relies on local session or runtime files.

### VPS or container hosting

1. Install a supported Node.js runtime or use the provided container configuration.
2. Configure environment variables in the host's secret/environment settings.
3. Ensure session and required runtime data survive restarts where necessary.
4. Configure the host's port and health-check settings to match the application.
5. Review [`DEPLOY.md`](DEPLOY.md) for platform-specific steps available in your revision.

Do not assume a free hosting plan keeps a process online continuously. Hosting providers have different sleep, storage, networking, and usage policies.

## Security and Operational Notes

- **Treat `SESSION_ID` and WhatsApp authentication data as secrets.** Anyone who obtains valid credentials may be able to control the linked session.
- Never publish `.env`, authentication folders, API keys, pairing codes, or session strings.
- Keep secrets out of logs, screenshots, issue reports, and commits.
- Restrict access to pairing/session endpoints, especially on public deployments.
- Apply command permissions carefully. Owner-only and group-admin actions should not be exposed to ordinary users.
- Review anti-delete and message-retention behavior before enabling it in groups. Follow applicable laws and respect participants' privacy.
- External APIs and download sources can change or impose their own limits. Handle failures and rate limits gracefully.

## Troubleshooting

### The bot starts but does not connect
- Confirm the configured session value is present and valid.
- Check the logs for authentication, network, or Baileys connection errors.
- Verify the host permits outbound connections and that session data persists where required.

### The pairing page does not open
- Confirm the web server started successfully.
- Check the configured port and the port exposed by your host.
- Use `http://localhost:<port>` locally, or your deployment's public URL when hosted.

### Commands do not respond
- Confirm the WhatsApp session is connected.
- Check the command prefix and whether the command is registered in the current version.
- Inspect message-handler logs and permission checks.
- Verify any required API keys or external binaries for that command.

### A media or AI command fails
- Check provider credentials, external service availability, and any required system dependencies.
- Review rate limits, download concurrency, and the error logs.
- Remember that an installed command is not proof that its external provider is currently available. APIs enjoy changing things without asking.

## Development and Testing

Keep command handlers focused, put reusable logic in services or utilities, and enforce permissions at the command boundary. When changing message processing or session behavior, test both successful and failure paths.

If the repository contains test files, run the test command defined in `package.json`. Do not assume `npm test` is configured unless a `test` script exists.

## Contributing

Contributions and bug reports should include enough detail to reproduce the issue:

1. Describe the expected behavior and what happened instead.
2. Include the relevant command, environment (local or hosted), and sanitized logs.
3. Remove phone numbers, session identifiers, API keys, and other private data.
4. For code changes, explain the behavior changed and how you tested it.

For substantial changes, open an issue or discuss the proposed approach before submitting a pull request.

## License

VORTE PRO is distributed under the MIT License. See [`LICENSE`](LICENSE) for the full text.

---

<div align="center">

**VORTE PRO** · Built with Node.js and Baileys

</div>
