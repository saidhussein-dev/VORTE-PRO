// src/commands/delppgroup.js — REMOVE the group profile picture.
// (It used to upload a blank image instead; WhatsApp has a real remove call.)
const identity = require("../utils/identity");
const groupOps = require("../utils/groupOps");
const { panel } = require("../utils/ui");

const TITLE = "👥 GROUP MANAGEMENT";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: "delppgroup",
  scope: "GROUP",
  admin: true,
  botAdmin: true,
  description: "Delete the group profile picture",
  async execute(sock, m) {
    const chat = m.key.remoteJid;
    try {
      await sock.removeProfilePicture(chat);
    } catch (err) {
      return sock.sendMessage(chat, { text: panel(TITLE, [`❌ I couldn't remove the group picture: ${groupOps.errorReason(err)}.`]) });
    }
    identity.invalidate(chat);
    // confirm: a group without a picture has no profilePictureUrl
    let still = true;
    for (const wait of [300, 900, 1800]) {
      await sleep(wait);
      try { await sock.profilePictureUrl(chat, "image", 5000); } catch { still = false; break; }
    }
    await sock.sendMessage(chat, { text: panel(TITLE, [still ? "⚠️ WhatsApp accepted the request but the picture still shows. It may take a moment to refresh." : "✅ Group picture removed."]) });
  }
};
