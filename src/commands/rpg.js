// src/commands/rpg.js
const helpers = require("../utils/helpers");
const rpgService = require("../services/rpgService");

const COOLDOWN_MS = 60 * 1000; // 1 minute between actions, to keep it from being a pure spam-loop

module.exports = {
  name: "rpg",
  scope: "BOTH",
  description: "RPG mini-game — .rpg, .rpg work, .rpg hunt, .rpg heal, .rpg inventory",
  async execute(sock, m, args) {
    const chat = m.key.remoteJid;
    const userId = helpers.normalizeJid(m.key.participant || m.key.remoteJid);
    const sub = args[0]?.toLowerCase();
    const character = rpgService.getCharacter(userId);
    const mention = m.key.participant || m.key.remoteJid;

    const profileText = () =>
      `🎮 *RPG Profile*\n\n` +
      `Level: ${character.level}\n` +
      `XP: ${character.xp}/${rpgService.xpForNextLevel(character.level)}\n` +
      `HP: ${character.hp}/${character.maxHp}\n` +
      `Coins: ${character.coins}\n` +
      `Inventory: ${character.inventory.length ? character.inventory.join(", ") : "(empty)"}`;

    if (!sub) {
      return sock.sendMessage(chat, { text: profileText(), mentions: [mention] });
    }

    if (sub === "inventory" || sub === "inv") {
      return sock.sendMessage(chat, { text: `🎒 Inventory: ${character.inventory.length ? character.inventory.join(", ") : "(empty)"}` });
    }

    if (sub === "work" || sub === "hunt") {
      const now = Date.now();
      if (now - character.lastAction < COOLDOWN_MS) {
        const waitS = Math.ceil((COOLDOWN_MS - (now - character.lastAction)) / 1000);
        return sock.sendMessage(chat, { text: `⏳ You're tired. Try again in ${waitS}s.` });
      }
      character.lastAction = now;

      if (sub === "work") {
        const earned = 10 + Math.floor(Math.random() * 20);
        const xpGained = 5 + Math.floor(Math.random() * 10);
        character.coins += earned;
        const levelUps = rpgService.addXp(character, xpGained);
        rpgService.saveCharacter(userId, character);
        let text = `💼 You worked and earned ${earned} coins and ${xpGained} XP.`;
        if (levelUps.length) text += `\n🎉 Level up! You're now level ${character.level}.`;
        return sock.sendMessage(chat, { text });
      }

      // hunt — riskier, more reward, can lose HP
      const success = Math.random() > 0.3;
      if (success) {
        const earned = 20 + Math.floor(Math.random() * 40);
        const xpGained = 15 + Math.floor(Math.random() * 20);
        character.coins += earned;
        const levelUps = rpgService.addXp(character, xpGained);
        rpgService.saveCharacter(userId, character);
        let text = `🏹 Successful hunt! You earned ${earned} coins and ${xpGained} XP.`;
        if (levelUps.length) text += `\n🎉 Level up! You're now level ${character.level}.`;
        return sock.sendMessage(chat, { text });
      } else {
        const damage = 10 + Math.floor(Math.random() * 20);
        character.hp = Math.max(0, character.hp - damage);
        rpgService.saveCharacter(userId, character);
        let text = `💥 The hunt went badly — you took ${damage} damage. HP: ${character.hp}/${character.maxHp}`;
        if (character.hp === 0) text += "\n☠️ You're knocked out! Use .rpg heal to recover.";
        return sock.sendMessage(chat, { text });
      }
    }

    if (sub === "heal") {
      if (character.hp >= character.maxHp) {
        return sock.sendMessage(chat, { text: "❤️ You're already at full HP." });
      }
      const cost = 20;
      if (character.coins < cost) {
        return sock.sendMessage(chat, { text: `❌ Healing costs ${cost} coins — you only have ${character.coins}.` });
      }
      character.coins -= cost;
      character.hp = character.maxHp;
      rpgService.saveCharacter(userId, character);
      return sock.sendMessage(chat, { text: `❤️ Healed to full HP for ${cost} coins.` });
    }

    return sock.sendMessage(chat, { text: "Usage: .rpg | .rpg work | .rpg hunt | .rpg heal | .rpg inventory" });
  }
};
