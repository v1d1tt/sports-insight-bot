# Sports Insight Bot

A cricket-first sports Analyst you chat with. You ask about a match, a tactic or a screenshot, and the Analyst explains it. For cricket it will also draw its answer on an interactive Ground (field placements and wagon wheels).

**Status (Nov 2026): rebuild in progress.** The app is being rebuilt in 10 vertical slices. Slice 01, the walking skeleton, is done: the page asks the API for its health and shows **"Analyst online"** with the model ID. The chat arrives in slice 02.

**Live:** https://sports-insight-bot.vercel.app

The old version (vanilla HTML/JS and a FastAPI server, deployed from two other repos) stopped working when its model lost all providers on OpenRouter. This repo replaces it.

## What works now

| Part | What it does |
|---|---|
| Web page | Loads, calls `GET /api/health`, shows "Analyst online" + the model ID, or "Analyst offline" if the API fails. |
| API | `GET /api/health` returns `{"status": "ok", "model": "<model ID>"}`. The model ID comes from the `OPENROUTER_MODEL` environment variable (default `google/gemma-4-26b-a4b-it`). |
| CI | Every push and pull request runs ruff, pytest, svelte-check, Vitest and Playwright. `main` only accepts pull requests with a green check. |

## Stack

| Part | Choice | Why |
|---|---|---|
| Web page | Svelte 5 + Vite + TypeScript, static build | Small compiled UI, and a framework other than the usual React default. |
| API | Python 3.12, FastAPI, managed with uv, linted with ruff, tested with pytest | Typed request and response models; uv gives one lockfile and fast installs. |
| Hosting | Vercel, one project with two Services (`frontend/`, `backend/`) | One URL, no CORS, preview deploys for feedback. See [ADR 0002](docs/adr/0002-vercel-for-both-frontend-and-api.md). |
| Model | `google/gemma-4-26b-a4b-it` on OpenRouter | Picked by a 6-model test: best text answers, only clean pass on the field JSON task, cheapest. See [docs/model-eval](docs/model-eval/README.md). |
| Tests | pytest, Vitest + Testing Library, Playwright | One test layer per part: API, component, whole page in a real browser. |
| Visual feedback | Vercel Toolbar comments (preview deploys), sv-agentation (local dev only) | The owner leaves notes on the running page, and the coding agent reads and fixes them. |

## Repo layout

```
frontend/                 Svelte 5 + Vite + TypeScript page (static build)
  src/lib/AnalystStatus.svelte   asks the API for its health
  e2e/                    Playwright tests
backend/                  FastAPI API, served under /api
  app/main.py             routes (GET /api/health)
  app/config.py           settings from environment variables
  tests/                  pytest tests
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

   `.env` holds your OpenRouter key (`OPENROUTER_API_KEY`, needed from slice 02) and the model ID. It is git-ignored. The API runs at http://127.0.0.1:8000/api/health.

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

The Playwright test mocks `/api/health`, so it does not need the API to run. CI runs all of these on every push and pull request ([workflow](.github/workflows/ci.yml)).

## Deploy

Vercel builds from GitHub. Each pull request gets a preview URL, and `main` goes to production. The Vercel project uses Root Directory `.` and Framework Preset `Services`; `vercel.json` defines the two services. Environment variables on Vercel:

- `OPENROUTER_API_KEY`: the OpenRouter key (needed from slice 02).
- `OPENROUTER_MODEL`: optional; without it the API uses `google/gemma-4-26b-a4b-it`.

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
