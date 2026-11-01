require('dotenv').config();
const express = require('express'), path = require('path');
const sm = require('./lib/session');
const app = express();
app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
const fs = require('fs'), crypto = require('crypto');
fs.mkdirSync(path.join(__dirname, 'sessions'), { recursive: true });
const KF = path.join(__dirname, 'sessions', '.admin_key');
let ADMIN = process.env.ADMIN_KEY;
if (!ADMIN) { try { ADMIN = fs.readFileSync(KF, 'utf8').trim(); } catch { ADMIN = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(KF, ADMIN); } }
console.log('==> ADMIN KEY (for /admin.html):', ADMIN);
const MAX = +process.env.MAX_SESSIONS || 50;
const isAdmin = req => req.headers['x-admin-key'] === ADMIN;
const gate = (req, res, next) => (process.env.PUBLIC_PAIRING !== 'false' || isAdmin(req)) ? next() : res.status(403).json({ error: 'Pairing is private. Ask the owner.' });
const full = () => sm.list().length >= MAX;

app.post('/api/pair', gate, async (req, res) => {
  const number = String(req.body.number || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ error: 'Enter number with country code, digits only' });
  if (full() && !sm.get(number)) return res.status(429).json({ error: 'Server is full' });
  try { res.json({ code: await sm.pair(number), id: number }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/qr', gate, async (req, res) => {
  if (full()) return res.status(429).json({ error: 'Server is full' });
  try {
    const id = await sm.startQR();
    for (let i = 0; i < 30 && !sm.get(id).qr; i++) await new Promise(r => setTimeout(r, 500));
    res.json({ id, qr: sm.get(id).qr });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/status/:id', (req, res) => { const e = sm.get(req.params.id); res.json({ status: e ? e.status : 'gone', qr: e?.qr || null, me: e?.me ? e.me.split('@')[0] : null }); });

const admin = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: 'bad key' });
app.get('/api/admin/sessions', admin, (req, res) => res.json(sm.list()));
app.post('/api/admin/remove/:id', admin, async (req, res) => { const e = sm.get(req.params.id); try { await e?.sock?.logout(); } catch {} sm.remove(req.params.id); res.json({ ok: true }); });
app.post('/api/admin/restart/:id', admin, async (req, res) => { try { await sm.restart(req.params.id); res.json({ ok: true }); } catch (e) { res.status(404).json({ error: e.message }); } });

process.on('unhandledRejection', e => console.error('unhandled', e?.message || e));
process.on('uncaughtException', e => console.error('uncaught', e?.message || e));
app.listen(process.env.PORT || 3000, () => { console.log('Pair site on port', process.env.PORT || 3000); sm.loadAll(); });
