// src/commands/tools.js
const helpers = require("../utils/helpers");
const { safeMathEval, MathEvalError } = require("../utils/mathEval");

const MAX_MEDIA_BYTES = 25 * 1024 * 1024; // refuse to pull huge media into memory
const toolCommands = ["math", "echo", "say", "reverse", "countchars", "vv", "toviewonce", "timer", "upper", "lower", "password", "pick"];

module.exports = {
  name: "tools",
  scope: "BOTH",
  aliases: toolCommands,
  description: "Various utility tools",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const body = helpers.getBody(m);
    const prefix = body.charAt(0);
    const commandUsed = body.slice(1).split(/\s+/)[0].toLowerCase();
    const text = args.join(" ");

    switch (commandUsed) {
      case "math": {
        if (!text) return sock.sendMessage(chat, { text: `Usage: ${prefix}math 5+5*2` });
        try {
          const answer = safeMathEval(text);
          await sock.sendMessage(chat, { text: `🧮 ${text} = *${answer}*` });
        } catch (err) {
          const reason = err instanceof MathEvalError ? err.message : "Invalid equation";
          await sock.sendMessage(chat, { text: `❌ ${reason}` });
        }
        break;
      }

      case "echo":
      case "say": {
        // Support replying to a message with just .say / .echo (no args) to repeat the quoted text
        const quotedText = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
          || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
        const output = text || quotedText;
        await sock.sendMessage(chat, { text: output || `Usage: ${prefix}${commandUsed} <text>` });
        break;
      }

      case "reverse": {
        if (!text) return sock.sendMessage(chat, { text: `Usage: ${prefix}reverse <text>` });
        await sock.sendMessage(chat, { text: text.split("").reverse().join("") });
        break;
      }

      case "countchars": {
        const quotedText = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;
        const target = text || quotedText;
        if (!target) return sock.sendMessage(chat, { text: `Usage: ${prefix}countchars <text> (or reply to a message)` });
        await sock.sendMessage(chat, { text: `📊 Text Analysis:\n• Characters: ${target.length}\n• Words: ${target.trim().split(/\s+/).length}` });
        break;
      }

      case "vv": {
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
          return sock.sendMessage(chat, { text: "❌ Reply to a view-once message with .vv" });
        }

        // Two real formats exist in the wild:
        // 1. Legacy: the media is wrapped in a viewOnceMessage(V2/V2Extension) container.
        // 2. Modern: the media is a plain imageMessage/videoMessage with viewOnce:true
        //    set directly on it — no wrapper at all. Checking only for (1), as an
        //    earlier version of this command did, means it declines real view-once
        //    messages sent in format (2), which is what most current clients send.
        const wrapped = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted.viewOnceMessageV2Extension?.message;
        const isDirectViewOnce = quoted.imageMessage?.viewOnce || quoted.videoMessage?.viewOnce;
        const viewOnce = wrapped || (isDirectViewOnce ? quoted : null);

        if (!viewOnce) {
          return sock.sendMessage(chat, { text: "❌ That is not a view-once message." });
        }
        if (Number(viewOnce.imageMessage?.fileLength || viewOnce.videoMessage?.fileLength || 0) > MAX_MEDIA_BYTES) {
          return sock.sendMessage(chat, { text: "❌ That media is too large (max 25MB)." });
        }
        try {
          const { downloadMediaMessage } = require("baileys");
          const contextInfo = m.message.extendedTextMessage.contextInfo;
          const fakeMsg = {
            key: { remoteJid: chat, id: contextInfo.stanzaId, participant: contextInfo.participant },
            message: viewOnce
          };
          const buffer = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: sock.logger, reuploadRequest: sock.updateMediaMessage });
          if (viewOnce.imageMessage) {
            return sock.sendMessage(chat, { image: buffer, caption: viewOnce.imageMessage.caption || "" });
          }
          if (viewOnce.videoMessage) {
            return sock.sendMessage(chat, { video: buffer, caption: viewOnce.videoMessage.caption || "" });
          }
          await sock.sendMessage(chat, { text: "❌ Unsupported view-once media type." });
        } catch (err) {
          console.error("❌ .vv error:", err.message);
          await sock.sendMessage(chat, { text: "❌ Couldn't retrieve that view-once media (it may have expired)." });
        }
        break;
      }

      case "toviewonce": {
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
          return sock.sendMessage(chat, { text: "❌ Reply to an image or video with .toviewonce" });
        }
        if (Number(quoted.imageMessage?.fileLength || quoted.videoMessage?.fileLength || 0) > MAX_MEDIA_BYTES) {
          return sock.sendMessage(chat, { text: "❌ That media is too large (max 25MB)." });
        }
        try {
          const { downloadMediaMessage } = require("baileys");
          const contextInfo = m.message.extendedTextMessage.contextInfo;
          const fakeMsg = {
            key: { remoteJid: chat, id: contextInfo.stanzaId, participant: contextInfo.participant },
            message: quoted
          };
          const buffer = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: sock.logger, reuploadRequest: sock.updateMediaMessage });
          if (quoted.imageMessage) {
            return sock.sendMessage(chat, { image: buffer, caption: quoted.imageMessage.caption || "", viewOnce: true });
          }
          return sock.sendMessage(chat, { video: buffer, caption: quoted.videoMessage.caption || "", viewOnce: true });
        } catch (err) {
          console.error("❌ .toviewonce error:", err.message);
          await sock.sendMessage(chat, { text: "❌ Couldn't convert that media." });
        }
        break;
      }

      case "timer": {
        const time = parseInt(text);
        if (!time || time <= 0) return sock.sendMessage(chat, { text: `Usage: ${prefix}timer <seconds>` });
        if (time > 3600) return sock.sendMessage(chat, { text: "❌ Max timer is 3600 seconds (1 hour)." });
        await sock.sendMessage(chat, { text: `⏳ Timer started for ${time}s` });
        const t = setTimeout(() => {
          sock.sendMessage(chat, { text: "⏰ Time's up!" });
        }, time * 1000);
        t.unref();
        break;
      }

      case "upper": {
        if (!text) return sock.sendMessage(chat, { text: `Usage: ${prefix}upper <text>` });
        await sock.sendMessage(chat, { text: text.toUpperCase() });
        break;
      }

      case "lower": {
        if (!text) return sock.sendMessage(chat, { text: `Usage: ${prefix}lower <text>` });
        await sock.sendMessage(chat, { text: text.toLowerCase() });
        break;
      }

      case "password": {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#";
        let pass = "";
        for (let j = 0; j < 10; j++) {
          pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        await sock.sendMessage(chat, { text: `🔐 Password: ${pass}` });
        break;
      }

      case "pick": {
        if (!text) return sock.sendMessage(chat, { text: `Usage: ${prefix}pick apple,banana,cherry` });
        const items = text.split(",").map(i => i.trim()).filter(Boolean);
        if (items.length < 2) return sock.sendMessage(chat, { text: `Usage: ${prefix}pick apple,banana,cherry` });
        const choice = items[Math.floor(Math.random() * items.length)];
        await sock.sendMessage(chat, { text: `🎯 I pick: ${choice}` });
        break;
      }
    }
  },
};
