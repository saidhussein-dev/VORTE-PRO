// src/commands/setmenudisplay.js
const fs = require("fs");
const path = require("path");
const helpers = require("../utils/helpers");
const { downloadMediaMessage } = require("baileys");

const MENU_DIR = path.join(__dirname, "../../storage/menu");

module.exports = {
  name: "setmenudisplay",
  scope: "OWNER",
  description: "Reply to an image or video/GIF with this to set it as the current menu style's header (owner only)",
  async execute(sock, m, args, getSettings, saveSettings) {
    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;
    const isOwner = helpers.isOwner(sender) || m.key?.fromMe;

    if (!isOwner) {
      return sock.sendMessage(chat, { text: "❌ Only my owner can change the menu display." });
    }

    const contextInfo = m.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;
    if (!quoted) {
      return sock.sendMessage(chat, { text: "❌ Reply to an image or video/GIF with *.setmenudisplay*." });
    }

    const isImage = !!quoted.imageMessage;
    const isVideo = !!quoted.videoMessage;
    if (!isImage && !isVideo) {
      return sock.sendMessage(chat, { text: "❌ That's not an image or video. Reply to a photo or video/GIF with *.setmenudisplay*." });
    }

    const settings = getSettings();
    settings.global = settings.global || {};
    settings.global.menu = settings.global.menu || {};
    const style = settings.global.menu.style || 1;

    try {
      if (!fs.existsSync(MENU_DIR)) fs.mkdirSync(MENU_DIR, { recursive: true });

      // Reconstruct a message object shaped the way Baileys expects for downloading the quoted media
      const fakeMsg = {
        key: {
          remoteJid: chat,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        },
        message: quoted
      };

      const buffer = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: sock.logger });
      const filePath = path.join(MENU_DIR, isVideo ? "video.mp4" : "image.jpg");
      fs.writeFileSync(filePath, buffer);

      if (style === 4) {
        settings.global.menu.customMediaPath = filePath;
        settings.global.menu.customMediaType = isVideo ? "video" : "image";
      } else if (isVideo) {
        settings.global.menu.videoPath = filePath;
        settings.global.menu.style = 3;
      } else {
        settings.global.menu.imagePath = filePath;
        settings.global.menu.style = 2;
      }

      saveSettings(settings);
      await sock.sendMessage(chat, { text: `✅ Menu ${isVideo ? "video" : "picture"} updated!` });
    } catch (e) {
      console.error("setmenudisplay error:", e);
      await sock.sendMessage(chat, { text: "❌ Couldn't save that media. Try again." });
    }
  }
};
