const axios = require('axios'), dns = require('dns').promises, crypto = require('crypto');
const QRCode = require('qrcode'), AdmZip = require('adm-zip');
const U = require('../lib/util');
const need = (c, msg) => { const t = c.text || c.q; if (!t) throw new Error(msg); return t; };

// ---- fancy text ----
const mk = (u, l) => t => [...t].map(ch => { const x = ch.codePointAt(0); return x >= 65 && x <= 90 ? String.fromCodePoint(u + x - 65) : x >= 97 && x <= 122 ? String.fromCodePoint(l + x - 97) : ch; }).join('');
const S1 = { bold: mk(0x1D400, 0x1D41A), 'bold italic': mk(0x1D468, 0x1D482), script: mk(0x1D4D0, 0x1D4EA), 'sans bold': mk(0x1D5D4, 0x1D5EE) };
const S2 = { mono: mk(0x1D670, 0x1D68A), fraktur: mk(0x1D56C, 0x1D586), circled: mk(0x24B6, 0x24D0), wide: t => [...t].map(ch => { const x = ch.codePointAt(0); return x > 32 && x < 127 ? String.fromCodePoint(x + 0xFEE0) : ch; }).join('') };
const fancy = S => c => c.reply(Object.entries(S).map(([n, f]) => `*${n}:*\n${f(need(c, 'Give some text'))}`).join('\n\n'));

// ---- shorteners ----
const short = {
  tinyurl: u => axios.get('https://tinyurl.com/api-create.php', { params: { url: u } }).then(r => r.data),
  isgd: u => axios.get('https://is.gd/create.php', { params: { format: 'simple', url: u } }).then(r => r.data),
  vgd: u => axios.get('https://v.gd/create.php', { params: { format: 'simple', url: u } }).then(r => r.data),
  cleanuri: u => axios.post('https://cleanuri.com/api/v1/shorten', new URLSearchParams({ url: u })).then(r => r.data.result_url),
  ulvis: u => axios.get('https://ulvis.net/API/write/get', { params: { url: u, type: 'json' } }).then(r => r.data.data.url.short),
  rebrandly: u => axios.post('https://api.rebrandly.com/v1/links', { destination: u }, { headers: { apikey: process.env.REBRANDLY_KEY } }).then(r => 'https://' + r.data.shortUrl),
};
async function shorten(order, u) { for (const k of order) { try { if (k === 'rebrandly' && !process.env.REBRANDLY_KEY) continue; const r = await short[k](u); if (r) return r; } catch {} } throw new Error('All shorteners failed'); }
const sh = (name, order, desc) => ({ name, cat: 'tools', desc, run: async c => c.reply('🔗 ' + await shorten(order, need(c, `Usage: .${name} <url>`))) });

const TTS_LANGS = 'en es fr de it pt ru ar hi sw ja ko zh-CN tr id nl pl vi th bn ur fa';
const DEV = { phone: [390, 844], tab: [820, 1180], pc: [1366, 768] };
const ss = (name, dev, desc) => ({ name, cat: 'tools', desc, run: async c => {
  let u = need(c, `Usage: .${name} <url>`); if (!/^https?:\/\//.test(u)) u = 'https://' + u;
  const [w, h] = DEV[dev] || [1366, 768]; c.send({ image: await U.getBuf(`https://image.thum.io/get/width/${w}/crop/${h}/noanimate/${u}`) });
} });
const mail = new Map(); const mt = axios.create({ baseURL: 'https://api.mail.tm' });
const R = n => Math.random().toString(36).slice(2, 2 + n);

module.exports = [
  ss('ss', 'pc', 'Screenshot a website'), ss('ssphone', 'phone', 'Phone screenshot'), ss('sstab', 'tab', 'Tablet screenshot'), ss('sspc', 'pc', 'Desktop screenshot'),
  { name: 'ebase64', cat: 'tools', desc: 'Encode base64', run: c => c.reply(Buffer.from(need(c, 'Give text')).toString('base64')) },
  { name: 'dbase64', cat: 'tools', desc: 'Decode base64', run: c => c.reply(Buffer.from(need(c, 'Give base64'), 'base64').toString('utf8')) },
  { name: 'ebinary', cat: 'tools', desc: 'Text → binary', run: c => c.reply([...Buffer.from(need(c, 'Give text'))].map(b => b.toString(2).padStart(8, '0')).join(' ')) },
  { name: 'dbinary', cat: 'tools', desc: 'Binary → text', run: c => c.reply(Buffer.from(need(c, 'Give binary').split(/\s+/).map(b => parseInt(b, 2))).toString('utf8')) },
  { name: 'encrypt', cat: 'tools', desc: 'AES-256 encrypt: .encrypt password | text', run: c => {
    const [p, ...t] = need(c, 'Usage: .encrypt password | text').split('|'); if (!t.length) throw new Error('Usage: .encrypt password | text');
    const iv = crypto.randomBytes(12), k = crypto.scryptSync(p.trim(), 'wa-bot', 32), ci = crypto.createCipheriv('aes-256-gcm', k, iv);
    const enc = Buffer.concat([ci.update(t.join('|').trim(), 'utf8'), ci.final()]); c.reply(Buffer.concat([iv, ci.getAuthTag(), enc]).toString('base64'));
  } },
  { name: 'decrypt', cat: 'tools', desc: 'AES decrypt: .decrypt password | data', run: c => {
    const [p, d] = need(c, 'Usage: .decrypt password | data').split('|'); const b = Buffer.from(d.trim(), 'base64');
    const de = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(p.trim(), 'wa-bot', 32), b.subarray(0, 12)); de.setAuthTag(b.subarray(12, 28));
    c.reply(Buffer.concat([de.update(b.subarray(28)), de.final()]).toString('utf8'));
  } },
  { name: 'encrypt2', cat: 'tools', desc: 'Hashes (md5/sha1/sha256/sha512) of text', run: c => { const t = need(c, 'Give text'); c.reply(['md5', 'sha1', 'sha256', 'sha512'].map(h => `*${h}:* ${crypto.createHash(h).update(t).digest('hex')}`).join('\n')); } },
  { name: 'fancy', cat: 'tools', desc: 'Fancy text styles', run: fancy(S1) },
  { name: 'fancyv2', cat: 'tools', desc: 'More fancy text styles', run: fancy(S2) },
  { name: 'createqr', cat: 'tools', desc: 'Text → QR code', run: async c => c.send({ image: await QRCode.toBuffer(need(c, 'Give text'), { width: 512, margin: 2 }) }) },
  { name: 'tts', cat: 'tools', desc: 'Text to speech: .tts en hello', run: async c => {
    let [l, ...t] = c.args; if (!TTS_LANGS.split(' ').includes(l)) { t = c.args; l = 'en'; } const txt = (t.join(' ') || c.q).slice(0, 200); if (!txt) return c.reply('Usage: .tts <lang> <text>');
    c.send({ audio: await U.getBuf(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${l}&q=${encodeURIComponent(txt)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }), mimetype: 'audio/mpeg', ptt: true });
  } },
  { name: 'langcodes', cat: 'tools', desc: 'Language codes for .translate/.tts', run: c => c.reply('*Language codes*\n' + TTS_LANGS.split(' ').join(', ') + '\n\nExample: .translate sw Good morning') },
  { name: 'translate', cat: 'tools', desc: 'Translate: .translate sw hello', run: async c => {
    const l = c.args[0]; const t = c.args.slice(1).join(' ') || c.q; if (!l || !t) return c.reply('Usage: .translate <lang> <text> (or reply)');
    const r = (await axios.get('https://translate.googleapis.com/translate_a/single', { params: { client: 'gtx', sl: 'auto', tl: l, dt: 't', q: t } })).data; c.reply(r[0].map(x => x[0]).join(''));
  } },
  sh('shorten', ['isgd', 'tinyurl', 'cleanuri'], 'Shorten a URL'), sh('tinyurl', ['tinyurl'], 'TinyURL'), sh('cleanuri', ['cleanuri'], 'CleanURI'),
  sh('rebrandly', ['rebrandly'], 'Rebrandly (needs REBRANDLY_KEY)'), sh('vurl', ['vgd'], 'v.gd short link'),
  sh('ssur', ['ulvis', 'isgd'], 'ulvis short link'), sh('adfoc', ['isgd', 'tinyurl'], 'Short link (fallback providers)'), sh('tinube', ['tinyurl', 'isgd'], 'Short link (fallback providers)'),
  { name: 'dnschecker', cat: 'tools', desc: 'DNS records of a domain', run: async c => {
    const d = need(c, 'Usage: .dnschecker example.com').replace(/^https?:\/\//, '').split('/')[0]; let t = `*DNS for ${d}*\n`;
    for (const [k, f] of [['A', 'resolve4'], ['AAAA', 'resolve6'], ['MX', 'resolveMx'], ['NS', 'resolveNs'], ['TXT', 'resolveTxt']]) {
      try { const r = await dns[f](d); t += `\n*${k}:* ` + r.map(x => typeof x === 'string' ? x : Array.isArray(x) ? x.join('') : `${x.exchange} (${x.priority})`).join(', '); } catch {}
    } c.reply(t);
  } },
  { name: 'web2zip', cat: 'tools', desc: 'Download a webpage + css/js as zip', run: async c => {
    let u = need(c, 'Usage: .web2zip <url>'); if (!/^https?:\/\//.test(u)) u = 'https://' + u; const base = new URL(u);
    const html = (await axios.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).data; const zip = new AdmZip(); zip.addFile('index.html', Buffer.from(html));
    const links = [...html.matchAll(/(?:href|src)=["']([^"']+\.(?:css|js))["']/gi)].map(m => m[1]).slice(0, 30);
    for (const l of links) { try { const a = new URL(l, base); zip.addFile(a.pathname.replace(/^\//, '') || 'file', await U.getBuf(a.href)); } catch {} }
    c.send({ document: zip.toBuffer(), mimetype: 'application/zip', fileName: `${base.hostname}.zip` });
  } },
  { name: 'freeproxy', cat: 'tools', desc: 'Get free HTTP proxies', run: async c => {
    const r = (await axios.get('https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all')).data;
    c.reply('*Free HTTP proxies*\n' + r.trim().split(/\r?\n/).slice(0, 15).join('\n') + '\n\n_Free proxies are unreliable — test before use._');
  } },
  { name: 'tempmail', cat: 'tools', desc: 'Create a temporary email', run: async c => {
    const dom = (await mt.get('/domains')).data['hydra:member'][0].domain, address = `${R(10)}@${dom}`, password = R(12);
    await mt.post('/accounts', { address, password }); const token = (await mt.post('/token', { address, password })).data.token;
    mail.set(c.sender, { address, token }); c.reply(`📧 *${address}*\n\nCheck messages with *${c.prefix}mailinbox*`);
  } },
  { name: 'mailinbox', cat: 'tools', desc: 'Read temp mail inbox', run: async c => {
    const m = mail.get(c.sender); if (!m) return c.reply('Create one first with .tempmail');
    const l = (await mt.get('/messages', { headers: { Authorization: 'Bearer ' + m.token } })).data['hydra:member'];
    c.reply(l.length ? `📬 *${m.address}*\n\n` + l.map(x => `From: ${x.from.address}\nSubject: ${x.subject}\n${x.intro}`).join('\n\n———\n\n') : `📭 Inbox empty (${m.address})`);
  } },
  ...['tempnum', 'smsinbox'].map(name => ({ name, cat: 'tools', desc: 'Temporary phone numbers (needs provider)', run: c => c.reply('⚠️ No free reliable public API exists for virtual numbers. Plug your provider into commands/tools.js (name: ' + name + ').') })),
];
