// src/commands/menu.js
const os = require("os");
const fs = require("fs");
const config = require("../config/config");
const { buildMenuBody } = require("../utils/menuBuilder");
const prefixLib = require("../utils/prefix");
const botInfo = require("../utils/botInfo");
const interactive = require("../utils/interactiveMenu");

// Defaults so .setmenu2/.setmenu3 work out of the box, even before .setmenudisplay
// or a custom .setmenu2/.setmenu3 <url> is run live on the bot.
const DEFAULT_MENU_IMAGE = "https://eliteprotech-url.zone.id/1790194710775wkxz5l.jpg";
const DEFAULT_MENU_VIDEO = "https://eliteprotech-url.zone.id/1790195141470z221vj.mp4";

module.exports = {
  name: 'menu',
  scope: "BOTH",
  description: 'Show bot menu',
  async execute(sock, m, args, getSettings, saveSettings, context) {
    const chat = m.key.remoteJid;

    let menuSettings = {};
    let mode = "public";
    try {
      const settings = getSettings?.() || {};
      menuSettings = settings.global?.menu || {};
      mode = settings.global?.mode || "public";
    } catch (e) {}

    const style = menuSettings.style || 1;
    const botName = menuSettings.customName || config.botName;
    let globalOwnerName;
    try { globalOwnerName = (getSettings?.() || {}).global?.ownerName; } catch (e) {}
    const ownerName = globalOwnerName || config.owners?.[0]?.[0] || "Not set";
    let liveSettings = {};
    try { liveSettings = getSettings?.() || {}; } catch (e) {}
    const prefix = context?.prefix || prefixLib.display(liveSettings);
    const prefixLine = prefixLib.headline(liveSettings);
    const version = "1.0.0";

    // ".menu <category>" / ".menu contact" — what the buttons of the interactive menu open (also works when typed).
    const sub = (args?.[0] || "").toLowerCase();
    if (sub) {
      if (sub === interactive.CONTACT_KEY) { await interactive.sendOwnerContact(sock, chat, globalOwnerName); return; }
      if (await interactive.sendCategory(sock, chat, sub, prefix, context?.registry || new Map())) return;
    }

    const speed = `${(Math.random() * 0.5 + 0.1).toFixed(3)}s`;
    const usedRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalRam = (os.totalmem() / 1024 / 1024).toFixed(0);

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const plugins = context?.primaryCount ?? context?.commandCount ?? "?";

    const header = `
╔══════════════════════╗
║        🤖 ${botName}        ║
╚══════════════════════╝

➤ Owner   : ${ownerName}\n➤ Owner no: ${botInfo.ownerPhones(sock).join(" · ") || "not set"}\n➤ Bot no. : ${botInfo.botPhone(sock)}
➤ Prefix  : ${prefixLine}
➤ Version : ${version}
➤ Mode    : ${mode.toUpperCase()}
➤ Plugins : ${plugins}
➤ Speed   : ${speed}
➤ Usage   : ${hours}h ${minutes}m ${seconds}s
➤ Ram     : ${usedRam}MB / ${totalRam}MB
`;

    const menuBody = buildMenuBody(prefix, context?.registry || new Map()) + `\n📢 ${config.channel.name}: ${config.channel.url}\n`;

    const fullText = header + menuBody;

    // Every style gets the same buttons. The picture/video of styles 2-4 stays on top of the message; if the button
    // message cannot be sent, the old picture/video + full text menu is sent exactly as before.
    const info = { prefix, mode, plugins };
    const sendWithButtons = (content) => {
      const kind = content.video ? "video" : "image";
      return interactive.sendMainMenu(sock, chat, m, info, {
        media: { kind, source: content[kind], gifPlayback: !!content.gifPlayback },
        legacy: () => sock.sendMessage(chat, content)
      });
    };

    // Style 2: picture header (local file from .setmenudisplay takes priority, else the saved URL, else the default)
    if (style === 2) {
      if (menuSettings.imagePath && fs.existsSync(menuSettings.imagePath)) {
        return sendWithButtons({ image: fs.readFileSync(menuSettings.imagePath), caption: fullText });
      }
      const imageUrl = menuSettings.imageUrl || DEFAULT_MENU_IMAGE;
      if (imageUrl) {
        return sendWithButtons({ image: { url: imageUrl }, caption: fullText });
      }
    }

    // Style 3: video/GIF header
    if (style === 3) {
      if (menuSettings.videoPath && fs.existsSync(menuSettings.videoPath)) {
        return sendWithButtons({ video: fs.readFileSync(menuSettings.videoPath), caption: fullText, gifPlayback: true });
      }
      const videoUrl = menuSettings.videoUrl || DEFAULT_MENU_VIDEO;
      if (videoUrl) {
        return sendWithButtons({
          video: { url: videoUrl },
          caption: fullText,
          gifPlayback: true
        });
      }
    }

    // Style 4: fully custom media (name is already applied above)
    if (style === 4) {
      if (menuSettings.customMediaPath && fs.existsSync(menuSettings.customMediaPath)) {
        if (menuSettings.customMediaType === "video") {
          return sendWithButtons({ video: fs.readFileSync(menuSettings.customMediaPath), caption: fullText, gifPlayback: true });
        }
        return sendWithButtons({ image: fs.readFileSync(menuSettings.customMediaPath), caption: fullText });
      }
      if (menuSettings.customMediaUrl) {
        if (menuSettings.customMediaType === "video") {
          return sendWithButtons({
            video: { url: menuSettings.customMediaUrl },
            caption: fullText,
            gifPlayback: true
          });
        }
        return sendWithButtons({ image: { url: menuSettings.customMediaUrl }, caption: fullText });
      }
    }

    // Style 1 (default), or a media style with no media set yet: the same button menu, without a picture/video.
    return interactive.sendMainMenu(sock, chat, m, info, style === 1 ? {} : { legacy: () => sock.sendMessage(chat, { text: fullText }) });
  }
};
