Running LanguageApp

Requirements
- Node.js 18+ (LTS recommended). Check with: `node -v`
- A modern browser (Chrome, Edge, Firefox, Safari).

Quick Start
1) From the project root, start the server:
   - Easiest: `npm start`
   - Or directly: `node server.js`
2) Open your browser to: `http://localhost:3000`

Change Port
- Default port is 3000. To use a different port:
  - macOS/Linux: `PORT=4000 node server.js`
  - Windows (PowerShell): `$env:PORT=4000; node server.js`
  - Windows (CMD): `set PORT=4000 && node server.js`

Reset Progress
- In the app: tap the `Reset` button in the bottom bar.
- Via API: `curl -X POST http://localhost:3000/api/reset`
- Manually: delete `data/state.json` while the server is stopped.

Add/Update Content
- Add JSON files under `data/content/` (see README for schema).
- Refresh the app; the catalog reloads when calling `/api/catalog`.
- If items don’t appear during practice, restart the server to ensure item data is reloaded.

Item Types
- mcq: multiple choice
- input: free text answer (case/whitespace-insensitive)
- listen: TTS dictation (provide `data.tts = { text, lang }`)
- graph: renders simple graphs from `data.graph` and expects a text answer
- code: free-form code input
  - JavaScript items can include unit tests that run server-side in a restricted VM.

Production Notes
- This is a single-process Node server with static assets and JSON API.
- For production, place behind a reverse proxy (e.g., Nginx) and run via a process manager (PM2/systemd).

Example Nginx (reverse proxy)
```
server {
  listen 80;
  server_name yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Example systemd unit (Linux)
```
[Unit]
Description=LanguageApp
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/LanguageApp
Environment=PORT=3000
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Troubleshooting
- Port in use: set a different port via `PORT=...` (see above) or stop the conflicting service.
- Permission/EPERM on bind: run on a non-privileged port (>=1024) and ensure your environment allows listening sockets.
- No new subjects after adding files: refresh once to reload the catalog; restart server to reload items for practice.
- TTS voice/quality varies by device and OS; ensure browser speech synthesis is enabled.

API (local)
- Catalog: `GET /api/catalog`
- User: `GET /api/user`, `POST /api/user`
- Next item: `GET /api/items/next?subjectId=...`
- Submit: `POST /api/submit` with `{ itemId, response }`
- Stats: `GET /api/stats?subjectId=...`
- Reset: `POST /api/reset`
Dev Mode (auto-reload)
- Run: `npm run dev`
- The dev watcher restarts the Node server when files in `server.js`, `public/`, or `data/` change.
- No dependencies required; implemented via Node’s `fs.watch` with directory crawling.

