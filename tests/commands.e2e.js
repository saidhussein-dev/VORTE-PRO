// WARNING: these simulations write to (and some delete files under) ./storage.
// Run them from the repo root on a SCRATCH COPY, never on a live install with real data:
//   node tests/commands.e2e.js
process.env.OWNER_1 = '255700000001';
const path = process.cwd();
const commandHandler = require(path + '/src/bot/handlers/commandHandler.js');
const { handleMessage } = require(path + '/src/bot/events/messageHandler.js');
const { handleGroupUpdate } = require(path + '/src/bot/events/groupHandler.js');
const { handleMessageUpdate } = require(path + '/src/bot/events/editHandler.js');
const { handleCall } = require(path + '/src/bot/events/callHandler.js');
const helpers = require(path + '/src/utils/helpers.js');

let store = {};
const getSettings = () => JSON.parse(JSON.stringify(store));
const saveSettings = (s) => { store = JSON.parse(JSON.stringify(s)); };

let sent = [], calls = [];
const G = '120363000000@g.us';
// Admin participant is listed under a LID id but also exposes the phone jid — the original bug scenario
const participants = [
  { id: '9999999@lid', jid: '255700000002@s.whatsapp.net', admin: 'admin' },
  { id: '255700000003@s.whatsapp.net', admin: null },
  { id: '255700000004@s.whatsapp.net', admin: null },
  { id: '111@s.whatsapp.net', admin: 'admin' }, // the bot itself
];
const sock = {
  user: { id: '111:5@s.whatsapp.net' },
  logger: undefined,
  sendMessage: async (c, content) => { sent.push({ c, content }); return { key: { id: 'X' } }; },
  sendPresenceUpdate: async () => {},
  readMessages: async () => {},
  groupMetadata: async () => ({ subject: 'Test', desc: 'd', creation: 1700000000, participants, announce: false, restrict: false }),
  groupParticipantsUpdate: async (c, jids, act) => {
    calls.push(['participantsUpdate', act, jids]);
    return jids.map(j => {
      if (j.includes('403')) return { jid: j, status: '403' };
      const i = participants.findIndex(p => p.id === j || p.jid === j);
      if (act === 'remove' && i >= 0) participants.splice(i, 1);
      if (act === 'promote' && i >= 0) participants[i].admin = 'admin';
      if (act === 'demote' && i >= 0) participants[i].admin = null;
      if (act === 'add' && i < 0) participants.push({ id: j, admin: null });
      return { jid: j, status: '200' };
    });
  },
  groupRequestParticipantsList: async () => [{ jid: '255700000010@s.whatsapp.net' }, { jid: '255700000011@s.whatsapp.net' }],
  groupRequestParticipantsUpdate: async (c, jids, act) => { calls.push(['reqUpdate', act, jids]); },
  groupRevokeInvite: async () => 'NEWCODE123',
  groupUpdateDescription: async (c, d) => { calls.push(['desc', d]); },
  rejectCall: async (id, from) => { calls.push(['rejectCall', id, from]); },
  fetchPrivacySettings: async () => ({ last: 'contacts', online: 'all' }),
  fetchBlocklist: async () => ['255700000099@s.whatsapp.net'],
  fetchStatus: async () => [{ status: { status: 'hello bio' } }],
  updateGroupsAddPrivacy: async (v) => { calls.push(['groupsPrivacy', v]); },
  profilePictureUrl: async () => 'http://x/pp.jpg',
};
const msg = (chat, from, text, extra = {}) => ({ key: { remoteJid: chat, participant: chat.endsWith('@g.us') ? from : undefined, fromMe: false, id: 'ID' + Math.random() }, message: { conversation: text, ...extra } });
const run = async (chat, from, text, extra) => { sent = []; calls = []; const m = msg(chat, from, text, extra); await commandHandler.handle(sock, m, text, getSettings, saveSettings); return { texts: sent.map(s => s.content.text || (s.content.image ? '[image]' : JSON.stringify(s.content))), calls: [...calls] }; };
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name, detail ? '-> ' + detail : ''); } };
const OWNER = '255700000001@s.whatsapp.net', ADMIN_PHONE = '255700000002@s.whatsapp.net', MEMBER = '255700000003@s.whatsapp.net';

(async () => {
  console.log('\n[admin detection: LID vs phone JID]');
  check('isAdmin matches admin listed as @lid via phone jid field', await helpers.isAdmin(sock, G, ADMIN_PHONE));
  check('isAdmin matches when sender is the LID form', await helpers.isAdmin(sock, G, '9999999@lid'));
  check('isAdmin rejects a normal member', !(await helpers.isAdmin(sock, G, MEMBER)));
  check('isBotAdmin handles :device suffix', await helpers.isBotAdmin(sock, G));

  console.log('\n[group management]');
  let r = await run(G, ADMIN_PHONE, '.ginfo'); check('.ginfo shows group info', r.texts[0]?.includes('Members: 4'), r.texts[0]);
  r = await run(G, MEMBER, '.revoke'); check('.revoke rejects non-admin', r.texts[0]?.includes('Only group admins'));
  r = await run(G, ADMIN_PHONE, '.revoke'); check('.revoke works for admin', r.texts[0]?.includes('NEWCODE123'));
  r = await run(G, ADMIN_PHONE, '.updategdesc Hello team'); check('.updategdesc sets description', r.calls[0]?.[1] === 'Hello team');
  r = await run(G, ADMIN_PHONE, '.add 255700000020 255700000021'); check('.add adds numbers', r.calls[0]?.[1] === 'add' && r.calls[0][2].length === 2, JSON.stringify(r));
  store.global = { ...(store.global || {}), prefix: '.!' };
  r = await run(G, ADMIN_PHONE, '!requests'); check('!requests (alt prefix, PREFIX=.!) lists pending', r.texts[0]?.includes('JOIN REQUESTS (2)'), r.texts[0]);
  delete store.global.prefix;
  r = await run(G, ADMIN_PHONE, '.acceptall'); check('.acceptall approves all', r.calls[0]?.[1] === 'approve' && r.calls[0][2].length === 2);
  r = await run(G, ADMIN_PHONE, '.reject 255700000010'); check('.reject rejects one specific', r.calls[0]?.[1] === 'reject' && r.calls[0][2].length === 1, JSON.stringify(r));
  r = await run(G, ADMIN_PHONE, '.delete'); check('.delete without reply gives usage', r.texts[0]?.includes('Reply to'));
  r = await run(G, ADMIN_PHONE, '.delete', { extendedTextMessage: { text: '.delete', contextInfo: { stanzaId: 'S1', participant: MEMBER } } });
  check('.delete removes the replied message', sent.some(s => s.content.delete?.id === 'S1'), JSON.stringify(sent));

  console.log('\n[blacklist / ban aliases + enforcement]');
  r = await run(G, OWNER, '.ban 255 700 000 050'); check('.ban adds (normalizes spaces)', r.texts[0]?.includes('+255700000050'), r.texts[0]);
  r = await run(G, OWNER, '.banlist'); check('.banlist shows it', r.texts[0]?.includes('+255700000050'));
  r = await run(G, MEMBER, '.ban 255700000060'); check('.ban rejects non-owner', r.texts[0]?.includes('Only the bot owner'), r.texts[0]);
  r = await run(G, OWNER, '.ban ' + '255700000001'); check('cannot ban the owner', r.texts[0]?.includes("can't blacklist"));
  sent = []; await handleMessage(sock, { type: 'notify', messages: [msg(G, '255700000050:7@s.whatsapp.net', '.ping')] }, getSettings, saveSettings);
  check('blacklisted user (with :device suffix) is ignored', sent.length === 0, JSON.stringify(sent));
  r = await run(G, OWNER, '.unban 255700000050'); check('.unban removes', r.texts[0]?.includes('removed'));

  console.log('\n[sudo list + eval gating]');
  r = await run(G, OWNER, '.addsudo 255700000077'); check('true owner can .addsudo', r.texts[0]?.includes('now has sudo'), r.texts[0]);
  check('sudo user is owner-level but not true owner', helpers.isOwner('255700000077@s.whatsapp.net') && !helpers.isTrueOwner('255700000077@s.whatsapp.net'));
  r = await run(G, '255700000077@s.whatsapp.net', '.addsudo 255700000078'); check('sudo user CANNOT add more sudo users', r.texts[0]?.includes('main owner'), r.texts[0]);
  r = await run(G, OWNER, '.listsudo'); check('.listsudo shows sudo user', r.texts[0]?.includes('255700000077'));
  r = await run(G, OWNER, '.delsudo 255700000077'); check('.delsudo removes', r.texts[0]?.includes('removed'));
  r = await run(G, OWNER, '.sudo 1+1'); check('.sudo eval is disabled by default', r.texts[0]?.includes('disabled'), r.texts[0]);
  r = await run(G, '255700000077@s.whatsapp.net', '.sudo 1+1'); check('.sudo denies non-owners', r.texts[0]?.includes('Only the bot owner'), r.texts[0]);

  console.log('\n[welcome / goodbye templates]');
  r = await run(G, ADMIN_PHONE, '.welcome on'); check('.welcome on', store[G]?.welcome === true);
  r = await run(G, ADMIN_PHONE, '.setwelcome Hi {user}, welcome to {group}!'); check('.setwelcome saves', store[G]?.welcomeMessage?.includes('{user}'));
  sent = []; await handleGroupUpdate(sock, { id: G, participants: [MEMBER], action: 'add' }, getSettings);
  check('join uses custom template', sent[0]?.content?.caption === 'Hi @255700000003, welcome to Test!', sent[0]?.content?.caption);
  sent = []; await handleGroupUpdate(sock, { id: G, participants: [MEMBER], action: 'remove' }, getSettings);
  check('goodbye stays silent while .goodbye is off (independent toggles)', sent.length === 0);
  await run(G, ADMIN_PHONE, '.goodbye on'); await run(G, ADMIN_PHONE, '.setgoodbye Bye {user}');
  sent = []; await handleGroupUpdate(sock, { id: G, participants: [{ id: MEMBER }], action: 'remove' }, getSettings);
  check('leave uses custom template (object-shaped participants ok)', sent[0]?.content?.text === 'Bye @255700000003', sent[0]?.content?.text);

  console.log('\n[antiedit / antidelete]');
  await run(G, OWNER, '.antidelete on'); await run(G, ADMIN_PHONE, '.antiedit on');
  const orig = msg(G, MEMBER, 'original text'); orig.key.id = 'MSG1';
  await handleMessage(sock, { type: 'notify', messages: [orig] }, getSettings, saveSettings);
  sent = []; await handleMessageUpdate(sock, [{ key: { remoteJid: G, id: 'MSG1' }, update: { message: null } }], getSettings);
  check('deleted message is delivered to the OWNER inbox with the original text', sent[0]?.c === OWNER && sent[0]?.content?.text?.includes('original text') && sent[0]?.content?.text?.includes('ANTI-DELETE'), JSON.stringify(sent[0]));
  check('recovered message is NOT posted back into the group', !sent.some(x => x.c === G && /original text/.test(x.content?.text || '')));
  sent = []; await handleMessageUpdate(sock, [{ key: { remoteJid: G, id: 'MSG1' }, update: { message: { conversation: 'edited text' } } }], getSettings);
  check('edit is reported before/after', sent[0]?.content?.text?.includes('Before: "original text"') && sent[0].content.text.includes('After: "edited text"'), sent[0]?.content?.text);

  console.log('\n[anticall]');
  await run(G, OWNER, '.anticall on'); await run(G, OWNER, '.anticallmsg No calls please');
  sent = []; calls = []; await handleCall(sock, [{ id: 'C1', from: MEMBER, status: 'offer' }], getSettings);
  check('call rejected + caller messaged', calls[0]?.[0] === 'rejectCall' && sent[0]?.content?.text === 'No calls please', JSON.stringify({ calls, sent }));

  console.log('\n[mute enforcement]');
  r = await run(G, ADMIN_PHONE, '.mute @x 5', { extendedTextMessage: { text: '.mute @x 5', contextInfo: { mentionedJid: [MEMBER] } } }); check('.mute records mute', r.texts[0]?.includes('muted for 5'), r.texts[0]);
  sent = []; await handleMessage(sock, { type: 'notify', messages: [msg(G, MEMBER, 'hello there')] }, getSettings, saveSettings);
  check('muted user message is auto-deleted', sent.some(s => s.content.delete), JSON.stringify(sent));

  console.log('\n[antibot]');
  await run(G, ADMIN_PHONE, '.antibot add 255700000004'); await run(G, ADMIN_PHONE, '.antibot on');
  r = await run(G, ADMIN_PHONE, '.botlist'); check('.botlist shows flagged bot', r.texts[0]?.includes('255700000004'));
  r = await run(G, ADMIN_PHONE, '.kickbot'); check('.kickbot removes flagged bot present in group', r.calls[0]?.[1] === 'remove' && r.calls[0][2][0].includes('255700000004'), JSON.stringify(r));
  calls = []; await handleGroupUpdate(sock, { id: G, participants: ['255700000004@s.whatsapp.net'], action: 'add' }, getSettings);
  check('flagged bot auto-removed on join', calls[0]?.[1] === 'remove', JSON.stringify(calls));
  r = await run(G, ADMIN_PHONE, '.antibothelp'); check('.antibothelp explains manual detection', r.texts[0]?.includes("doesn't tell us"));

  console.log('\n[privacy / info / misc]');
  r = await run(OWNER, OWNER, '.getprivacy'); check('.getprivacy works', r.texts[0]?.includes('last: contacts'), r.texts[0]);
  r = await run(OWNER, OWNER, '.blocklist'); check('.blocklist lists WA blocks', r.texts[0]?.includes('255700000099'));
  r = await run(G, MEMBER, '.getbio'); check('.getbio returns bio', r.texts[0]?.includes('hello bio'), r.texts[0]);
  r = await run(OWNER, OWNER, '.groupsprivacy contacts'); check('.groupsprivacy calls Baileys API', r.calls[0]?.[1] === 'contacts');
  r = await run(G, MEMBER, '.ownernumber'); check('.ownernumber is view-only and shows the number readably', r.texts[0]?.includes('+255 700 000 001'), r.texts[0]);
  r = await run(G, MEMBER, '.channel'); check('.channel shares link', r.texts[0]?.includes('whatsapp.com/channel'));
  r = await run(OWNER, OWNER, '.prefix .#'); check('.prefix sets the prefixes (. and #)', store.global?.prefix === '.#', JSON.stringify(store.global));
  r = await run(G, MEMBER, '#dice'); check('custom prefix "#" now dispatches commands', r.texts[0]?.includes('rolled'), JSON.stringify(r));
  r = await run(OWNER, OWNER, '.online on'); check('.online on persists', store.global?.online === true);
  r = await run(OWNER, OWNER, '.ownername Said'); check('.ownername persists', store.global?.ownerName === 'Said');
  r = await run(G, ADMIN_PHONE, '.reactemojis 😂,🔥'); check('.reactemojis persists per chat', store[G]?.reactEmojis?.length === 2);
  r = await run(G, MEMBER, '.antilink on'); check('non-admin cannot toggle antilink', r.texts[0]?.includes('Only group admins'));
  r = await run(G, OWNER, '.recording on'); check('.recording alias -> global autorecording (owner)', store.global?.automation?.autorecording?.enabled === true, JSON.stringify(store.global));
  r = await run(G, ADMIN_PHONE, '.autotyping on'); check('group admin cannot change a global automation setting', r.texts[0]?.includes('Only the bot owner'), r.texts[0]);
  r = await run(OWNER, OWNER, '.statusview on'); check('.statusview alias -> global autostatusview', store.global?.autostatusview === true);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
