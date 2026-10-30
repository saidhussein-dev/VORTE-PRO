const channelButton = require("./channelButton");

const TTL_MS = 10 * 60 * 1000;
const MAX = 5000;

const sent = new Map();
const deleted = new Map();

function put(map, id) {
  if (!id) return;

  map.set(id, Date.now());

  if (map.size > MAX) {
    map.delete(map.keys().next().value);
  }
}

function has(map, id) {
  const ts = map.get(id);

  if (!ts) return false;

  if (Date.now() - ts > TTL_MS) {
    map.delete(id);
    return false;
  }

  return true;
}

const markSent = (id) => put(sent, id);
const markDeleted = (id) => put(deleted, id);
const wasSentByBot = (id) => has(sent, id);
const wasDeletedByBot = (id) => has(deleted, id);

/**
 * Wrap sock.sendMessage once so EVERY send/delete in the codebase is tracked AND carries the channel button where the
 * kind of message allows it — without touching each command. Idempotent. The button logic lives in channelButton.js.
 */
function install(sock) {
  if (!sock || sock.__vorteTracked) return sock;

  const original = sock.sendMessage.bind(sock);
  const track = (m) => { if (m?.key?.id) markSent(m.key.id); };

  sock.sendMessage = async (jid, content, options) => {
    if (content?.delete?.id) markDeleted(content.delete.id);
    if (content?.delete) return original(jid, content, options);
    return channelButton.send(sock, original, jid, content, options, track);
  };

  sock.__vorteTracked = true;
  return sock;
}

module.exports = {
  install,
  markSent,
  markDeleted,
  wasSentByBot,
  wasDeletedByBot,
};
