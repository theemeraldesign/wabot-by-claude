# My WhatsApp Bot (multi-user, pair by code or QR)

## Run
```
cp .env.example .env     # set ADMIN_KEY, OWNER_NUMBER, SITE_URL
npm install
npm start
```
Open `http://localhost:3000` → enter number → get 8-char code → WhatsApp › Linked devices › Link with phone number.
Admin panel: `/admin.html` (uses ADMIN_KEY). Set `PUBLIC_PAIRING=false` to keep pairing private.

## Deploy
Any VPS / Railway / Render / Pterodactyl with Node 18+. **Persist the `sessions/` folder** or users get unlinked on redeploy.

## Add commands
Drop a file in `commands/` exporting an array of `{name, alias, cat, desc, owner, group, admin, run(ctx)}`.
