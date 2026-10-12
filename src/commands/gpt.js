// src/commands/gpt.js
const ai = require("../services/ai");
const providers = require("../services/providers");
const helpers = require("../utils/helpers");
const { panel, status } = require("../utils/ui");

// .claude / .deepseek force a provider; .gpt uses the first provider the host configured
// (OpenAI first, so existing OpenAI-only setups behave exactly as before).
const PROVIDER_BY_COMMAND = { claude: "anthropic", deepseek: "deepseek" };

module.exports = {
  name: 'gpt',
  scope: "BOTH",
  aliases: ['claude', 'deepseek'],
  description: 'Ask AI (uses whichever provider(s) the host has configured)',
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const query = args.join(" ").trim();
    const commandUsed = helpers.getBody(m).slice(1).split(/\s+/)[0].toLowerCase();
    const forced = PROVIDER_BY_COMMAND[commandUsed];

    if (forced ? !ai.isProviderAvailable(forced) : ai.availableProviders().length === 0) {
      return sock.sendMessage(chat, { text: providers.UNAVAILABLE_MESSAGE });
    }
    if (!query) return sock.sendMessage(chat, { text: "💬 Please provide a question for the AI." });
    if (query.length > 4000) return sock.sendMessage(chat, { text: "❌ That question is too long (max 4000 characters)." });

    const s = await status(sock, chat, panel("🤖 AI", ["🧠 Thinking..."]), { quoted: m });
    const result = await ai.chatCompletion(query, forced);
    if (result?.text) {
      await s.finish(panel("🤖 AI", [result.text.slice(0, 3900)]));
    } else {
      await s.fail(panel("🤖 AI", ["❌ Sorry, I couldn't reach the AI at the moment."]));
    }
  }
};
