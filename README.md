LanguageApp — Gamified Learning for Spoken and Programming Languages

Overview
- Single-node server with zero dependencies (Node http module)
- Fast SPA frontend (vanilla JS, no build step)
- Tracks XP, levels, streaks, and badges
- Scientifically grounded: spaced repetition (SM-2 inspired), retrieval practice, interleaving
- Separate tracks for spoken languages, programming languages, and miscellaneous topics
- Built-in TTS (browser speech synthesis) for listening drills
- Visual graph questions and code-tested DP exercises (JS)

Getting Started
- Prerequisite: Node.js 18+
- Run: `npm start` (or `node server.js`)
- Open: http://localhost:3000
- Full guide: see `docs/RUNNING.md`

Project Structure
- `server.js`: HTTP server, static file serving, JSON API, SRS engine, persistence
- `public/`: SPA assets
  - `index.html`: UI views (onboarding, practice, stats)
  - `styles.css`: modern, gamified look
  - `app.js`: client logic, API calls, practice loop
- `data/content/`: Subject content packs (JSON)
- `data/state.json`: Local persistence for user state and SRS

Core Concepts
- Tracks: `spoken`, `programming`, `misc` — clearly separated in UI and catalog
- Subjects: a curated set within a track (e.g., Portuguese Basics, Python Basics)
- Items: prompts with type-specific behavior
  - `mcq`: multiple choice
  - `input`: free-text input matched against accepted answers
  - `listen`: TTS-powered dictation; include `data.tts = { text, lang }`
  - `graph`: draws nodes/edges from `data.graph = { nodes, edges }`; answer is free text (e.g., BFS order)
  - `code`: code/textarea with token checks or JavaScript unit tests via VM
    - For JS tests, add: `"lang": "javascript", "tests": { "entry": "solution", "cases": [{ "args": [...], "expect": ... }] }`
- SRS: simplified SM-2
  - Item state: EF (ease factor), reps, lapses, intervalDays, due time
  - Correct → increases interval with EF; Incorrect → resets reps, immediate review

API Endpoints
- `GET /api/catalog`: List all subjects
- `GET /api/user`: Get user profile
- `POST /api/user`: Update user (e.g., preferences `{ track, subjectId }`)
- `GET /api/items/next?subjectId=...`: Get next due/new item
- `POST /api/submit` `{ itemId, response }`: Submit an answer; returns correctness, correct answer, updated user
- `GET /api/stats?subjectId=...`: Progress and badges
- `POST /api/reset`: Reset state

Authoring Content
- Create a file under `data/content/*.json`:
  {
    "id": "spoken_portuguese_pt_br_basics",
    "title": "Portuguese (BR) — Basics",
    "track": "spoken",
    "description": "...",
    "items": [
      { "id": "greet_hello", "type": "input", "prompt": "Translate to Portuguese: Hello", "answer": ["olá", "ola"], "hints": ["Common greeting"] }
    ]
  }
- The server hot-loads catalog on `/api/catalog` calls (no restart required for listing). Items are loaded at startup; restart to ensure new content is available during practice.

Gamification
- XP: +10 correct, +2 incorrect (reduce frustration)
- Levels: quadratic progression; badge on level-up
- Streaks: daily study streaks grant badges at milestones
- Badges: first 10 correct, track starters, levels

Scientifically Backed Methods
- Spaced repetition: SM-2 inspired scheduling per item
- Retrieval practice: question-first interactions with immediate feedback
- Interleaving: mix of item types and topics per subject; easy to expand across subjects
- Desirable difficulty: occasional recall-based (input) over recognition (MCQ)

Performance Notes
- No bundler/runtime deps; small asset footprint
- Minimal JSON payloads; simple routing

Future Extensions
- Multi-user auth and cloud sync
- Richer code checking (sandboxes, test runners) per language
- Audio prompts and TTS for spoken languages (basic TTS included)
- Leaderboards and quests
- Adaptive difficulty and smart item selection across subjects

Troubleshooting
- Port in use: set `PORT=4000 node server.js`
- State issues: `POST /api/reset` or delete `data/state.json`
