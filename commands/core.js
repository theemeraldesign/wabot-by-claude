const os = require('os');
const { list, cmds } = require('../lib/registry');
const U = require('../lib/util');
const axios = require('axios');
const ICON = { general: '🌍', tools: '🛠️', media: '🎬', owner: '👑', group: '👥', settings: '⚙️', ai: '🤖' };
const ORDER = ['general', 'media', 'tools', 'group', 'settings', 'owner'];

const BOOL = { antilink: 'Anti-Link', antitag: 'Anti-Tag', antidelete: 'Anti-Delete', anticall: 'Anti-Call', groupevents: 'Group Events',
  autoviewstatus: 'Auto View Status', autoreplystatus: 'Auto Reply Status', autoreactstatus: 'Auto React Status',
  autoread: 'Auto Read', autobio: 'Auto Bio', chatbot: 'Chatbot (AI)', greet: 'Greet (DM)', reactDM: 'Auto React DM', reactGrp: 'Auto React Groups' };
const onoff = v => v ? '✅ ON' : '❌ OFF';

module.exports = [
  { name: 'menu', alias: ['help', 'list'], cat: 'general', desc: 'Show all commands', run: async c => {
    const s = c.settings; let t = `╭━━━ *${s.botName}* ━━━╮\n┃ Prefix : ${s.prefix}\n┃ Mode   : ${s.mode}\n┃ Cmds   : ${list.length}\n┃ Uptime : ${Math.floor(process.uptime() / 3600)}h ${Math.floor(process.uptime() / 60) % 60}m\n╰━━━━━━━━━━━━━━╯\n`;
    for (const cat of ORDER) {
      const items = list.filter(x => x.cat === cat); if (!items.length) continue;
      t += `\n*${ICON[cat] || '📋'} ${cat.toUpperCase()}*\n` + items.map(x => `• ${s.prefix}${x.name}`).join('\n') + '\n';
    }
    t += `\n_${s.prefix}getdesc <cmd> for details_`;
    await c.reply(t);
  } },
  { name: 'ping', cat: 'general', desc: 'Check bot speed', run: async c => { const t = Date.now(); await c.reply(`🏓 Pong! ${Date.now() - t}ms`); } },
  { name: 'repo', cat: 'general', desc: 'Bot repository', run: c => c.reply(`📦 *Repo:* ${process.env.REPO_URL || 'not set'}\n🌐 *Pair site:* ${process.env.SITE_URL || 'not set'}`) },
  { name: 'pair', cat: 'general', desc: 'Get the pairing website', run: c => c.reply(`🔗 Pair your own bot here:\n${process.env.SITE_URL || 'not set'}`) },
  { name: 'getdesc', cat: 'general', desc: 'Description of a command', run: c => { const x = cmds.get((c.args[0] || '').toLowerCase()); c.reply(x ? `*${x.name}*: ${x.desc}` : 'Command not found'); } },
  { name: 'getcategory', cat: 'general', desc: 'Category of a command', run: c => { const x = cmds.get((c.args[0] || '').toLowerCase()); c.reply(x ? `*${x.name}* → ${x.cat}` : 'Command not found'); } },
  { name: 'getalias', cat: 'general', desc: 'Aliases of a command', run: c => { const x = cmds.get((c.args[0] || '').toLowerCase()); c.reply(x ? `*${x.name}* aliases: ${(x.alias || []).join(', ') || 'none'}` : 'Command not found'); } },
  { name: 'copy', cat: 'general', desc: 'Re-send replied text so you can copy it', run: c => c.reply(c.q || 'Reply to a text message') },
  { name: 'location', cat: 'general', desc: 'Find a place: .location Nairobi', run: async c => {
    if (!c.text) return c.reply('Usage: .location <place>');
    const r = (await axios.get('https://nominatim.openstreetmap.org/search', { params: { q: c.text, format: 'json', limit: 1 }, headers: { 'User-Agent': 'wa-bot' } })).data[0];
    if (!r) return c.reply('Place not found');
    await c.send({ location: { degreesLatitude: +r.lat, degreesLongitude: +r.lon, name: r.display_name } });
  } },

  // ---------- settings ----------
  { name: 'settings', alias: ['config'], cat: 'settings', desc: 'Show bot settings', owner: true, run: c => {
    const s = c.settings; const k = Object.keys(BOOL);
    let t = `*⚙️ ${s.botName} SETTINGS*\n━━━━━━━━━━━━━━━━━━\n*Bot:* ${s.botName} | ${s.mode} | prefix ${s.prefix}\n*Presence:* DM ${s.presenceDM} | Grp ${s.presenceGrp}\n`;
    k.forEach(x => t += `*${x}:* ${onoff(s[x])}\n`);
    t += `\nChange: *${s.prefix}set <key> on|off*\nPresence: *${s.prefix}set presenceDM typing|recording|online|off*\nTexts: *${s.prefix}set statusReply <text>*, *${s.prefix}set greetMsg <text>*`;
    c.reply(t);
  } },
  { name: 'set', cat: 'settings', desc: 'Change a setting: .set antilink on', owner: true, run: c => {
    const [key, ...rest] = c.args; const val = rest.join(' ');
    if (!key) return c.reply('Usage: .set <key> <value>  (see .settings)');
    const s = c.settings;
    if (key in BOOL) { s[key] = /^(on|true|yes|1)$/i.test(val); }
    else if (key === 'presenceDM' || key === 'presenceGrp') { if (!['off', 'typing', 'recording', 'online'].includes(val)) return c.reply('Use off|typing|recording|online'); s[key] = val; }
    else if (['statusReply', 'greetMsg', 'botName'].includes(key)) { if (!val) return c.reply('Give a value'); s[key] = val; }
    else return c.reply('Unknown key. See .settings');
    c.save(); c.reply(`✅ ${key} → ${s[key]}`);
  } },
  { name: 'setprefix', cat: 'settings', desc: 'Change prefix', owner: true, run: c => { if (!c.args[0]) return c.reply('Give a prefix'); c.settings.prefix = c.args[0]; c.save(); c.reply(`✅ Prefix is now ${c.args[0]}`); } },
  { name: 'mode', cat: 'settings', desc: 'public / private', owner: true, run: c => { const v = (c.args[0] || '').toLowerCase(); if (!['public', 'private'].includes(v)) return c.reply('Usage: .mode public|private'); c.settings.mode = v; c.save(); c.reply(`✅ Mode: ${v}`); } },
  { name: 'sudo', cat: 'settings', desc: 'Add/remove sudo user: .sudo add 2547...', owner: true, run: c => {
    const [a, n] = c.args; const num = (n || U.num(c.mentioned) || '').replace(/\D/g, ''); const s = c.settings;
    if (a === 'list') return c.reply('Sudo: ' + (s.sudo.join(', ') || 'none'));
    if (!num || !['add', 'del'].includes(a)) return c.reply('Usage: .sudo add|del <number> | .sudo list');
    s.sudo = a === 'add' ? [...new Set([...s.sudo, num])] : s.sudo.filter(x => x !== num); c.save(); c.reply('✅ Done');
  } },

  // ---------- owner ----------
  { name: 'broadcast', cat: 'owner', desc: 'Send text to all groups', owner: true, run: async c => {
    if (!c.text) return c.reply('Usage: .broadcast <text>');
    const gs = Object.keys(await c.sock.groupFetchAllParticipating()); let n = 0;
    for (const g of gs) { await c.sock.sendMessage(g, { text: `📢 *Broadcast*\n\n${c.text}` }).then(() => n++).catch(() => {}); await new Promise(r => setTimeout(r, 2000)); }
    c.reply(`✅ Sent to ${n}/${gs.length} groups`);
  } },
  { name: 'block', cat: 'owner', desc: 'Block user (reply/mention/DM)', owner: true, run: async c => { await c.sock.updateBlockStatus(c.mentioned || c.jid, 'block'); c.reply('🚫 Blocked'); } },
  { name: 'unblock', cat: 'owner', desc: 'Unblock user', owner: true, run: async c => { await c.sock.updateBlockStatus(c.mentioned || c.jid, 'unblock'); c.reply('✅ Unblocked'); } },
  { name: 'join', cat: 'owner', desc: 'Join group by link', owner: true, run: async c => { const m = c.text.match(/chat\.whatsapp\.com\/([\w-]+)/); if (!m) return c.reply('Give a group invite link'); await c.sock.groupAcceptInvite(m[1]); c.reply('✅ Joined'); } },
  { name: 'leave', cat: 'owner', desc: 'Leave this group', owner: true, group: true, run: async c => { await c.reply('👋 Bye'); await c.sock.groupLeave(c.jid); } },
  { name: 'setbio', cat: 'owner', desc: 'Set WhatsApp bio', owner: true, run: async c => { await c.sock.updateProfileStatus(c.text); c.reply('✅ Bio updated'); } },
  { name: 'system', cat: 'owner', desc: 'Server info', owner: true, run: c => c.reply(`🖥️ ${os.type()} ${os.arch()}\nRAM: ${(process.memoryUsage().rss / 1048576).toFixed(0)}MB / ${(os.totalmem() / 1073741824).toFixed(1)}GB\nNode ${process.version}`) },
  { name: 'logout', cat: 'owner', desc: 'Unlink this bot session', owner: true, run: async c => { await c.reply('👋 Logging out…'); await c.sock.logout(); } },
  { name: 'checkapikey', cat: 'owner', desc: 'Show which API keys/tools are configured', owner: true, run: c => {
    const keys = ['REMOVEBG_KEY', 'OCR_KEY', 'REBRANDLY_KEY', ...Object.keys(process.env).filter(k => /^TOOL_.*_URL$/.test(k)).concat(['TOOL_REMINI_URL', 'TOOL_UPSCALEIMG_URL', 'TOOL_ENHANCEIMG_URL', 'TOOL_REMOVEBGV2_URL', 'TOOL_WATERMARKREMOVE_URL', 'TOOL_MAGICERASER_URL', 'TOOL_VOCALREMOVER_URL', 'TOOL_VOCALREMOVERV2_URL', 'TOOL_NOISEREMOVER_URL'])];
    c.reply('*API config*\n' + [...new Set(keys)].map(k => `${process.env[k] ? '✅' : '❌'} ${k}`).join('\n'));
  } },

  // ---------- group ----------
  { name: 'tagall', cat: 'group', desc: 'Mention everyone', group: true, admin: true, run: c => { const ps = c.group.participants.map(p => p.id); c.send({ text: `📣 *${c.text || 'Attention'}*\n\n` + ps.map(p => `@${U.num(p)}`).join(' '), mentions: ps }); } },
  { name: 'hidetag', cat: 'group', desc: 'Silent mention everyone', group: true, admin: true, run: c => c.sock.sendMessage(c.jid, { text: c.text || c.q || '👋', mentions: c.group.participants.map(p => p.id) }) },
  { name: 'kick', cat: 'group', desc: 'Remove member (reply/mention)', group: true, admin: true, botAdmin: true, run: async c => { if (!c.mentioned) return c.reply('Mention or reply to a user'); await c.sock.groupParticipantsUpdate(c.jid, [c.mentioned], 'remove'); } },
  { name: 'add', cat: 'group', desc: 'Add member by number', group: true, admin: true, botAdmin: true, run: async c => { const n = c.text.replace(/\D/g, ''); if (!n) return c.reply('Usage: .add 2547xxxxxxx'); const r = await c.sock.groupParticipantsUpdate(c.jid, [n + '@s.whatsapp.net'], 'add'); c.reply(r[0]?.status === '200' ? '✅ Added' : `⚠️ Could not add (status ${r[0]?.status})`); } },
  { name: 'promote', cat: 'group', desc: 'Make admin', group: true, admin: true, botAdmin: true, run: async c => { if (!c.mentioned) return c.reply('Mention or reply'); await c.sock.groupParticipantsUpdate(c.jid, [c.mentioned], 'promote'); } },
  { name: 'demote', cat: 'group', desc: 'Remove admin', group: true, admin: true, botAdmin: true, run: async c => { if (!c.mentioned) return c.reply('Mention or reply'); await c.sock.groupParticipantsUpdate(c.jid, [c.mentioned], 'demote'); } },
  { name: 'mute', alias: ['close'], cat: 'group', desc: 'Only admins can send', group: true, admin: true, botAdmin: true, run: async c => { await c.sock.groupSettingUpdate(c.jid, 'announcement'); c.reply('🔇 Group closed'); } },
  { name: 'unmute', alias: ['open'], cat: 'group', desc: 'Everyone can send', group: true, admin: true, botAdmin: true, run: async c => { await c.sock.groupSettingUpdate(c.jid, 'not_announcement'); c.reply('🔊 Group opened'); } },
  { name: 'link', cat: 'group', desc: 'Group invite link', group: true, admin: true, botAdmin: true, run: async c => c.reply('https://chat.whatsapp.com/' + await c.sock.groupInviteCode(c.jid)) },
  { name: 'revoke', cat: 'group', desc: 'Reset invite link', group: true, admin: true, botAdmin: true, run: async c => { await c.sock.groupRevokeInvite(c.jid); c.reply('✅ Link reset'); } },
  { name: 'gname', cat: 'group', desc: 'Rename group', group: true, admin: true, botAdmin: true, run: async c => { await c.sock.groupUpdateSubject(c.jid, c.text); } },
  { name: 'gdesc', cat: 'group', desc: 'Set group description', group: true, admin: true, botAdmin: true, run: async c => { await c.sock.groupUpdateDescription(c.jid, c.text); } },
  { name: 'delete', alias: ['del'], cat: 'group', desc: 'Delete replied message', group: true, admin: true, botAdmin: true, run: async c => { const q = c.quotedMsg; if (!q) return c.reply('Reply to a message'); await c.sock.sendMessage(c.jid, { delete: { remoteJid: c.jid, id: q.key.id, participant: q.key.participant, fromMe: false } }); } },
];
   
