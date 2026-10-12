// src/commands/setmenu.js
const helpers = require("../utils/helpers");

module.exports = {
  name: "setmenu1",
  scope: "OWNER",
  aliases: ["setmenu2", "setmenu3", "setmenu4"],
  description: "Choose the bot's menu style (owner only). Pass a direct URL, or reply to a photo/video with .setmenudisplay.",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const isOwner = helpers.isOwner(sender) || m.key?.fromMe;

    if (!isOwner) {
      return sock.sendMessage(chat, { text: "❌ Only my owner can change the menu style." });
    }

    const body = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const commandUsed = body.slice(1).split(/\s+/)[0].toLowerCase(); // setmenu1 / setmenu2 / setmenu3 / setmenu4
    const styleNum = parseInt(commandUsed.replace("setmenu", ""), 10);

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.menu = settings.global.menu || {};
    const menu = settings.global.menu;
    menu.style = styleNum;

    // ---- Style 2: picture header ----
    if (styleNum === 2) {
      const url = args[0];
      if (url) {
        if (!/^https?:\/\//i.test(url)) {
          return sock.sendMessage(chat, { text: "❌ That doesn't look like a valid URL.\nUsage: .setmenu2 <direct image URL>" });
        }
        menu.imageUrl = url;
      }
      saveSettings(settings);
      const hasMedia = menu.imageUrl || menu.imagePath;
      return sock.sendMessage(chat, {
        text: `✅ Menu style set to *2 — picture header*.` +
          (hasMedia ? `\nImage: ${menu.imageUrl || "(set via .setmenudisplay)"}` : `\nSend *.setmenu2 <image URL>*, or send a photo and reply with *.setmenudisplay*.`)
      });
    }

    // ---- Style 3: video/GIF header ----
    if (styleNum === 3) {
      const url = args[0];
      if (url) {
        if (!/^https?:\/\//i.test(url)) {
          return sock.sendMessage(chat, { text: "❌ That doesn't look like a valid URL.\nUsage: .setmenu3 <direct video/GIF URL>" });
        }
        menu.videoUrl = url;
      }
      saveSettings(settings);
      const hasMedia = menu.videoUrl || menu.videoPath;
      return sock.sendMessage(chat, {
        text: `✅ Menu style set to *3 — video header*.` +
          (hasMedia ? `\nVideo: ${menu.videoUrl || "(set via .setmenudisplay)"}` : `\nSend *.setmenu3 <video/GIF URL>*, or send a video and reply with *.setmenudisplay*.`)
      });
    }

    // ---- Style 4: fully custom (bot name + own pic/video) ----
    if (styleNum === 4) {
      // Optional: .setmenu4 <media URL>  (name is set separately via .setbotnameto)
      const url = args[0];
      if (url) {
        if (!/^https?:\/\//i.test(url)) {
          return sock.sendMessage(chat, { text: "❌ That doesn't look like a valid URL.\nUsage: .setmenu4 <image or video URL>" });
        }
        menu.customMediaUrl = url;
        menu.customMediaType = /\.(mp4|mov|gif)(\?|$)/i.test(url) ? "video" : "image";
      }
      saveSettings(settings);
      return sock.sendMessage(chat, {
        text: `✅ Menu style set to *4 — custom*.\n` +
          `Name : ${menu.customName || "(using default bot name — set with .setbotnameto <name>)"}\n` +
          `Media: ${menu.customMediaUrl || menu.customMediaPath || "(none set — send .setmenu4 <URL>, or send a photo/video and reply .setmenudisplay)"}`
      });
    }

    // ---- Style 1: plain text ----
    saveSettings(settings);
    return sock.sendMessage(chat, { text: "✅ Menu style set to *1 — plain text, no picture/video*." });
  }
};
