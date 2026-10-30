// src/commands/menu.js
const os = require("os");
const fs = require("fs");
const config = require("../config/config");
const { buildMenuBody } = require("../utils/menuBuilder");
const prefixLib = require("../utils/prefix");
const botInfo = require("../utils/botInfo");
const interactive = require("../utils/interactiveMenu");
const identity = require("../utils/identity");
const pollMenu = require("../utils/ownerPollMenu");
const tapDebug = require("../utils/tapDebug");

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

    // ".menu all": every command in one text list (the "All Commands" button opens this)
    const showAll = sub === "all";

    // Speed = how long this message took to reach the bot (real, not random); "n/a" if WhatsApp gave no timestamp.
    const lag = Number(m.messageTimestamp) ? Date.now() - Number(m.messageTimestamp) * 1000 : NaN;
    const speed = Number.isFinite(lag) ? `${(Math.min(Math.max(lag, 0), 30000) / 1000).toFixed(3)}s` : "n/a";
    const usedRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalRam = (os.totalmem() / 1024 / 1024).toFixed(0);

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const plugins = context?.primaryCount ?? context?.commandCount ?? "?";

    const header = `
┌───────〔 ${botName} 〕───────┐
|
| ➤ Owner   : 𝔇𝔢𝔞𝔱𝔥𝔰𝔱𝔯𝔬𝔨𝔢
| ➤ Owner no: ${botInfo.ownerPhones(sock).join(" · ") || "not set"}
| ➤ Bot no. : ${botInfo.botPhone(sock)}
| ➤ Prefix  : ${prefixLine}
| ➤ Version : ${version}
| ➤ Mode    : ${mode.toUpperCase()}
| ➤ Plugins : ${plugins}
| ➤ Speed   : ${speed}
| ➤ Usage   : ${hours}h ${minutes}m ${seconds}s
| ➤ RAM     : ${usedRam}MB / ${totalRam}MB
└───────────────────────────────┘
`;

    const menuBody = buildMenuBody(prefix, context?.registry || new Map()) + `\n📢 ${config.channel.name}: ${config.channel.url}\n`;

    const fullText = header + menuBody;
    if (showAll) return sock.sendMessage(chat, { text: fullText });

    // Every style gets the same buttons. The picture/video of styles 2-4 stays on top of the message; if the button
    // message cannot be sent, the old picture/video + full text menu is sent exactly as before.
    // Is the person asking the bot's OWN account (the owner on the paired number)? WhatsApp won't let an account press
    // buttons on its own messages. By default that account gets the SAME reply buttons as everyone; MENU_OWNER_LINKS=true gives it
    // link buttons instead, MENU_OWNER_POLL=true a poll (see interactiveMenu.buttons / ownerPollMenu).
    let own = !!m.key?.fromMe;
    try {
      const me = botInfo.botNumber(sock);
      const who = String(identity.toPn(m.key?.participant || m.key?.remoteJid) || "").replace(/\D/g, "");
      if (me && who && who === me) own = true;
    } catch (e) { /* keep fromMe */ }
    tapDebug.note(`.menu requested: fromMe=${!!m.key?.fromMe} ownAccount=${own} chat=${chat.endsWith("@g.us") ? "group" : "private"}`);
    const info = { prefix, mode, plugins, linkMode: own && /^(true|on|1|yes)$/i.test(String(process.env.MENU_OWNER_LINKS || "").trim()), headerText: header }; // header = the original name box + info lines
    // The bot's own account cannot press buttons on its own messages, so there the menu is an info message + a poll
    // (ownerPollMenu). If the poll cannot be sent, the normal path below (link buttons for that account) is used.
    const sendWithButtons = async (content) => {
      if (own && await pollMenu.trySend(sock, chat, info, content)) return;
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
    if (own && await pollMenu.trySend(sock, chat, info, null)) return;
    return interactive.sendMainMenu(sock, chat, m, info, style === 1 ? {} : { legacy: () => sock.sendMessage(chat, { text: fullText }) });
  }
};
