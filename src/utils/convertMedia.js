// src/utils/convertMedia.js — run ffmpeg on a buffer (used by .tomp3 and .toimg).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { ensureFfmpeg } = require("../services/downloaders/ffmpegCheck");

const DIR = path.join(__dirname, "../../storage/tmp/convert");

/**
 * @param {Buffer} input
 * @param {{ inExt: string, outExt: string, args: string[], timeoutMs?: number }} o  args go between -i <in> and <out>
 * @returns {Promise<Buffer>} the converted file; rejects with err.code "NO_FFMPEG" when ffmpeg isn't available
 */
async function ffmpegConvert(input, { inExt, outExt, args, timeoutMs = 90000 }) {
  const ff = await ensureFfmpeg();
  if (!ff) { const e = new Error("ffmpeg is not available on this host."); e.code = "NO_FFMPEG"; throw e; }
  fs.mkdirSync(DIR, { recursive: true });
  const id = crypto.randomBytes(6).toString("hex");
  const inFile = path.join(DIR, `${id}.in.${inExt}`), outFile = path.join(DIR, `${id}.out.${outExt}`);
  try {
    fs.writeFileSync(inFile, input);
    await new Promise((resolve, reject) => {
      execFile(ff.ffmpeg, ["-y", "-loglevel", "error", "-i", inFile, ...args, outFile], { timeout: timeoutMs }, (err, _o, stderr) => {
        if (err) { const e = new Error(String(stderr || err.message).trim().split("\n").pop() || "conversion failed"); e.code = "FFMPEG_FAILED"; reject(e); } else resolve();
      });
    });
    return fs.readFileSync(outFile);
  } finally {
    for (const f of [inFile, outFile]) { try { fs.unlinkSync(f); } catch { /* gone already */ } }
  }
}

module.exports = { ffmpegConvert, DIR };
