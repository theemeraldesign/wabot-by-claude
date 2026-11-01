const axios = require('axios'), sharp = require('sharp');
const U = require('../lib/util');
const need = async c => { const d = await U.download(c.sock, c.m); if (!d) throw new Error('Reply to (or send with caption) a media file'); return d; };
const sendMedia = (c, buf, mime) => mime.startsWith('audio') ? c.send({ audio: buf, mimetype: mime }) : mime.startsWith('video') ? c.send({ video: buf }) : c.send({ image: buf });

// generic external tool: env TOOL_<NAME>_URL with {url}
async function external(c, name, kind) {
  const tpl = process.env[`TOOL_${name.toUpperCase()}_URL`];
  if (!tpl) return c.reply(`⚠️ *${name}* needs an API. Set *TOOL_${name.toUpperCase()}_URL* in .env (use {url} where the media link goes).`);
  const d = await need(c); const link = await U.upload(d.buf, d.mime.split('/')[1]?.split(';')[0] || 'bin');
  const r = await axios.get(tpl.replace('{url}', encodeURIComponent(link)), { responseType: 'arraybuffer', timeout: 120000 });
  let ct = r.headers['content-type'] || '', buf = r.data;
  if (ct.includes('json')) {
    const j = JSON.parse(buf.toString()); const u = j.url || j.result || j.data?.url || j.result?.url || j.result?.image || j.output;
    if (!u) throw new Error('API returned no media'); buf = await U.getBuf(u); ct = d.mime;
  }
  await sendMedia(c, buf, ct || d.mime);
}
const ext = (name, desc) => ({ name, cat: 'media', desc: desc + ' (needs API in .env)', run: c => external(c, name) });

module.exports = [
  { name: 'sticker', alias: ['s'], cat: 'media', desc: 'Image/video → sticker', run: async c => { const d = await need(c); c.send({ sticker: d.type === 'videoMessage' ? await U.videoSticker(d.buf) : await U.toSticker(d.buf) }); } },
  { name: 'toimg', cat: 'media', desc: 'Sticker → image', run: async c => { const d = await need(c); c.send({ image: await sharp(d.buf).png().toBuffer() }); } },
  { name: 'toviewonce', cat: 'media', desc: 'Resend media as view-once', run: async c => { const d = await need(c); const k = d.type === 'videoMessage' ? 'video' : d.type === 'audioMessage' ? 'audio' : 'image'; c.send({ [k]: d.buf, viewOnce: true, caption: d.raw.caption || '' }); } },
  { name: 'mp3', alias: ['videomp3'], cat: 'media', desc: 'Video/audio → mp3', run: async c => { const d = await need(c); const out = await U.ff(d.buf, 'mp4', 'mp3', ['-vn', '-b:a', '128k']); c.send({ audio: out, mimetype: 'audio/mpeg' }); } },
  { name: 'trim', cat: 'media', desc: 'Trim audio/video: .trim 5 20 (start end secs)', run: async c => {
    const [a, b] = c.args.map(Number); if (isNaN(a) || isNaN(b) || b <= a) return c.reply('Usage: reply media + .trim <start> <end>');
    const d = await need(c); const isV = d.type === 'videoMessage'; const out = await U.ff(d.buf, isV ? 'mp4' : 'mp3', isV ? 'mp4' : 'mp3', ['-ss', a, '-to', b]);
    c.send(isV ? { video: out } : { audio: out, mimetype: 'audio/mpeg' });
  } },
  { name: 'volume', cat: 'media', desc: 'Change volume: .volume 2 (1 = normal)', run: async c => { const v = parseFloat(c.args[0]); if (!v) return c.reply('Usage: .volume 2'); const d = await need(c); c.send({ audio: await U.ff(d.buf, 'mp3', 'mp3', ['-filter:a', `volume=${v}`]), mimetype: 'audio/mpeg' }); } },
  { name: 'amplify', cat: 'media', desc: 'Make audio louder', run: async c => { const d = await need(c); c.send({ audio: await U.ff(d.buf, 'mp3', 'mp3', ['-filter:a', 'volume=3,acompressor']), mimetype: 'audio/mpeg' }); } },
  { name: 'removebgg', cat: 'media', desc: 'Remove background (remove.bg key)', run: async c => {
    if (!process.env.REMOVEBG_KEY) return c.reply('⚠️ Set REMOVEBG_KEY in .env');
    const d = await need(c); const fd = new FormData(); fd.append('image_file', new Blob([d.buf]), 'in.png'); fd.append('size', 'auto');
    const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': process.env.REMOVEBG_KEY }, body: fd });
    if (!r.ok) throw new Error('remove.bg: ' + r.status); c.send({ document: Buffer.from(await r.arrayBuffer()), mimetype: 'image/png', fileName: 'nobg.png' });
  } },
  ext('removebgv2', 'Remove background v2'), ext('remini', 'Enhance photo'), ext('upscaleimg', 'Upscale image'), ext('enhanceimg', 'Enhance image'),
  ext('watermarkremove', 'Remove watermark'), ext('magiceraser', 'Erase objects'),
  ext('vocalremover', 'Remove vocals'), ext('vocalremoverv2', 'Remove vocals v2'), ext('noiseremover', 'Remove noise'),
  { name: 'ocr', cat: 'media', desc: 'Read text from image', run: async c => {
    const d = await need(c); const p = new URLSearchParams({ apikey: process.env.OCR_KEY || 'helloworld', base64Image: `data:${d.mime};base64,${d.buf.toString('base64')}`, language: 'eng' });
    const r = (await axios.post('https://api.ocr.space/parse/image', p)).data; c.reply(r.ParsedResults?.[0]?.ParsedText?.trim() || 'No text found');
  } },
  { name: 'readqr', cat: 'media', desc: 'Decode a QR image', run: async c => {
    const d = await need(c); const { data, info } = await sharp(d.buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const r = require('jsqr')(new Uint8ClampedArray(data), info.width, info.height); c.reply(r ? r.data : 'No QR found');
  } },
  { name: 'ttp', cat: 'media', desc: 'Text → sticker', run: async c => {
    if (!c.text) return c.reply('Usage: .ttp hello'); const lines = U.wrap(c.text, 14).slice(0, 6), fs = Math.min(120, 440 / Math.max(lines.length, 3));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${lines.map((l, i) => `<text x="256" y="${256 + (i - (lines.length - 1) / 2) * fs * 1.1}" font-size="${fs}" font-family="sans-serif" font-weight="bold" fill="#fff" stroke="#000" stroke-width="${fs / 12}" text-anchor="middle" dominant-baseline="middle">${U.esc(l)}</text>`).join('')}</svg>`;
    c.send({ sticker: await sharp(Buffer.from(svg)).webp().toBuffer() });
  } },
  { name: 'emojimix', cat: 'media', desc: 'Mix two emojis: .emojimix 😀+😍', run: async c => {
    const e = c.text.match(/\p{Extended_Pictographic}\uFE0F?/gu); if (!e || e.length < 2) return c.reply('Usage: .emojimix 😀+😍');
    const r = (await axios.get('https://tenor.googleapis.com/v2/featured', { params: { key: 'AIzaSyACvEq5cnT7AcHpDdj4YtHaZ4a6G6MqSeQ', contentfilter: 'high', media_filter: 'png_transparent', component: 'proactive', collection: 'emoji_kitchen_v5', q: `${e[0]}_${e[1]}` } })).data;
    const u = r.results?.[0]?.url; if (!u) return c.reply('No mix available for these emojis');
    c.send({ sticker: await U.toSticker(await U.getBuf(u)) });
  } },
  { name: 'carbon', cat: 'media', desc: 'Code → image', run: async c => {
    const code = c.text || c.q; if (!code) return c.reply('Usage: .carbon <code> (or reply to code)');
    const r = await axios.post('https://carbonara.solopov.dev/api/cook', { code, backgroundColor: '#1F816D' }, { responseType: 'arraybuffer' }); c.send({ image: r.data });
  } },
  { name: 'quotegen', cat: 'media', desc: 'Quote card: .quotegen text | author', run: async c => {
    const [q, a] = c.text.split('|').map(x => x.trim()); if (!q) return c.reply('Usage: .quotegen text | author'); const L = U.wrap(q, 30).slice(0, 9);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f1c2c"/><stop offset="1" stop-color="#928dab"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/><text x="90" y="200" font-size="200" fill="#ffffff55" font-family="serif">“</text>${L.map((l, i) => `<text x="540" y="${380 + i * 70}" font-size="52" fill="#fff" font-family="sans-serif" text-anchor="middle">${U.esc(l)}</text>`).join('')}<text x="540" y="${460 + L.length * 70}" font-size="40" fill="#ffd" font-family="sans-serif" text-anchor="middle">— ${U.esc(a || 'Unknown')}</text></svg>`;
    c.send({ image: await U.svgToPng(svg, 1080, 1080) });
  } },
  { name: 'canvascard', cat: 'media', desc: 'Profile card: .canvascard Name | Title', run: async c => {
    const [n, t] = (c.text || c.m.pushName || 'User').split('|').map(x => x.trim());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0f2027"/><stop offset=".5" stop-color="#203a43"/><stop offset="1" stop-color="#2c5364"/></linearGradient></defs><rect width="900" height="500" rx="30" fill="url(#g)"/><circle cx="170" cy="250" r="90" fill="#25D366"/><text x="170" y="285" font-size="100" text-anchor="middle" fill="#fff" font-family="sans-serif">${U.esc((n || 'U')[0].toUpperCase())}</text><text x="320" y="240" font-size="60" fill="#fff" font-family="sans-serif" font-weight="bold">${U.esc(n || 'User')}</text><text x="320" y="300" font-size="34" fill="#9fe" font-family="sans-serif">${U.esc(t || c.settings.botName)}</text></svg>`;
    c.send({ image: await U.svgToPng(svg, 900, 500) });
  } },
];
