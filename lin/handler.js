const axios = require('axios');
const { normalizeMessageContent, jidNormalizedUser } = require('@whiskeysockets/baileys');
const U = require('./util'), store = require('./store'), { cmds } = require('./registry');

const metaCache = new Map();
async function meta(sock, jid) {
  const c = metaCache.get(jid);
  if (c && Date.now() - c.t < 60000) return c.m;
  const m = await sock.groupMetadata(jid); metaCache.set(jid, { m, t: Date.now() }); return m;
}
const pIds = p => [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean).map(U.num);
const isAdminOf = (m, jid) => m.participants.some(p => p.admin && pIds(p).includes(U.num(jid)));
const EMOJIS = ['❤️', '🔥', '😍', '👍', '😂', '💯', '🙏', '✨', '😎', '🎉'];
const PRES = { typing: 'composing', recording: 'recording', online: 'available' };

module.exports = function attach(entry) {
  const { sock } = entry;
  entry.settings = store.load(entry.id);
  const saveS = () => store.save(entry.id, entry.settings);
  entry.saveSettings = saveS;
  const cache = new Map(), greeted = new Map();
  const S = () => entry.settings;
  const me = () => entry.me || (sock.user && jidNormalizedUser(sock.user.id));

  sock.ev.on('connection.update', ({ connection }) => {
    if (connection !== 'open') return;
    entry.timers.push(setInterval(() => {
      if (S().autobio) sock.updateProfileStatus(`${S().botName} | online ${new Date().toLocaleTimeString()}`).catch(() => {});
    }, 60000));
  });

  sock.ev.on('call', async calls => {
    if (!S().anticall) return;
    for (const c of calls) if (c.status === 'offer') {
      await sock.rejectCall(c.id, c.from).catch(() => {});
      sock.sendMessage(c.from, { text: '📞 Calls are not allowed. Please send a message.' }).catch(() => {});
    }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (!S().groupevents) return;
    try {
      const gm = await sock.groupMetadata(id);
      for (const p of participants) {
        const j = typeof p === 'string' ? p : p.id || p.phoneNumber;
        if (action === 'add') await sock.sendMessage(id, { text: `👋 Welcome @${U.num(j)} to *${gm.subject}*!\n\n${gm.desc || ''}`.trim(), mentions: [j] });
        if (action === 'remove') await sock.sendMessage(id, { text: `😢 Goodbye @${U.num(j)}`, mentions: [j] });
        if (action === 'promote') await sock.sendMessage(id, { text: `🎉 @${U.num(j)} is now an admin`, mentions: [j] });
        if (action === 'demote') await sock.sendMessage(id, { text: `⬇️ @${U.num(j)} is no longer an admin`, mentions: [j] });
      }
    } catch {}
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) { try { await onMessage(m); } catch (e) { console.error(`[${entry.id}]`, e.message); } }
  });

  async function onMessage(m) {
    if (!m.message) return;
    m.message = normalizeMessageContent(m.message);
    const jid = m.key.remoteJid, s = S();
    if (!jid) return;

    // ---- status ----
    if (jid === 'status@broadcast') {
      if (m.key.fromMe) return;
      if (s.autoviewstatus) await sock.readMessages([m.key]);
      if (s.autoreactstatus) await sock.sendMessage(jid, { react: { key: m.key, text: '💚' } }, { statusJidList: [m.key.participant, me()] }).catch(() => {});
      if (s.autoreplystatus && m.key.participant) await sock.sendMessage(m.key.participant, { text: s.statusReply }, { quoted: m }).catch(() => {});
      return;
    }

    // ---- anti-delete ----
    const pm = m.message.protocolMessage;
    if (pm) {
      if (pm.type === 0 && s.antidelete && !m.key.fromMe) {
        const old = cache.get(pm.key?.id);
        if (old) {
          const who = old.key.participant || old.key.remoteJid;
          await sock.sendMessage(me(), { text: `🗑️ *Deleted message*\nFrom: @${U.num(who)}\nChat: ${jid.endsWith('@g.us') ? (await meta(sock, jid).catch(() => ({ subject: 'group' }))).subject : 'DM'}`, mentions: [who] });
          await sock.sendMessage(me(), { forward: old }, { quoted: old }).catch(() => {});
        }
      }
      return;
    }
    cache.set(m.key.id, m); if (cache.size > 800) cache.delete(cache.keys().next().value);

    const isGroup = jid.endsWith('@g.us');
    const sender = m.key.fromMe ? me() : (isGroup ? m.key.participant : jid);
    const text = U.getText(m.message).trim();
    const prefix = s.prefix;
    const isCmd = text.startsWith(prefix) && text.length > prefix.length;
    if (m.key.fromMe && !isCmd) return;

    const ownerNum = process.env.OWNER_NUMBER;
    const isOwner = m.key.fromMe || U.num(sender) === U.num(me()) || (ownerNum && U.num(sender) === ownerNum) || s.sudo.includes(U.num(sender));

    if (!m.key.fromMe) {
      if (s.autoread) sock.readMessages([m.key]).catch(() => {});
      const pres = PRES[isGroup ? s.presenceGrp : s.presenceDM];
      if (pres) sock.sendPresenceUpdate(pres, jid).catch(() => {});
      if ((isGroup ? s.reactGrp : s.reactDM)) sock.sendMessage(jid, { react: { key: m.key, text: EMOJIS[Math.floor(Math.random() * EMOJIS.length)] } }).catch(() => {});
    }

    // ---- group protections ----
    let gm = null, botAdmin = false, isAdmin = false;
    if (isGroup) {
      gm = await meta(sock, jid).catch(() => null);
      if (gm) { botAdmin = isAdminOf(gm, me()); isAdmin = isAdminOf(gm, sender); }
      if (gm && botAdmin && !isAdmin && !isOwner && !m.key.fromMe) {
        if (s.antilink && /(https?:\/\/|chat\.whatsapp\.com\/|wa\.me\/)\S+/i.test(text)) {
          await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
          await sock.sendMessage(jid, { text: `🔗 @${U.num(sender)} links are not allowed here.`, mentions: [sender] });
          return;
        }
        const ci = U.ctxInfo(m.message);
        if (s.antitag && ((ci?.mentionedJid?.length || 0) >= Math.max(5, gm.participants.length * 0.8) || ci?.groupMentions?.length)) {
          await sock.sendMessage(jid, { delete: m.key }).catch(() => {});
          await sock.sendMessage(jid, { text: `🏷️ @${U.num(sender)} mass tagging is not allowed.`, mentions: [sender] });
          return;
        }
      }
    }

    // ---- commands ----
    if (isCmd) {
      const [name, ...args] = text.slice(prefix.length).trim().split(/\s+/);
      const cmd = cmds.get(name.toLowerCase());
      if (!cmd) return;
      if (s.mode === 'private' && !isOwner) return;
      const reply = (t, o = {}) => sock.sendMessage(jid, { text: t, ...o }, { quoted: m });
      const ctx = {
        sock, m, jid, sender, args, text: args.join(' '), reply, entry, settings: s, save: saveS, prefix,
        isOwner, isGroup, isAdmin, botAdmin, group: gm, name,
        q: U.getText(U.quoted(m)?.message), quotedMsg: U.quoted(m),
        mentioned: U.ctxInfo(m.message)?.mentionedJid?.[0] || U.quoted(m)?.sender,
        send: (c, o = {}) => sock.sendMessage(jid, c, { quoted: m, ...o })
      };
      if (cmd.owner && !isOwner) return reply('⛔ Owner only command.');
      if (cmd.group && !isGroup) return reply('⛔ This command works in groups only.');
      if (cmd.admin && !(isAdmin || isOwner)) return reply('⛔ Group admins only.');
      if (cmd.botAdmin && !botAdmin) return reply('⚠️ I need to be a group admin for this.');
      await sock.sendMessage(jid, { react: { key: m.key, text: '⏳' } }).catch(() => {});
      try { await cmd.run(ctx); await sock.sendMessage(jid, { react: { key: m.key, text: '✅' } }).catch(() => {}); }
      catch (e) { console.error(`[${entry.id}] ${name}:`, e.message); await sock.sendMessage(jid, { react: { key: m.key, text: '❌' } }).catch(() => {}); reply(`❌ Error: ${e.message}`); }
      return;
    }

    if (m.key.fromMe || isGroup) return;

    // ---- DM chatbot / greet ----
    if (s.chatbot && text) {
      try {
        const r = await axios.get('https://text.pollinations.ai/' + encodeURIComponent(text), { params: { system: `You are ${s.botName}, a friendly WhatsApp assistant. Keep replies short.` }, timeout: 30000 });
        return sock.sendMessage(jid, { text: String(r.data) }, { quoted: m });
      } catch {}
    }
    if (s.greet && Date.now() - (greeted.get(jid) || 0) > 24 * 3600 * 1000) {
      greeted.set(jid, Date.now()); sock.sendMessage(jid, { text: s.greetMsg }, { quoted: m });
    }
  }
};
                                                             
