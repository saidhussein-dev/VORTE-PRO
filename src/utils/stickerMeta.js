// src/utils/stickerMeta.js
const crypto = require("crypto");

const DEFAULT = "VORTE PRO";

const packName = () => process.env.STICKER_PACK || DEFAULT;
const packAuthor = () => process.env.STICKER_AUTHOR || DEFAULT;

/**
 * Creates WhatsApp-compatible WebP EXIF metadata.
 */
function buildExif({
  pack = packName(),
  author = packAuthor()
} = {}) {
  const json = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
      "sticker-pack-name": pack,
      "sticker-pack-publisher": author,
      emojis: []
    }),
    "utf8"
  );

  // TIFF header + one custom metadata entry.
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x41, 0x57,
    0x07, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x16, 0x00, 0x00, 0x00
  ]);

  header.writeUIntLE(json.length, 14, 4);

  return Buffer.concat([header, json]);
}

/**
 * Inject pack metadata into a WebP sticker.
 */
async function addPackInfo(webp, opts) {
  if (!Buffer.isBuffer(webp) || webp.length < 12) {
    throw new Error("Invalid WebP input.");
  }

  if (
    webp.toString("ascii", 0, 4) !== "RIFF" ||
    webp.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Input is not a valid WebP container.");
  }

  const { Image } = require("node-webpmux");

  const img = new Image();

  await img.load(webp);

  img.exif = buildExif(opts);

  const output = Buffer.from(await img.save(null));

  if (
    output.length < 12 ||
    output.toString("ascii", 0, 4) !== "RIFF" ||
    output.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Metadata injection produced invalid WebP.");
  }

  return output;
}

/**
 * Read sticker pack metadata.
 */
async function readPackInfo(webp) {
  const { Image } = require("node-webpmux");

  const img = new Image();

  await img.load(webp);

  if (!img.exif) return {};

  const text = img.exif.toString("utf8");

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1) return {};

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

module.exports = {
  buildExif,
  addPackInfo,
  readPackInfo,
  packName,
  packAuthor
};
