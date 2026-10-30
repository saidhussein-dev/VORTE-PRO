const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { ensureFfmpeg } = require("../services/downloaders/ffmpegCheck");

const DIR = path.join(__dirname, "../../storage/tmp/convert");

async function ffmpegConvert(input, {
  inExt,
  outExt,
  args = [],
  timeoutMs = 90000
}) {
  if (!Buffer.isBuffer(input) || !input.length) {
    throw new Error("Invalid or empty input buffer.");
  }

  const ff = await ensureFfmpeg();

  if (!ff) {
    const e = new Error("FFmpeg is unavailable.");
    e.code = "NO_FFMPEG";
    throw e;
  }

  fs.mkdirSync(DIR, { recursive: true });

  const id = crypto.randomBytes(8).toString("hex");
  const inFile = path.join(DIR, `${id}.in.${inExt}`);
  const outFile = path.join(DIR, `${id}.out.${outExt}`);

  try {
    fs.writeFileSync(inFile, input);

    await new Promise((resolve, reject) => {
      execFile(
        ff.ffmpeg,
        ["-y", "-hide_banner", "-loglevel", "error", "-i", inFile, ...args, outFile],
        { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const e = new Error(
              String(stderr || err.message).trim() || "FFmpeg conversion failed."
            );
            e.code = "FFMPEG_FAILED";
            reject(e);
          } else {
            resolve();
          }
        }
      );
    });

    if (!fs.existsSync(outFile)) {
      throw new Error("FFmpeg produced no output.");
    }

    const output = fs.readFileSync(outFile);

    if (!output.length) {
      throw new Error("FFmpeg produced an empty file.");
    }

    return output;

  } finally {
    for (const file of [inFile, outFile]) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
  }
}

module.exports = { ffmpegConvert, DIR };const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { ensureFfmpeg } = require("../services/downloaders/ffmpegCheck");

const DIR = path.join(__dirname, "../../storage/tmp/convert");

async function ffmpegConvert(input, {
  inExt,
  outExt,
  args = [],
  timeoutMs = 90000
}) {
  if (!Buffer.isBuffer(input) || !input.length) {
    throw new Error("Invalid or empty input buffer.");
  }

  const ff = await ensureFfmpeg();

  if (!ff) {
    const e = new Error("FFmpeg is unavailable.");
    e.code = "NO_FFMPEG";
    throw e;
  }

  fs.mkdirSync(DIR, { recursive: true });

  const id = crypto.randomBytes(8).toString("hex");
  const inFile = path.join(DIR, `${id}.in.${inExt}`);
  const outFile = path.join(DIR, `${id}.out.${outExt}`);

  try {
    fs.writeFileSync(inFile, input);

    await new Promise((resolve, reject) => {
      execFile(
        ff.ffmpeg,
        ["-y", "-hide_banner", "-loglevel", "error", "-i", inFile, ...args, outFile],
        { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const e = new Error(
              String(stderr || err.message).trim() || "FFmpeg conversion failed."
            );
            e.code = "FFMPEG_FAILED";
            reject(e);
          } else {
            resolve();
          }
        }
      );
    });

    if (!fs.existsSync(outFile)) {
      throw new Error("FFmpeg produced no output.");
    }

    const output = fs.readFileSync(outFile);

    if (!output.length) {
      throw new Error("FFmpeg produced an empty file.");
    }

    return output;

  } finally {
    for (const file of [inFile, outFile]) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
  }
}

module.exports = { ffmpegConvert, DIR };
