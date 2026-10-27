// src/utils/sudoStore.js
// Persisted list of "sudo" (trusted secondary) users, kept in its own local
// file so helpers.isOwner() can consult it without needing the settings object.
// Cached in memory and re-read only when the file changes (it is consulted on every message).
const fs = require("fs");
const path = require("path");

const SUDO_FILE = path.join(__dirname, "../../storage/sudo.json");
let cache = null;
let cacheMtime = -1;

function ensureFile() {
  const dir = path.dirname(SUDO_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SUDO_FILE)) fs.writeFileSync(SUDO_FILE, JSON.stringify([]));
}

function list() {
  ensureFile();
  try {
    const mtime = fs.statSync(SUDO_FILE).mtimeMs;
    if (cache && mtime === cacheMtime) return cache.slice();
    const data = JSON.parse(fs.readFileSync(SUDO_FILE, "utf8"));
    cache = Array.isArray(data) ? data : [];
    cacheMtime = mtime;
    return cache.slice();
  } catch {
    return [];
  }
}

function write(arr) {
  const tmp = SUDO_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, SUDO_FILE);
  cache = null; // re-read next time
}

function add(number) {
  const current = list();
  if (!current.includes(number)) {
    current.push(number);
    write(current);
    return true;
  }
  return false;
}

function remove(number) {
  const current = list();
  const next = current.filter(n => n !== number);
  write(next);
  return next.length !== current.length;
}

module.exports = { list, add, remove };
