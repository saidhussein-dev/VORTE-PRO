// src/commands/qr.js
const QRCode = require("qrcode");

module.exports = {
  name: "qr",
  scope: "BOTH",
  description: "Generate a QR code from text",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const text = args.join(" ");

    if (!text) return sock.sendMessage(chat, { text: "Usage: .qr hello world" });

    try {
      const qrText = text.slice(0, 500);
      const qrImg = await QRCode.toBuffer(qrText, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 300
      });
      const caption = `QR Code for: ${qrText.length > 50 ? qrText.slice(0, 50) + "..." : qrText}`;
      await sock.sendMessage(chat, { image: qrImg, caption });
    } catch (err) {
      console.error(err);
      await sock.sendMessage(chat, { text: "❌ Failed to generate QR code." });
    }
  },
};
