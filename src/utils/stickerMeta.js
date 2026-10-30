// src/utils/stickerMeta.js — puts the sticker pack name and author ("VORTE PRO") inside a WebP sticker,
// the way other sticker makers do. WhatsApp shows them when the sticker is opened or added to favourites.
// The name/author come from STICKER_PACK / STICKER_AUTHOR (default "VORTE PRO").
const crypto = require("crypto");

const DEFAULT = "VORTE PRO";
const packName = () => process.env.STICKER_PACK || DEFAULT;
const packAuthor = () => process.env.STICKER_AUTHOR || DEFAULT;

/** The EXIF block WhatsApp reads: a tiny TIFF header followed by the JSON describing the pack. */
function buildExif({ pack = packName(), author = packAuthor() } = {}) {
  const json = Buffer.from(JSON.stringify({
    "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
    "sticker-pack-name": pack,
    "sticker-pack-publisher": author,
    emojis: [""]
  }), "utf8");
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const exif = Buffer.concat([header, json]);
  exif.writeUIntLE(json.length, 14, 4);
  return exif;
}

/** @returns {Promise<Buffer>} the same sticker (still, or animated) with the pack name/author written into it. */
async function addPackInfo(webp, opts) {
  const { Image } = require("node-webpmux");
  const img = new Image();
  await img.load(webp);
  img.exif = buildExif(opts);
  return Buffer.from(await img.save(null));
}

/** Reads the pack name/author back out of a sticker ({} when there is none). Used by the tests. */
async function readPackInfo(webp) {
  const { Image } = require("node-webpmux");
  const img = new Image();
  await img.load(webp);
  if (!img.exif) return {};
  const text = img.exif.toString("utf8");
  const start = text.indexOf("{");
  try { return JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)); } catch { return {}; }
}

module.exports = { buildExif, addPackInfo, readPackInfo, packName, packAuthor };
