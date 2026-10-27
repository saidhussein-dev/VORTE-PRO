
const {
  sendInteractiveMessage,
} = require("zqbaileys_helper");

const TTL_MS = 10 * 60 * 1000;
const MAX = 5000;

const CHANNEL_URL =
  "https://whatsapp.com/channel/0029VbBqa4HHbFVBar2vwO3H";

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

const channelButton = {
  name: "cta_url",
  buttonParamsJson: JSON.stringify({
    display_text: "View Channel",
    url: CHANNEL_URL,
    merchant_url: CHANNEL_URL,
  }),
};

function getMessageText(content) {
  if (typeof content?.text === "string") {
    return content.text;
  }

  if (typeof content?.caption === "string") {
    return content.caption;
  }

  return "";
}

function supportsChannelButton(content) {
  if (!content || typeof content !== "object") return false;

  const hasText = getMessageText(content).trim().length > 0;

  if (!hasText) return false;

  // Only these message types are eligible.
  // Everything else remains unchanged.
  const supportedMediaKeys = [
    "image",
    "video",
    "document",
  ];

  const messageKeys = Object.keys(content);

  const hasSupportedMedia = supportedMediaKeys.some(
    (key) => content[key] != null
  );

  if (!hasSupportedMedia) {
    const allowedKeys = new Set([
      "text",
      "footer",
      "title",
      "subtitle",
      "interactiveButtons",
      "contextInfo",
    ]);

    return messageKeys.every((key) => allowedKeys.has(key));
  }

  // Do not rewrite messages containing extra payload types.
  const allowedMediaKeys = new Set([
    ...supportedMediaKeys,
    "caption",
    "text",
    "footer",
    "title",
    "subtitle",
    "interactiveButtons",
    "contextInfo",
    "mimetype",
    "fileName",
    "jpegThumbnail",
    "mentions",
    "viewOnce",
  ]);

  return (
    messageKeys.every((key) => allowedMediaKeys.has(key)) &&
    supportedMediaKeys.filter((key) => content[key] != null).length === 1
  );
}

function install(sock) {
  if (!sock || sock.__vorteTracked) return sock;

  const original = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content, options) => {
    if (content?.delete?.id) {
      markDeleted(content.delete.id);
    }

    let result;

    if (supportsChannelButton(content)) {
      const existingButtons = Array.isArray(content.interactiveButtons)
        ? content.interactiveButtons
        : [];

      const alreadyHasChannelButton = existingButtons.some((button) => {
        if (button?.name !== "cta_url") return false;

        try {
          return (
            JSON.parse(button.buttonParamsJson || "{}").url === CHANNEL_URL
          );
        } catch {
          return false;
        }
      });

      const interactiveButtons = alreadyHasChannelButton
        ? existingButtons
        : [...existingButtons, channelButton];

      try {
        result = await sendInteractiveMessage(
          sock,
          jid,
          {
            ...content,
            interactiveButtons,
            footer: content.footer || "VORTE PRO",
          },
          options || {}
        );
      } catch (error) {
        // Keep the original output working if interactive conversion fails.
        console.error(
          "[Channel Button] Interactive send failed:",
          error.message
        );

        result = await original(jid, content, options);
      }
    } else {
      result = await original(jid, content, options);
    }

    if (result?.key?.id && !content?.delete) {
      markSent(result.key.id);
    }

    return result;
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
