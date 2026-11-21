# Sports Insight Bot

A cricket-first sports Analyst you chat with. You ask about a match, a tactic or a screenshot, and the Analyst explains it. For cricket it will also draw its answer on an interactive Ground (field placements and wagon wheels).

**Status (Nov 2026): rebuild in progress.** The app is being rebuilt in 10 vertical slices. Slices 01 (walking skeleton) and 02 (streaming chat) are done: you can chat with the Analyst, the reply streams in word by word as formatted text, and your Chats are saved in your own browser.

**Live:** https://sports-insight-bot.vercel.app

The old version (vanilla HTML/JS and a FastAPI server, deployed from two other repos) stopped working when its model lost all providers on OpenRouter. This repo replaces it.

## What works now

| Part | What it does |
|---|---|
| Chat | Ask the Analyst a question. A "thinking" line shows first, then the reply streams in word by word and renders as Markdown (tables, lists, bold), sanitised. **Stop** ends a reply and keeps the text so far. A failure shows a clear message with **Retry**. |
| Chats | Start a new Chat without a reload, see your Chats (titled from their first Message), open, rename and delete them. They live in your browser's IndexedDB, survive a reload, and no other Visitor can see them. |
| Limits | Each request sends only the last 20 Messages (the server trims again). Visitor Messages are up to 2,000 characters. On HTTP 429 from the Vercel firewall the page says "Limit reached … try again after HH:MM". |
| API | `POST /api/chat` streams server-sent events: `text`, then `done` or `error` (`code`, `message`, `retryable`). `GET /api/health` returns `{"status": "ok", "model": "<model ID>"}`. The model ID comes from `OPENROUTER_MODEL` (default `google/gemma-4-26b-a4b-it`). |
| CI | Every push and pull request runs ruff, pytest, svelte-check, Vitest and Playwright. `main` only accepts pull requests with a green check. |

## Stack

| Part | Choice | Why |
|---|---|---|
| Web page | Svelte 5 + Vite + TypeScript, static build | Small compiled UI, and a framework other than the usual React default. |
| API | Python 3.12, FastAPI, managed with uv, linted with ruff, tested with pytest | Typed request and response models; uv gives one lockfile and fast installs. |
| Hosting | Vercel, one project with two Services (`frontend/`, `backend/`) | One URL, no CORS, preview deploys for feedback. See [ADR 0002](docs/adr/0002-vercel-for-both-frontend-and-api.md). |
| Model | `google/gemma-4-26b-a4b-it` on OpenRouter | Picked by a 6-model test: best text answers, only clean pass on the field JSON task, cheapest. See [docs/model-eval](docs/model-eval/README.md). |
| Model call | `httpx2` and a small SSE reader, not the `openai` SDK | One endpoint and a simple stream format; OpenRouter's error codes stay visible. `httpx2` is Pydantic's maintained fork of `httpx`. |
| Streaming | FastAPI `EventSourceResponse` → `eventsource-parser` in the page | Server-sent events over a normal POST; the parser handles split chunks and keep-alive pings. |
| Chat storage | IndexedDB through `idb` | Chats stay in the Visitor's browser, so the server keeps no state ([ADR 0001](docs/adr/0001-chats-live-only-in-the-browser.md)). |
| Markdown | `markdown-it` (`html: false`) + DOMPurify | Two layers against HTML injection: raw HTML shows as text, then the output is sanitised. |
| Tests | pytest, Vitest + Testing Library, Playwright | One test layer per part: API, component, whole page in a real browser. |
| Visual feedback | Vercel Toolbar comments (preview deploys), sv-agentation (local dev only) | The owner leaves notes on the running page, and the coding agent reads and fixes them. |

## Repo layout

```
frontend/                 Svelte 5 + Vite + TypeScript page (static build)
  src/lib/ChatView.svelte        Messages, streaming reply, Stop, Retry, composer
  src/lib/ChatList.svelte        Chat list: new, open, rename, delete
  src/lib/chat-session.svelte.ts page state; joins the Chat store and the stream client
  src/lib/chat-store.ts          Chats and Messages in IndexedDB (idb)
  src/lib/chat-stream.ts         POST /api/chat and read the server-sent events
  src/lib/markdown.ts            Markdown to safe HTML (markdown-it + DOMPurify)
  src/lib/AnalystStatus.svelte   asks the API for its health
  e2e/                    Playwright tests (API mocked)
backend/                  FastAPI API, served under /api
  app/main.py             routes (GET /api/health, POST /api/chat)
  app/analyst.py          the Analyst: prompt, 20-Message history, error messages
  app/openrouter.py       the OpenRouter adapter (streamed chat completions)
  app/model_provider.py   the adapter interface the Analyst depends on
  app/events.py           the server-sent events: text, error, done
  app/config.py           settings from environment variables
  tests/                  pytest tests (fake model provider, no network)
vercel.json               Vercel Services: /api/* goes to backend, all else to frontend
.github/workflows/ci.yml  CI: lint and tests on every push and pull request
docs/                     PRD, ADRs, model test, learning notes
```

## Run it locally (fresh clone)

You need [Node.js](https://nodejs.org) 24 or newer and [uv](https://docs.astral.sh/uv/) (uv installs Python 3.12 for you).

1. Clone the repo:

   ```bash
   git clone https://github.com/v1d1tt/sports-insight-bot.git
   cd sports-insight-bot
   ```

2. Start the API (terminal 1):

   ```bash
   cd backend
   cp .env.example .env
   uv sync
   uv run --env-file .env fastapi dev
   ```

   `.env` holds your OpenRouter key (`OPENROUTER_API_KEY`) and the model ID. It is git-ignored. The API runs at http://127.0.0.1:8000/api/health. If the Analyst often says it is busy, the free model variant (`:free`) is rate-limited upstream; set `OPENROUTER_MODEL=google/gemma-4-26b-a4b-it` in `.env` instead (about $0.01 per 100 chats).

3. Start the web page (terminal 2):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open http://localhost:5173. Vite forwards `/api` requests to the API on port 8000, so the paths are the same as on Vercel.

## Test

API (from `backend/`):

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Web page (from `frontend/`):

```bash
npm run check                     # svelte-check and TypeScript
npm test                          # Vitest component tests
npx playwright install chromium   # once, downloads the test browser
npm run test:e2e                  # Playwright: builds the page and tests it in Chromium
```

No test calls the network or needs a key. pytest replaces the model with a fake provider (and tests the real OpenRouter adapter against recorded stream bytes). Vitest uses an in-memory IndexedDB. Playwright mocks every `/api` request; the streaming tests use a small local SSE server. CI runs all of these on every push and pull request ([workflow](.github/workflows/ci.yml)).

## Deploy

Vercel builds from GitHub. Each pull request gets a preview URL, and `main` goes to production. The Vercel project uses Root Directory `.` and Framework Preset `Services`; `vercel.json` defines the two services and turns on Fluid compute (`"fluid": true`), which gives a streamed reply up to 300 s. Environment variables on Vercel (Preview and Production):

- `OPENROUTER_API_KEY`: the OpenRouter key.
- `OPENROUTER_MODEL`: optional; without it the API uses `google/gemma-4-26b-a4b-it`.

### Setup outside the code

- **Firewall rule "Chat rate limit"** (Vercel WAF, set once per project): Request Path equals `/api/chat` AND Method equals `POST` → rate limit by IP, fixed window 10 minutes, 20 requests → HTTP 429, persistent for 1 hour. The Hobby plan allows one rate-limit rule with a window of at most 10 minutes, so the 1-hour block stands in for "20 per hour". The rule is live on this project (created 2026-11-21). To create it on a new project, use the Vercel CLI (checked with version 64.0.2; the first command stages a draft, the second makes it live):

  ```bash
  vercel firewall rules add "Chat rate limit" --condition '{"type":"path","op":"eq","value":"/api/chat"}' --condition '{"type":"method","op":"eq","value":"POST"}' --action rate_limit --rate-limit-window 600 --rate-limit-requests 20 --rate-limit-keys ip --rate-limit-algo fixed_window --rate-limit-action rate_limit --duration 1h --yes
  ```

  ```bash
  vercel firewall publish --yes
  ```

  Or in the dashboard: project → Firewall → New Rule → the same settings → Save → Review Changes → Publish. Details: [docs/learning/02-streaming-chat.md](docs/learning/02-streaming-chat.md).

## Visual feedback

- **Preview deploys:** open the preview URL from the pull request, then use the Vercel Toolbar's Comment tool. The coding agent reads these comments through the Vercel MCP.
- **Local dev:** `npm run dev` shows the sv-agentation button (bottom right; press `i` to inspect). Click an element, write a note, then copy the notes as Markdown into the chat. It loads in dev mode only and is not in production builds.

## Docs

- Plan: [PRD](docs/PRD.md) ([issue #1](https://github.com/v1d1tt/sports-insight-bot/issues/1)), built in tickets #2 to #11
- Domain terms: [GLOSSARY.md](GLOSSARY.md); decisions: [docs/adr](docs/adr)
- Model choice: [docs/model-eval](docs/model-eval/README.md)
- How each slice works: [docs/learning](docs/learning)

## Author

Vidit Arora, Software Engineering student at DTU. Interests: full-stack development, AI/ML, systems programming.
