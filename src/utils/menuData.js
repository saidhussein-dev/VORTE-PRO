// src/utils/menuData.js
// THE single source for the menu layout. Each entry: { c: command-or-alias-name, u: usage hint, a: ["aliases worth showing"] }.
// Rules (enforced by tests/menu.e2e.js against the real command registry):
//   - every `c` must resolve to a real command (no phantom entries)
//   - a name appears once in the whole menu (no duplicates across categories)
//   - every command appears via at least one of its names
// Permission badges (👑 owner · 👮 group admin · 👥 group only) are derived from each command's own
// scope metadata, so the menu can never disagree with what the bot actually enforces.
const CATEGORIES = [
  { title: " GROUP", items: [
    { c: "tagall", u: "[msg]" }, { c: "tagadmins", u: "[msg]" }, { c: "hidetag", u: "<msg>" },
    { c: "listadmins" }, { c: "ginfo" }, { c: "gclink" }, { c: "revoke" },
    { c: "add", u: "<number>" }, { c: "kick", u: "@user" }, { c: "kickall" }, { c: "promote", u: "@user" }, { c: "demote", u: "@user" },
    { c: "mute", u: "@user <min>" }, { c: "unmute", u: "@user" }, { c: "warn", u: "@user" }, { c: "delete", u: "(reply)" },
    { c: "close" }, { c: "open" }, { c: "setgroupname", u: "<name>" }, { c: "updategdesc", u: "<text>" }, { c: "delppgroup" },
    { c: "poll", u: "q|opt1|opt2" }, { c: "requests", u: "(accept/reject <n>, acceptall, rejectall)", a: ["accept", "reject", "acceptall", "rejectall"] },
    { c: "welcome", u: "on/off" }, { c: "goodbye", u: "on/off" }, { c: "setwelcome", u: "<text>" }, { c: "setgoodbye", u: "<text>" }, { c: "leave" }
  ] },
  { title: " DEFENSE", items: [
    { c: "antilink", u: "on/off/warn/delete/remove" }, { c: "antispam", u: "on/off/warn/delete/remove" },
    { c: "antimention", u: "on/off/warn/delete/remove" }, { c: "antibug", u: "on/off/warn/delete/remove" },
    { c: "antibot", u: "on/off/warn/delete/remove · add/unflag/list <n> · .botlist · .kickbot · .antibothelp", a: ["botlist", "kickbot", "antibothelp"] },
    { c: "antiedit", u: "on/off" }, { c: "antidelete", u: "on/off  (recovered msgs go to owner inbox)" },
    { c: "anticall", u: "on/off" }, { c: "anticallmsg", u: "<text>" },
    { c: "blacklist", u: "add/remove/list", a: ["ban", "unban", "banlist"] }, { c: "safemode", u: "on/off" }
  ] },
  { title: " AUTOMATION", items: [
    { c: "autotyping", u: "on/off/private/groups/both" }, { c: "autorecording", u: "on/off/private/groups/both" },
    { c: "autoread", u: "on/off/private/groups/both" }, { c: "autoreact", u: "on/off/private/groups/both" }, { c: "reactemojis", u: "😂,🔥" },
    { c: "autostatusview", u: "on/off" }, { c: "autoreacttostatus", u: "on/off" }, { c: "setstatusreact", u: "😍,🔥" }, { c: "online", u: "on/off" }
  ] },
  { title: " AI", items: [{ c: "gpt", u: "<question>", a: ["claude", "deepseek"] }] },
  { title: " IMAGE AI", items: [
    { c: "image", u: "<prompt>" },
    { c: "1917style" }, { c: "advancedglow" }, { c: "cartoonstyle" }, { c: "luxurygold" }, { c: "matrix" }, { c: "sand" }, { c: "papercutstyle" }
  ] },
  { title: " DOWNLOADS", items: [
    { c: "song", u: "<name>" }, { c: "yt", u: "<url or search>" }, { c: "ytmp3", u: "<url>" },
    { c: "tiktok", u: "<link>" }, { c: "instagram", u: "<link>" },
    { c: "tiktokstatus", u: "(check official API config)" }, { c: "igstatus", u: "(check official API config)" }
  ] },
  { title: " INFO & SEARCH", items: [
    { c: "search", u: "<query>" }, { c: "wiki", u: "<topic>" }, { c: "define", u: "<word>" },
    { c: "weather", u: "<city>" }, { c: "translate", u: "<lang> <text>" }, { c: "imdb", u: "<title>" },
    { c: "randommovie", a: ["randomtv"] }, { c: "shorten", u: "<url>" }, { c: "getbio", u: "@user" }, { c: "userid" }
  ] },
  { title: " TOOLS", items: [
    { c: "sticker", u: "(reply to image/video)" }, { c: "qr", u: "<text>" }, { c: "vv", u: "(reply to view-once)" }, { c: "toviewonce" },
    { c: "math", u: "<expr>" }, { c: "hash", u: "[algo] <text|file>" }, { c: "encode", u: "<type> <text>" }, { c: "decode", u: "<type> <text>" }, { c: "json", u: "<json>" }, { c: "uuid", u: "[n]" }, { c: "color", u: "<name|#hex|rgb>" }, { c: "convert", u: "10 km to mi" }, { c: "time", u: "[place]" }, { c: "fileinfo", u: "(reply to a file)" }, { c: "tomp3", u: "(reply to video/audio)" }, { c: "toimg", u: "(reply to a sticker)" }, { c: "echo" }, { c: "say" }, { c: "reverse" }, { c: "countchars" }, { c: "timer" }, { c: "upper" }, { c: "lower" }, { c: "password" }, { c: "pick" },
    { c: "ssweb", u: "<link> [mobile|full]" }, { c: "age", u: "<birth date>" }, { c: "bmi", u: "<kg> <cm>" }, { c: "tip", u: "<bill> [%] [people]" }, { c: "percent", u: "20 of 150" },
    { c: "morse", u: "<text|morse>" }, { c: "roman", u: "<number|numeral>" }, { c: "numwords", u: "<number>" }, { c: "countdown", u: "<date>" }, { c: "zodiac", u: "<date>" }, { c: "lorem", u: "[sentences]" }
  ] },
  { title: " FUN", items: [
    { c: "joke" }, { c: "quote" }, { c: "truth" }, { c: "dare" }, { c: "dice" }, { c: "coin" }, { c: "guess" }, { c: "hack" },
    { c: "8ball", u: "<question>" }, { c: "rps" }, { c: "ship", u: "@a @b" }, { c: "wyr" }, { c: "meme" }, { c: "fact" }
  ] },
  { title: " GAMES", items: [
    { c: "tictactoe", u: "@user" }, { c: "tttmove" }, { c: "hangmanstart" }, { c: "hangmanguess" }, { c: "quizstart" }, { c: "quizanswer" }
  ] },
  { title: " RPG", items: [{ c: "rpg", u: "(work/hunt/heal/inventory)" }] },
  { title: " BOT", items: [
    { c: "menu" }, { c: "ping" }, { c: "ping2" }, { c: "ping3" }, { c: "runtime" }, { c: "stats" }, { c: "status" }, { c: "system" },
    { c: "owner" }, { c: "ownernumber" }, { c: "channel" }
  ] },
  { title: " SETTINGS", items: [
    { c: "settings" }, { c: "mode", u: "public/self" }, { c: "prefix", u: "<symbol>" }, { c: "setmenu1", u: "(1-4: .setmenu1 .setmenu2 .setmenu3 .setmenu4)", a: ["setmenu2", "setmenu3", "setmenu4"] },
    { c: "setmenudisplay", u: "(reply to image/video)" }, { c: "setbotnameto", u: "<name>" }, { c: "setnamebot", u: "<name>" },
    { c: "setbio", u: "<text>" }, { c: "botdp", u: "(reply to image)" }, { c: "ownername", u: "<name>" },
    { c: "getprivacy" }, { c: "groupsprivacy", u: "all/contacts" }, { c: "blocklist" }
  ] },
  { title: " OWNER", items: [
    { c: "sudo" }, { c: "addsudo", u: "<number>" }, { c: "delsudo", u: "<number>" }, { c: "listsudo" },
    { c: "update" }, { c: "restart" }, { c: "broadcast", u: "<msg>" }, { c: "join", u: "<invite link>" }, { c: "newgc", u: "<name> @users" },
    { c: "togroupstatus", u: "[color] <text> | attach/reply media" },
    { c: "dltest", u: "[link]  (why a download fails)" }
  ] }
];

module.exports = { CATEGORIES };
